// parent-login — lets a parent sign in with their mobile number.
//
// Parents choose phone or email on the login screen. Email goes straight to
// Supabase from the app. Phone comes here, because the number has to be
// matched to an account, and doing that lookup in the app would let anyone
// type numbers to discover which parents are registered and under which email.
//
// This function never reveals whether a number exists: a wrong number and a
// wrong password return the same message.
//
// Deploy (no session exists yet, so JWT verification must be off):
//   supabase functions deploy parent-login --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Admin client: used only to look up which account owns the phone number.
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return `+91${d}`;
}

// Same message whatever goes wrong, so the response can't be used to tell
// "no such number" from "wrong password".
const GENERIC = 'Mobile number or password is incorrect.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    const password = String(body.password ?? '');
    if (!phone || password.length === 0) return json({ error: GENERIC }, 401);

    // Which parent owns this number?
    const { data: parent, error: parentErr } = await admin
      .from('parent_users')
      .select('auth_user_id')
      .eq('phone', phone)
      .maybeSingle();
    if (parentErr) {
      console.error(parentErr);
      return json({ error: 'Something went wrong. Try again.' }, 500);
    }
    if (!parent?.auth_user_id) return json({ error: GENERIC }, 401);

    // Their sign-in email (either a real one or the internal phone-based one).
    const { data: userRes } = await admin.auth.admin.getUserById(parent.auth_user_id);
    const email = userRes?.user?.email;
    if (!email) return json({ error: GENERIC }, 401);

    // Sign in as the parent would from the app. Uses the public anon key, so
    // Supabase's own auth rate limits and lockouts still apply.
    const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } =
      await anon.auth.signInWithPassword({ email, password });

    if (signInErr || !signIn.session) {
      const msg = signInErr?.message || '';
      // A banned account is worth naming: the parent can't fix it themselves.
      if (/banned|disabled/i.test(msg)) {
        return json({ error: 'This account has been deactivated. Contact your school office.' }, 403);
      }
      return json({ error: GENERIC }, 401);
    }

    // The app restores the session from the refresh token.
    return json({
      refresh_token: signIn.session.refresh_token,
      access_token: signIn.session.access_token,
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
});

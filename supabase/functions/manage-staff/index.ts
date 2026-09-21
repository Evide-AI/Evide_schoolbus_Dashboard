// manage-staff — create and manage driver / conductor logins.
//
// Called by the management dashboard with the manager's own session token.
// Every action checks that the caller is a management user and that the
// driver / bus belongs to the caller's school before touching anything.
//
// Drivers log in with phone number + password. Supabase's built-in phone login
// needs a paid SMS provider, so each phone maps to an internal email:
//   +91 99474 96965  ->  919947496965@driver.evide.in
// The driver never sees this; the app converts the phone number the same way.
//
// Deploy:  supabase functions deploy manage-staff
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN_EMAIL_DOMAIN = 'driver.evide.in';
const ROLES = ['driver', 'conductor'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Accepts "9947496965", "+91 99474 96965", "099474-96965", "919947496965".
// Returns "+919947496965" or null.
function normalizePhone(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return `+91${d}`;
}

function loginEmail(phone: string) {
  return `${phone.replace(/\D/g, '')}@${LOGIN_EMAIL_DOMAIN}`;
}

// Easy to read aloud and type on a phone: 4 letters + 4 digits, no look-alikes.
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  for (let i = 0; i < 4; i++) out += letters[bytes[i] % letters.length];
  for (let i = 4; i < 8; i++) out += String(bytes[i] % 10);
  return out;
}

function checkPassword(pw: unknown): string {
  const p = String(pw ?? '');
  if (p.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (p.length > 72) throw new HttpError(400, 'Password is too long.');
  return p;
}

function cleanName(v: unknown): string {
  const name = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError(400, 'Name is required.');
  if (name.length > 120) throw new HttpError(400, 'Name is too long.');
  return name;
}

function cleanRole(v: unknown): string {
  const role = String(v ?? '');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be driver or conductor.');
  return role;
}

async function callerSchoolId(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not signed in.');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Your session has expired. Sign in again.');

  const { data: mu, error: muErr } = await admin
    .from('management_users').select('school_id').eq('auth_user_id', user.id).maybeSingle();
  if (muErr) throw new HttpError(500, muErr.message);
  if (!mu?.school_id) throw new HttpError(403, 'Only school management can manage drivers.');
  return mu.school_id;
}

async function assertBusInSchool(busId: unknown, schoolId: string): Promise<string | null> {
  if (busId === null || busId === undefined || busId === '') return null;
  const { data, error } = await admin.from('buses').select('id, school_id').eq('id', busId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || data.school_id !== schoolId) throw new HttpError(400, 'That bus is not in your school.');
  return data.id;
}

async function loadStaff(id: unknown, schoolId: string) {
  const { data, error } = await admin
    .from('drivers').select('id, auth_user_id, school_id, phone, full_name').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || data.school_id !== schoolId) throw new HttpError(404, 'Driver not found.');
  return data;
}

async function phoneTaken(phone: string, exceptId?: string) {
  let q = admin.from('drivers').select('id').eq('phone', phone);
  if (exceptId) q = q.neq('id', exceptId);
  const { data, error } = await q.limit(1);
  if (error) throw new HttpError(500, error.message);
  return (data || []).length > 0;
}

const STAFF_COLUMNS = 'id, full_name, phone, role, bus_id, is_active, created_at';

// ---------------------------------------------------------------- actions

async function createStaff(body: any, schoolId: string) {
  const full_name = cleanName(body.full_name);
  const role = cleanRole(body.role);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
  const bus_id = await assertBusInSchool(body.bus_id, schoolId);
  const password = body.password ? checkPassword(body.password) : generatePassword();

  if (await phoneTaken(phone)) throw new HttpError(409, 'This phone number already has a driver or conductor account.');

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: loginEmail(phone),
    password,
    email_confirm: true,
    user_metadata: { account_type: 'staff', role, full_name, phone },
  });
  if (authErr || !created?.user) {
    const msg = authErr?.message || 'Could not create the login.';
    if (/already.*registered|already exists/i.test(msg)) {
      throw new HttpError(409, 'A login for this phone number already exists. Contact Evide support to clear it.');
    }
    throw new HttpError(500, msg);
  }

  const { data: row, error: insErr } = await admin.from('drivers').insert({
    auth_user_id: created.user.id,
    school_id: schoolId,
    full_name,
    phone,
    role,
    bus_id,
    is_active: true,
  }).select(STAFF_COLUMNS).single();

  if (insErr) {
    // Roll back the login so a retry with the same phone works.
    await admin.auth.admin.deleteUser(created.user.id);
    throw new HttpError(insErr.code === '23505' ? 409 : 500,
      insErr.code === '23505' ? 'This phone number already has a driver or conductor account.' : insErr.message);
  }

  return { staff: row, password };
}

async function updateStaff(body: any, schoolId: string) {
  const current = await loadStaff(body.id, schoolId);
  const patch: Record<string, unknown> = {};

  if ('full_name' in body) patch.full_name = cleanName(body.full_name);
  if ('role' in body) patch.role = cleanRole(body.role);
  if ('bus_id' in body) patch.bus_id = await assertBusInSchool(body.bus_id, schoolId);

  let newPhone: string | null = null;
  if ('phone' in body) {
    newPhone = normalizePhone(body.phone);
    if (!newPhone) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
    if (newPhone !== current.phone) {
      if (await phoneTaken(newPhone, current.id)) {
        throw new HttpError(409, 'This phone number already has a driver or conductor account.');
      }
      patch.phone = newPhone;
    } else {
      newPhone = null;
    }
  }

  // Phone is the login, so change the auth account first.
  if (newPhone && current.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, {
      email: loginEmail(newPhone),
      email_confirm: true,
    });
    if (error) throw new HttpError(500, `Could not change the login phone: ${error.message}`);
  }

  const { data, error } = await admin.from('drivers').update(patch).eq('id', current.id).select(STAFF_COLUMNS).single();
  if (error) {
    // Put the old login back if the row update failed after a phone change.
    if (newPhone && current.auth_user_id && current.phone) {
      await admin.auth.admin.updateUserById(current.auth_user_id, { email: loginEmail(current.phone), email_confirm: true });
    }
    throw new HttpError(500, error.message);
  }
  return { staff: data };
}

async function resetPassword(body: any, schoolId: string) {
  const current = await loadStaff(body.id, schoolId);
  if (!current.auth_user_id) throw new HttpError(400, 'This person has no login yet.');
  const password = body.password ? checkPassword(body.password) : generatePassword();
  const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, { password });
  if (error) throw new HttpError(500, error.message);
  return { password };
}

async function setActive(body: any, schoolId: string) {
  const current = await loadStaff(body.id, schoolId);
  const active = Boolean(body.active);
  if (current.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, {
      ban_duration: active ? 'none' : '876000h', // ~100 years
    });
    if (error) throw new HttpError(500, error.message);
  }
  const { data, error } = await admin.from('drivers').update({ is_active: active })
    .eq('id', current.id).select(STAFF_COLUMNS).single();
  if (error) throw new HttpError(500, error.message);
  return { staff: data };
}

async function removeStaff(body: any, schoolId: string) {
  const current = await loadStaff(body.id, schoolId);
  const { error } = await admin.from('drivers').delete().eq('id', current.id);
  if (error) {
    if (error.code === '23503') {
      throw new HttpError(409, 'This person has attendance records, so they can\'t be removed. Deactivate their account instead.');
    }
    throw new HttpError(500, error.message);
  }
  if (current.auth_user_id) await admin.auth.admin.deleteUser(current.auth_user_id);
  return { ok: true };
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const schoolId = await callerSchoolId(req);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case 'create': return json(await createStaff(body, schoolId));
      case 'update': return json(await updateStaff(body, schoolId));
      case 'reset_password': return json(await resetPassword(body, schoolId));
      case 'set_active': return json(await setActive(body, schoolId));
      case 'remove': return json(await removeStaff(body, schoolId));
      default: throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    if (status >= 500) console.error(e);
    return json({ error: message }, status);
  }
});

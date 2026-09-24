// manage-parents — parent accounts, child links, and password resets.
//
// Called by the management dashboard with the manager's own session token.
// Every action checks that the caller is a management user and that the parent,
// student and bus belong to that same school.
//
// Parents sign in with email + password (the parent app's login screen). When
// a school adds a parent with only a phone number, we create an internal login
// email from it, the same scheme the driver app uses:
//   +91 99474 96965  ->  919947496965@parent.evide.in
//
// Deploy:  supabase functions deploy manage-parents

import { createClient } from 'npm:@supabase/supabase-js@2';

const LOGIN_EMAIL_DOMAIN = 'parent.evide.in';

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

async function callerSchoolId(req: Request): Promise<string> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Not signed in.');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Your session has expired. Sign in again.');

  const { data: mu, error: muErr } = await admin
    .from('management_users').select('school_id').eq('auth_user_id', user.id).maybeSingle();
  if (muErr) throw new HttpError(500, muErr.message);
  if (!mu?.school_id) throw new HttpError(403, 'Only school management can manage parents.');
  return mu.school_id;
}

async function loadParent(id: unknown, schoolId: string) {
  const { data, error } = await admin
    .from('parent_users').select('id, auth_user_id, school_id, full_name, phone')
    .eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || data.school_id !== schoolId) throw new HttpError(404, 'Parent not found.');
  return data;
}

async function assertStudentsInSchool(studentIds: string[], schoolId: string) {
  if (studentIds.length === 0) return;
  const { data, error } = await admin
    .from('students').select('id').eq('school_id', schoolId).in('id', studentIds);
  if (error) throw new HttpError(500, error.message);
  if ((data || []).length !== studentIds.length) {
    throw new HttpError(400, 'One of those students is not in your school.');
  }
}

// Parents are listed here rather than straight from the browser, because their
// login email lives in auth.users, which the dashboard can't read.
async function listParents(schoolId: string) {
  const { data: parents, error } = await admin
    .from('parent_users').select('id, auth_user_id, full_name, phone, created_at')
    .eq('school_id', schoolId).order('full_name');
  if (error) throw new HttpError(500, error.message);

  const ids = (parents || []).map((p) => p.id);
  let links: { parent_user_id: string; student_id: string }[] = [];
  if (ids.length > 0) {
    const { data } = await admin
      .from('parent_student_links').select('parent_user_id, student_id').in('parent_user_id', ids);
    links = data || [];
  }

  // Login email + disabled state, one lookup per parent.
  const withLogin = await Promise.all((parents || []).map(async (p) => {
    let email: string | null = null;
    let disabled = false;
    if (p.auth_user_id) {
      const { data } = await admin.auth.admin.getUserById(p.auth_user_id);
      email = data?.user?.email ?? null;
      const until = (data?.user as { banned_until?: string } | undefined)?.banned_until;
      disabled = Boolean(until && new Date(until) > new Date());
    }
    return {
      ...p,
      email,
      is_active: !disabled,
      student_ids: links.filter((l) => l.parent_user_id === p.id).map((l) => l.student_id),
    };
  }));

  return { parents: withLogin };
}

async function createParent(body: any, schoolId: string) {
  const full_name = cleanName(body.full_name);
  const phone = normalizePhone(body.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
  const studentIds: string[] = Array.isArray(body.student_ids) ? body.student_ids : [];
  await assertStudentsInSchool(studentIds, schoolId);

  const email = String(body.email || '').trim() || loginEmail(phone);
  const password = body.password ? checkPassword(body.password) : generatePassword();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: 'parent', full_name, phone },
  });
  if (authErr || !created?.user) {
    const msg = authErr?.message || 'Could not create the login.';
    if (/already.*registered|already exists/i.test(msg)) {
      throw new HttpError(409, 'A login already exists for that email or phone number.');
    }
    throw new HttpError(500, msg);
  }

  const { data: row, error: insErr } = await admin.from('parent_users').insert({
    auth_user_id: created.user.id,
    school_id: schoolId,
    full_name,
    phone,
  }).select('id, full_name, phone').single();

  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id); // roll back the login
    throw new HttpError(500, insErr.message);
  }

  if (studentIds.length > 0) {
    await admin.from('parent_student_links')
      .insert(studentIds.map((student_id) => ({ parent_user_id: row.id, student_id })));
  }

  return { parent: { ...row, email }, password };
}

async function updateParent(body: any, schoolId: string) {
  const current = await loadParent(body.id, schoolId);
  const patch: Record<string, unknown> = {};
  if ('full_name' in body) patch.full_name = cleanName(body.full_name);
  if ('phone' in body) {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
    patch.phone = phone;
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('parent_users').update(patch).eq('id', current.id);
    if (error) throw new HttpError(500, error.message);
  }

  // Children: replace the whole set when provided.
  if (Array.isArray(body.student_ids)) {
    await assertStudentsInSchool(body.student_ids, schoolId);
    await admin.from('parent_student_links').delete().eq('parent_user_id', current.id);
    if (body.student_ids.length > 0) {
      const { error } = await admin.from('parent_student_links')
        .insert(body.student_ids.map((student_id: string) => ({ parent_user_id: current.id, student_id })));
      if (error) throw new HttpError(500, error.message);
    }
  }
  return { ok: true };
}

async function resetParentPassword(body: any, schoolId: string) {
  const current = await loadParent(body.id, schoolId);
  if (!current.auth_user_id) throw new HttpError(400, 'This parent has no login yet.');
  const password = body.password ? checkPassword(body.password) : generatePassword();
  const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, { password });
  if (error) throw new HttpError(500, error.message);

  // Close any open reset requests for this parent.
  await admin.from('password_reset_requests')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('parent_user_id', current.id).eq('status', 'pending');

  return { password, parent: current };
}

async function setParentActive(body: any, schoolId: string) {
  const current = await loadParent(body.id, schoolId);
  const active = Boolean(body.active);
  if (current.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, {
      ban_duration: active ? 'none' : '876000h',
    });
    if (error) throw new HttpError(500, error.message);
  }
  return { ok: true };
}

async function removeParent(body: any, schoolId: string) {
  const current = await loadParent(body.id, schoolId);
  await admin.from('parent_student_links').delete().eq('parent_user_id', current.id);
  const { error } = await admin.from('parent_users').delete().eq('id', current.id);
  if (error) throw new HttpError(500, error.message);
  if (current.auth_user_id) await admin.auth.admin.deleteUser(current.auth_user_id);
  return { ok: true };
}

async function dismissRequest(body: any, schoolId: string) {
  const { data, error } = await admin
    .from('password_reset_requests').select('id, school_id').eq('id', body.id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data || data.school_id !== schoolId) throw new HttpError(404, 'Request not found.');
  const { error: updErr } = await admin.from('password_reset_requests')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', body.id);
  if (updErr) throw new HttpError(500, updErr.message);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const schoolId = await callerSchoolId(req);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case 'list': return json(await listParents(schoolId));
      case 'create': return json(await createParent(body, schoolId));
      case 'update': return json(await updateParent(body, schoolId));
      case 'reset_password': return json(await resetParentPassword(body, schoolId));
      case 'set_active': return json(await setParentActive(body, schoolId));
      case 'remove': return json(await removeParent(body, schoolId));
      case 'dismiss_request': return json(await dismissRequest(body, schoolId));
      default: throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    if (status >= 500) console.error(e);
    return json({ error: message }, status);
  }
});

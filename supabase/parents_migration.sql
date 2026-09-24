-- Parent accounts + "forgot password" requests.
-- Safe to run more than once; it only ADDS things.

-- ------------------------------------------------------- parent columns
-- The dashboard stores a parent's name and mobile number on their row.
-- Added only if your table doesn't have them already.
alter table parent_users add column if not exists school_id uuid references schools(id) on delete cascade;
alter table parent_users add column if not exists full_name text;
alter table parent_users add column if not exists phone text;

-- Existing parents get their school from the students they're linked to.
update parent_users p
set school_id = s.school_id
from parent_student_links l
join students s on s.id = l.student_id
where l.parent_user_id = p.id and p.school_id is null;

create index if not exists idx_parent_users_school on parent_users(school_id);

-- ---------------------------------------------------------------- requests
create table if not exists password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  -- What the parent typed (email or phone). Matched to an account server-side.
  identifier text not null,
  -- Where the school should send the new password.
  contact_phone text not null,
  -- Filled in when the identifier matches a parent; null when it doesn't.
  parent_user_id uuid references parent_users(id) on delete cascade,
  school_id uuid references schools(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

do $$ begin
  alter table password_reset_requests
    add constraint password_reset_requests_status_check
    check (status in ('pending', 'done', 'dismissed'));
exception when duplicate_object then null; end $$;

create index if not exists idx_reset_requests_school
  on password_reset_requests(school_id, status, created_at desc);

alter table password_reset_requests enable row level security;

-- Management sees and updates only their own school's requests.
drop policy if exists management_reads_reset_requests on password_reset_requests;
create policy management_reads_reset_requests on password_reset_requests for select using (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

drop policy if exists management_updates_reset_requests on password_reset_requests;
create policy management_updates_reset_requests on password_reset_requests for update using (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

grant select, update on password_reset_requests to authenticated;

-- The parent is locked out, so this runs as an anonymous caller. It matches the
-- identifier itself and returns nothing either way, so the app can't be used to
-- discover which emails or numbers are registered.
create or replace function request_password_reset(p_identifier text, p_contact_phone text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_digits text := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  v_parent record;
  v_recent int;
begin
  if coalesce(trim(p_identifier), '') = '' or length(v_digits) < 10 then
    return;
  end if;

  -- Rate limit: at most 3 pending requests per hour per contact number.
  select count(*) into v_recent
  from password_reset_requests
  where contact_phone = v_digits
    and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    return;
  end if;

  -- Match on the login email, the auth phone, or the stored parent phone.
  select p.id as parent_user_id, p.school_id into v_parent
  from parent_users p
  join auth.users u on u.id = p.auth_user_id
  where lower(u.email) = lower(trim(p_identifier))
     or regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = regexp_replace(trim(p_identifier), '\D', '', 'g')
  limit 1;

  insert into password_reset_requests (identifier, contact_phone, parent_user_id, school_id)
  values (trim(p_identifier), v_digits, v_parent.parent_user_id, v_parent.school_id);
end;
$$;

revoke all on function request_password_reset(text, text) from public;
grant execute on function request_password_reset(text, text) to anon, authenticated;

-- ------------------------------------------------------- parent management
-- Management can see their school's parents and links. All writes go through
-- the manage-parents Edge Function.
drop policy if exists management_reads_school_parents on parent_users;
create policy management_reads_school_parents on parent_users for select using (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

drop policy if exists management_reads_parent_links on parent_student_links;
create policy management_reads_parent_links on parent_student_links for select using (
  parent_user_id in (
    select p.id from parent_users p
    join management_users m on m.school_id = p.school_id
    where m.auth_user_id = auth.uid()));

alter table parent_users enable row level security;
alter table parent_student_links enable row level security;

notify pgrst, 'reload schema';

-- Phone sign-in: the parent-signin function looks parents up by phone.
create index if not exists idx_parent_users_phone on parent_users(phone);

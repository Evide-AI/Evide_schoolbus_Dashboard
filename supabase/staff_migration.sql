-- Drivers & conductors managed from the dashboard.
-- Safe to run more than once. It only ADDS columns/policies; nothing is dropped.
--
-- Conductors live in the same `drivers` table with role = 'conductor', so every
-- existing driver policy (own bus students, attendance) applies to them too.

alter table drivers add column if not exists school_id uuid references schools(id) on delete cascade;
alter table drivers add column if not exists full_name text;
alter table drivers add column if not exists phone text;
alter table drivers add column if not exists role text not null default 'driver';
alter table drivers add column if not exists is_active boolean not null default true;
alter table drivers add column if not exists created_at timestamptz not null default now();

-- A driver can exist before being put on a bus.
alter table drivers alter column bus_id drop not null;

do $$ begin
  alter table drivers add constraint drivers_role_check check (role in ('driver', 'conductor'));
exception when duplicate_object then null; end $$;

-- Backfill school for any existing drivers from their bus.
update drivers d set school_id = b.school_id
from buses b
where d.bus_id = b.id and d.school_id is null;

-- One account per phone number (phones are stored as +91XXXXXXXXXX).
create unique index if not exists drivers_phone_unique on drivers(phone) where phone is not null;
create index if not exists idx_drivers_school on drivers(school_id);

-- Management can SEE their school's drivers/conductors.
-- All changes (create, edit, reset password, deactivate, remove) go through the
-- manage-staff Edge Function, which checks the school before writing.
drop policy if exists management_reads_school_drivers on drivers;
create policy management_reads_school_drivers on drivers for select using (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

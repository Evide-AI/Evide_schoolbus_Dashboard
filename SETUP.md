# Management Dashboard — Setup

Vite + React dashboard for school transport management. Talks directly to your
Supabase project (the same one the backend uses).

## 1. Install & run

```
cd management-dashboard
npm install
npm run dev
```

Opens at http://localhost:5173. The `.env` file already has your Supabase URL
and anon key. (For production, set the same two vars in your host's env.)

## 2. Schema updates required

This dashboard needs two additions to the schema you already ran. If you ran
the original `schema.sql`, apply this migration in the Supabase SQL editor.
If you're running the latest `schema.sql` fresh, it's already included —
skip this.

```sql
-- Bus status (running / not_running / maintenance)
alter table buses add column if not exists status text not null default 'not_running'
  check (status in ('running', 'not_running', 'maintenance'));

-- Attendance table (marked by drivers, counted by the dashboard)
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  bus_id uuid not null references buses(id) on delete cascade,
  date date not null,
  present boolean not null default false,
  marked_by uuid references drivers(id),
  marked_at timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists idx_attendance_bus_date on attendance(bus_id, date);
create index if not exists idx_attendance_student_date on attendance(student_id, date);

alter table attendance enable row level security;

create policy driver_reads_own_bus_attendance on attendance for select using (
  bus_id in (select bus_id from drivers where auth_user_id = auth.uid()));
create policy driver_writes_own_bus_attendance on attendance for insert with check (
  bus_id in (select bus_id from drivers where auth_user_id = auth.uid()));
create policy driver_updates_own_bus_attendance on attendance for update using (
  bus_id in (select bus_id from drivers where auth_user_id = auth.uid()));
create policy management_reads_school_attendance on attendance for select using (
  bus_id in (select id from buses where school_id in (
    select school_id from management_users where auth_user_id = auth.uid())));

create policy driver_sees_own_row on drivers for select using (auth_user_id = auth.uid());
create policy driver_sees_own_bus_students on students for select using (
  bus_id in (select bus_id from drivers where auth_user_id = auth.uid()));
```

(The complete, up-to-date `schema.sql` in the backend project already contains
all of this — this block is only for patching a database created from the
earlier version.)

## 3. Create accounts and link them (you do this in Supabase)

The dashboard logs in via Supabase Auth, then looks up the signed-in user in
`management_users`. So each manager needs BOTH an auth user AND a linked row.

**Step A — create the auth user:** Supabase Dashboard → Authentication →
Users → Add user → enter email + password (e.g. `manager@yourschool.com`).
Copy the new user's UID.

**Step B — create the school (once) and link the manager:** in the SQL editor,
replacing the UID and details:

```sql
-- Create your school (only once), with real coordinates
insert into schools (name, latitude, longitude)
values ('Your School Name', 10.9650, 76.0400)
returning id;   -- copy this school id for the next statement

-- Link the auth user to a management_users row
insert into management_users (school_id, auth_user_id, full_name, role)
values (
  'PASTE-SCHOOL-ID-HERE',
  'PASTE-AUTH-USER-UID-HERE',
  'Manager Name',
  'principal'
);
```

Now that user can log into the dashboard and will see that school's fleet.

**Drivers** (for the driver app) are linked the same way into the `drivers`
table; **parents** into `parent_users` + `parent_student_links`. Those are
covered in the driver-app and parent-app setup docs.

## What's tested

The data layer was verified against a local copy of your exact schema:
bus/student CRUD, per-bus student counts, present-today attendance counts,
and — importantly — that Row-Level Security correctly stops one school's
manager from seeing another school's data. The React app builds cleanly for
production. What you run yourself is the live login against your Supabase
(only your network can reach it).

## Notes on MVP scope

- **Bulk spreadsheet import** reads .xlsx/.csv in the browser, checks every
  row (required fields, duplicate admission numbers, coordinates, bus
  numbers) and inserts the valid rows. Available from the Students page and
  from each bus page.
- **Notifications** write a row to the `notifications` table immediately;
  turning those rows into phone push notifications is the backend dispatch
  worker's job (parent app + FCM).

-- Parent inbox: messages from management and drivers, plus attendance events.
-- Safe to run more than once.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  -- Null bus_id = everyone in the school. Set = only that bus's parents.
  bus_id uuid references buses(id) on delete cascade,
  -- Set for per-student events (attendance), null otherwise.
  student_id uuid references students(id) on delete cascade,
  category text not null default 'MESSAGE',
  title text not null,
  body text not null default '',
  sender_type text,          -- 'management' | 'driver' | 'system'
  sender_name text,
  created_at timestamptz not null default now()
);

-- Older installs may already have a simpler table.
alter table notifications add column if not exists school_id uuid references schools(id) on delete cascade;
alter table notifications add column if not exists bus_id uuid references buses(id) on delete cascade;
alter table notifications add column if not exists student_id uuid references students(id) on delete cascade;
alter table notifications add column if not exists category text not null default 'MESSAGE';
alter table notifications add column if not exists sender_type text;
alter table notifications add column if not exists sender_name text;

create index if not exists idx_notifications_school on notifications(school_id, created_at desc);
create index if not exists idx_notifications_bus on notifications(bus_id, created_at desc);
create index if not exists idx_notifications_student on notifications(student_id, created_at desc);

alter table notifications enable row level security;
grant select on notifications to authenticated;
grant insert on notifications to authenticated;

-- The policy below reads these tables as the signed-in user, so the read
-- privilege has to exist even though RLS still restricts the rows.
grant select on parent_student_links, parent_users, students to authenticated;

-- Parents must be able to read their own row, their own links, and their own
-- children. Without these, turning on row-level security locks the parent app
-- out of its own data — including the children list on the map screen.
drop policy if exists parents_read_own_row on parent_users;
create policy parents_read_own_row on parent_users for select using (
  auth_user_id = auth.uid());

drop policy if exists parents_read_own_links on parent_student_links;
create policy parents_read_own_links on parent_student_links for select using (
  parent_user_id in (select id from parent_users where auth_user_id = auth.uid()));

drop policy if exists parents_read_own_students on students;
create policy parents_read_own_students on students for select using (
  id in (
    select l.student_id from parent_student_links l
    join parent_users p on p.id = l.parent_user_id
    where p.auth_user_id = auth.uid()));

-- A parent sees: school-wide messages, messages for a bus their child rides,
-- and events about their own child. Nothing else.
drop policy if exists parents_read_notifications on notifications;
create policy parents_read_notifications on notifications for select using (
  exists (
    select 1
    from parent_student_links l
    join parent_users p on p.id = l.parent_user_id
    join students s on s.id = l.student_id
    where p.auth_user_id = auth.uid()
      and (
        notifications.student_id = s.id
        or (notifications.student_id is null and notifications.bus_id = s.bus_id)
        or (notifications.student_id is null and notifications.bus_id is null
            and notifications.school_id = s.school_id)
      )
  ));

-- Management: read and send anything in their own school.
drop policy if exists management_reads_notifications on notifications;
create policy management_reads_notifications on notifications for select using (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

drop policy if exists management_sends_notifications on notifications;
create policy management_sends_notifications on notifications for insert with check (
  school_id in (select school_id from management_users where auth_user_id = auth.uid()));

-- Drivers and conductors: only to the bus they're assigned to.
drop policy if exists drivers_send_bus_notifications on notifications;
create policy drivers_send_bus_notifications on notifications for insert with check (
  bus_id is not null
  and bus_id in (select bus_id from drivers where auth_user_id = auth.uid() and is_active));

drop policy if exists drivers_read_bus_notifications on notifications;
create policy drivers_read_bus_notifications on notifications for select using (
  bus_id in (select bus_id from drivers where auth_user_id = auth.uid()));

-- ------------------------------------------------- push for every new row
-- Hands the row to the backend's existing pg-boss queue, so notifications go
-- out through the FCM path that already works. Wrapped in an exception block:
-- if the queue is unavailable the message is still saved to the inbox.
create or replace function queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, pgboss
as $$
begin
  begin
    insert into pgboss.job (name, data)
    values (
      'dispatch-notification',
      jsonb_build_object(
        'type', new.category,
        'title', new.title,
        'body', new.body,
        'notificationId', new.id::text,
        'studentId', new.student_id::text,
        'busId', new.bus_id::text,
        'schoolId', new.school_id::text
      )
    );
  exception when others then
    raise warning 'Could not queue push for notification %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notifications_push on notifications;
create trigger notifications_push after insert on notifications
for each row execute function queue_notification_push();

-- ------------------------------------------------ attendance -> inbox entry
-- One entry per pickup/drop event, written automatically when the driver marks
-- a student. Adjust the column names below if your attendance table differs.
create or replace function attendance_to_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_label text;
begin
  select s.id, s.full_name, s.bus_id, s.school_id into v_student
  from students s where s.id = new.student_id;
  if v_student.id is null then return new; end if;

  v_label := case
    when new.status in ('boarded', 'picked_up', 'present') then 'boarded the bus'
    when new.status in ('dropped', 'alighted', 'dropped_off') then 'got off the bus'
    when new.status = 'absent' then 'was marked absent'
    else 'attendance updated'
  end;

  insert into notifications (school_id, bus_id, student_id, category, title, body, sender_type, sender_name)
  values (
    v_student.school_id,
    v_student.bus_id,
    v_student.id,
    'ATTENDANCE',
    v_student.full_name || ' ' || v_label,
    to_char(coalesce(new.marked_at, now()) at time zone 'Asia/Kolkata', 'DD Mon, hh12:MI am'),
    'system',
    null
  );
  return new;
end;
$$;

drop trigger if exists attendance_notifies_parents on attendance;
create trigger attendance_notifies_parents after insert on attendance
for each row execute function attendance_to_notification();

notify pgrst, 'reload schema';

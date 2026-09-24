-- Live bus positions over WebSocket + phone login for parents.
-- Safe to run more than once.

-- ------------------------------------------------- realtime (WebSocket) feed
-- Supabase Realtime only streams tables that are in this publication. Without
-- it the app's subscription connects fine but never receives a row, which
-- looks exactly like "tracking isn't live".
do $$ begin
  alter publication supabase_realtime add table bus_live_position;
exception
  when duplicate_object then null;   -- already published
  when undefined_object then null;   -- publication missing (self-hosted)
end $$;

-- UPDATE events carry the full new row (needed: the app reads every column).
alter table bus_live_position replica identity full;

-- Parents may read the live position of a bus one of their children rides.
drop policy if exists parents_read_bus_live_position on bus_live_position;
create policy parents_read_bus_live_position on bus_live_position for select using (
  bus_id in (
    select s.bus_id
    from parent_student_links l
    join parent_users p on p.id = l.parent_user_id
    join students s on s.id = l.student_id
    where p.auth_user_id = auth.uid()
  ));

alter table bus_live_position enable row level security;
grant select on bus_live_position to authenticated;

-- ------------------------------------------------------------- phone login
-- Parents can sign in with either their email or their mobile number. The
-- number is resolved to the account by the parent-login Edge Function, never
-- in the app, so nobody can type numbers to discover which are registered.
create index if not exists idx_parent_users_phone on parent_users(phone);

notify pgrst, 'reload schema';

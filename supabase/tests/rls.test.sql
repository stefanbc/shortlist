-- RLS: jurors only see their own scores and their assigned events; admins read everything.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Test helpers (rolled back with the transaction).
create schema tests;
grant usage on schema tests to authenticated, anon;
-- The role goes in app metadata (service-role only), as the admin-users function does.
create function tests.create_user(p_id uuid, p_name text, p_role text) returns uuid
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          lower(replace(p_name, ' ', '.')) || '@test.invalid',
          jsonb_build_object('display_name', p_name), jsonb_build_object('role', p_role), now(), now())
  returning id;
$$;
-- Switches the session to an authenticated user (call `reset role` to return to postgres).
create function tests.authenticate_as(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
grant execute on all functions in schema tests to authenticated;

-- Fixture: admin, jurors A and B on event 1, juror C on event 2 only.
select tests.create_user('00000000-0000-0000-0000-0000000000a1', 'Ada Admin', 'admin');
select tests.create_user('00000000-0000-0000-0000-0000000000b1', 'Juror A', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b2', 'Juror B', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b3', 'Juror C', 'juror');

insert into events (id, name, starts_at, ends_at) values
  ('10000000-0000-0000-0000-000000000001', 'Event 1', now() - interval '1 hour', now() + interval '1 hour'),
  ('10000000-0000-0000-0000-000000000002', 'Event 2', now() - interval '1 hour', now() + interval '1 hour');
insert into criteria (id, event_id, name, weight, position) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Originality', 90, 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Demo', 100, 2),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Other', 10, 1);
insert into teams (id, event_id, name, pitch_order) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team 1', 1),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Team 2', 1);
insert into projects (team_id, name) values
  ('30000000-0000-0000-0000-000000000001', 'Project 1'),
  ('30000000-0000-0000-0000-000000000002', 'Project 2');
insert into event_jurors (event_id, juror_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3');
insert into scores (event_id, team_id, criterion_id, juror_id, value, tapped_at) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 4, now()),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 3.5, now()),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 2, now()),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 5, now());
insert into juror_notes (team_id, juror_id, body) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'B private note');

-- ---------------------------------------------------------------- juror A
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from scores where juror_id = '00000000-0000-0000-0000-0000000000b2'),
  0, 'juror A cannot select juror B''s scores');

select is(
  (select count(*)::int from scores),
  2, 'juror A sees exactly their own scores');

select results_eq(
  $$ select name from events $$,
  $$ values ('Event 1') $$,
  'juror cannot see events they are not assigned to');

select is(
  (select count(*)::int from teams) + (select count(*)::int from projects) + (select count(*)::int from criteria),
  1 + 1 + 2, 'juror sees only teams, projects and criteria of assigned events');

select throws_ok(
  $$ insert into scores (event_id, team_id, criterion_id, juror_id, value, tapped_at)
     values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 1, now()) $$,
  '42501', null, 'juror cannot insert into scores directly');

select throws_ok(
  $$ update scores set value = 1 where juror_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'juror cannot update scores directly');

update criteria set weight = 1 where id = '20000000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select count(*)::int from juror_notes), 0, 'juror cannot read another juror''s notes');

select lives_ok(
  $$ insert into juror_notes (team_id, juror_id, body)
     values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'my note') $$,
  'juror can write their own note');

select throws_ok(
  $$ insert into juror_notes (team_id, juror_id, body)
     values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'not my event') $$,
  '42501', null, 'juror cannot write a note for a team outside their events');

select results_eq(
  $$ select id from profiles $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'juror sees only their own profile');

select is(
  (select count(*)::int from audit_log) + (select count(*)::int from juror_tokens),
  0, 'juror cannot read audit_log or juror_tokens');

reset role;

select is(
  (select weight from criteria where id = '20000000-0000-0000-0000-000000000001'),
  90::numeric, 'juror cannot update criteria');

select is(
  (select role from profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'juror', 'juror cannot change their own role');

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok(
  $$ select count(*) from events $$, '42501', null, 'anon cannot read events');
reset role;

-- ---------------------------------------------------------------- admin
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from scores), 4, 'admin sees all scores');

delete from event_jurors
where event_id = '10000000-0000-0000-0000-000000000001'
  and juror_id = '00000000-0000-0000-0000-0000000000b2';

select is(
  (select count(*)::int from scores where juror_id = '00000000-0000-0000-0000-0000000000b2'),
  2, 'removed juror''s scores still visible to admin after event_jurors delete');

reset role;

select * from finish();
rollback;

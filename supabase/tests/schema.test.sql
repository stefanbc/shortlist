-- Schema: constraints, profile trigger, phase helpers, audit triggers.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Test helpers (rolled back with the transaction).
create schema tests;
-- Creates an auth user with the given user and app metadata (the profile trigger fires).
create function tests.create_user(p_id uuid, p_email text, p_user_meta jsonb, p_app_meta jsonb) returns uuid
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, p_user_meta, p_app_meta, now(), now())
  returning id;
$$;

-- Builds an in-memory events row for the phase helpers.
create function tests.ev(p_starts timestamptz, p_ends timestamptz, p_override text, p_locked timestamptz)
returns events language sql as $$
  select jsonb_populate_record(null::events, jsonb_build_object(
    'name', 'x', 'starts_at', p_starts, 'ends_at', p_ends,
    'status_override', p_override, 'locked_at', p_locked));
$$;

select tests.create_user('00000000-0000-0000-0000-0000000000a1', 'ada@test.invalid',
  '{"display_name": "Ada Admin"}', '{"role": "admin"}');
select tests.create_user('00000000-0000-0000-0000-0000000000b1', 'jo@test.invalid',
  '{"display_name": "Jo Juror"}', '{}');
select tests.create_user('00000000-0000-0000-0000-0000000000c1', 'mallory@test.invalid',
  '{"display_name": "Mallory", "role": "admin"}', '{}');
select tests.create_user('00000000-0000-0000-0000-0000000000c2', 'nobody@test.invalid',
  '{}', '{"role": "superuser"}');

insert into events (id, name, starts_at, ends_at)
values ('10000000-0000-0000-0000-000000000001', 'Hack', now() - interval '1 hour', now() + interval '1 hour');
insert into criteria (id, event_id, name, weight, position)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Originality', 90, 1);
insert into teams (id, event_id, name, pitch_order)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team 1', 1);

-- constraints
select throws_ok(
  $$ insert into scores (event_id, team_id, criterion_id, juror_id, value, tapped_at)
     values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 3.25, now()) $$,
  '23514', null, 'score 3.25 rejected');

select lives_ok(
  $$ insert into scores (event_id, team_id, criterion_id, juror_id, value, tapped_at)
     values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 3.5, now()) $$,
  'score 3.5 accepted');

select throws_ok(
  $$ update scores set value = 5.5 $$,
  '23514', null, 'score above 5 rejected');

select throws_ok(
  $$ insert into criteria (event_id, name, weight, position)
     values ('10000000-0000-0000-0000-000000000001', 'Zero', 0, 2) $$,
  '23514', null, 'weight 0 rejected');

select throws_ok(
  $$ insert into events (name, starts_at, ends_at) values ('Bad', now(), now() - interval '1 minute') $$,
  '23514', null, 'ends_at before starts_at rejected');

-- profile trigger
select is(
  (select role from profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'admin', 'app metadata role admin gives an admin profile');

select is(
  (select role from profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'juror', 'user metadata role admin (self-set at sign-up) gives a juror profile');

select is(
  (select role || '/' || display_name from profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'juror/nobody@test.invalid', 'unknown app role falls back to juror; display_name falls back to email');

select is(
  (select display_name || '/' || role from profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'Jo Juror/juror', 'profile defaults to juror role and takes display_name');

-- role permissions seed
select results_eq(
  $$ select permission from role_permissions where role = 'admin' order by permission $$,
  $$ values ('events.manage'), ('reports.view'), ('users.manage') $$,
  'admin role has events.manage, reports.view, users.manage');

select results_eq(
  $$ select permission from role_permissions where role = 'juror' $$,
  $$ values ('scores.write') $$,
  'juror role has scores.write');

-- event_phase / event_closed_at mirror src/domain/eventPhase.ts
select is(
  event_phase(tests.ev(now() + interval '1 minute', now() + interval '1 hour', 'auto', null)),
  'setup', 'phase setup before starts_at');

select is(
  event_phase(tests.ev(now() - interval '1 hour', now(), 'auto', null)),
  'open', 'phase open at ends_at (inclusive)');

select is(
  event_phase(tests.ev(now() - interval '2 hour', now() - interval '1 second', 'auto', null)),
  'locked', 'phase locked after ends_at');

select is(
  event_phase(tests.ev(now() + interval '1 hour', now() + interval '2 hour', 'locked', null))
  || '/' ||
  event_phase(tests.ev(now() - interval '2 hour', now() - interval '1 hour', 'open', null)),
  'locked/open', 'override wins over dates');

select is(
  event_closed_at(tests.ev(now() - interval '2 hour', now() + interval '1 hour', 'locked', now() - interval '5 minute')),
  now() - interval '5 minute', 'closed_at is locked_at when override locked');

select is(
  event_closed_at(tests.ev(now() - interval '2 hour', now() + interval '1 hour', 'auto', now() - interval '5 minute')),
  now() + interval '1 hour', 'closed_at is ends_at otherwise');

-- locked_at stamping on insert
insert into events (id, name, starts_at, ends_at, status_override)
values ('10000000-0000-0000-0000-000000000002', 'Born locked', now() - interval '2 hour', now() - interval '1 hour', 'locked');
select is(
  (select locked_at from events where id = '10000000-0000-0000-0000-000000000002'),
  now(), 'inserting a locked event stamps locked_at');

-- late_score_attempts value check
select throws_ok(
  $$ insert into late_score_attempts (event_id, team_id, criterion_id, juror_id, value, tapped_at)
     values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 999, now()) $$,
  '23514', null, 'late_score_attempts rejects an out-of-range value');

-- audit trigger on status change
update events set status_override = 'locked', locked_at = now()
where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select new->>'status_override' from audit_log where action = 'status_changed' and entity_id = '10000000-0000-0000-0000-000000000001'),
  'locked', 'status_override change writes audit_log');

select * from finish();
rollback;

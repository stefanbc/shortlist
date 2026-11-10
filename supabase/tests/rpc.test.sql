-- RPCs: upsert_score lock/grace contract, admin actions, copy and import.
-- Time is controlled by placing event dates relative to now(), which is fixed for the transaction.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Test helpers (rolled back with the transaction).
create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.create_user(p_id uuid, p_name text, p_role text) returns uuid
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          lower(replace(p_name, ' ', '.')) || '@test.invalid',
          jsonb_build_object('display_name', p_name, 'role', p_role), '{}'::jsonb, now(), now())
  returning id;
$$;
-- Switches the session to an authenticated user (call `reset role` to return to postgres).
create function tests.authenticate_as(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
grant execute on all functions in schema tests to authenticated;

-- Users: admin; juror A (assigned everywhere); juror D (deactivated); juror C (unassigned); juror R (to be removed).
select tests.create_user('00000000-0000-0000-0000-0000000000a1', 'Ada Admin', 'admin');
select tests.create_user('00000000-0000-0000-0000-0000000000b1', 'Juror A', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b2', 'Juror D', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b3', 'Juror C', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b4', 'Juror R', 'juror');
update profiles set active = false where id = '00000000-0000-0000-0000-0000000000b2';

-- Events (one criterion + one team each), suffix n = 1..5:
--   1 open, 2 setup, 3 closed 10 min ago, 4 closed 20 min ago, 5 closed 5 min ago.
insert into events (id, name, starts_at, ends_at) values
  ('10000000-0000-0000-0000-000000000001', 'Open',   now() - interval '1 hour',  now() + interval '1 hour'),
  ('10000000-0000-0000-0000-000000000002', 'Setup',  now() + interval '1 hour',  now() + interval '2 hour'),
  ('10000000-0000-0000-0000-000000000003', 'Grace',  now() - interval '2 hour',  now() - interval '10 minute'),
  ('10000000-0000-0000-0000-000000000004', 'Late',   now() - interval '2 hour',  now() - interval '20 minute'),
  ('10000000-0000-0000-0000-000000000005', 'Clamp',  now() - interval '2 hour',  now() - interval '5 minute');
insert into criteria (id, event_id, name, weight, position)
select ('20000000-0000-0000-0000-00000000000' || n)::uuid, ('10000000-0000-0000-0000-00000000000' || n)::uuid, 'C' || n, 10, 1
from generate_series(1, 5) n;
insert into teams (id, event_id, name, pitch_order)
select ('30000000-0000-0000-0000-00000000000' || n)::uuid, ('10000000-0000-0000-0000-00000000000' || n)::uuid, 'T' || n, 1
from generate_series(1, 5) n;
insert into teams (id, event_id, name, pitch_order, no_show) values
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'No-show', 2, true);
insert into event_jurors (event_id, juror_id)
select ('10000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid
from generate_series(1, 5) n;
insert into event_jurors (event_id, juror_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4');

-- ---------------------------------------------------------------- upsert_score as juror A
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, now()),
  'saved', 'upsert_score saved when open');
select is(
  (select value from scores where team_id = '30000000-0000-0000-0000-000000000001'),
  4::numeric, 'saved value is stored for the caller');

select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3.5, now()),
  'saved', 'second save of the same cell succeeds');
select is(
  (select count(*)::int || ':' || max(value)::text from scores where team_id = '30000000-0000-0000-0000-000000000001'),
  '1:3.5', 'second save updates the existing score');

select is(
  upsert_score('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 4, now()),
  'not_open', 'not_open in setup');

select is(
  upsert_score('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 4, now() - interval '11 minute'),
  'saved', 'saved within grace: tapped before close, received 10 min after');

select is(
  upsert_score('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 4, now() - interval '25 minute'),
  'locked', 'locked after grace');

select is(
  upsert_score('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 4, now() - interval '6 minute'),
  'saved', 'tap before close is accepted within grace');

select is(
  upsert_score('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 2, now() + interval '1 hour'),
  'locked', 'future tapped_at is clamped so a post-close tap is rejected');

select is(
  upsert_score('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 4, now()),
  'not_open', 'no_show team rejects');

select throws_ok(
  $$ select upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3.25, now()) $$,
  '23514', null, 'invalid score value is rejected');

select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, now()),
  'saved', 'null value is accepted while open');
select is(
  (select count(*)::int from scores where team_id = '30000000-0000-0000-0000-000000000001'),
  0, 'null value deletes the score');

select is(
  upsert_score('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', null, now() - interval '25 minute'),
  'locked', 'null value outside grace is rejected too');

select throws_ok(
  $$ select set_event_status('10000000-0000-0000-0000-000000000001', 'locked') $$,
  '42501', null, 'juror cannot call set_event_status');

select throws_ok(
  $$ select import_event('{}'::jsonb) $$,
  '42501', null, 'authenticated users cannot call import_event');

reset role;

select results_eq(
  $$ select team_id, juror_id, value, tapped_at from late_score_attempts order by tapped_at, value nulls last $$,
  $$ values
     ('30000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid, 4::numeric, now() - interval '25 minute'),
     ('30000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid, null::numeric, now() - interval '25 minute'),
     ('30000000-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid, 2::numeric, now()) $$,
  'locked after grace records late_score_attempts (with clamped tapped_at)');

select is(
  (select value from scores where team_id = '30000000-0000-0000-0000-000000000005'),
  4::numeric, 'rejected late tap leaves the stored score unchanged');

-- ---------------------------------------------------------------- other jurors
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b3');
select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, now()),
  'not_assigned', 'not_assigned for a juror not on the event');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b2');
select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, now()),
  'not_assigned', 'not_assigned for a deactivated juror');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b4');
select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, now()),
  'saved', 'juror R saves while assigned');
reset role;
delete from event_jurors where juror_id = '00000000-0000-0000-0000-0000000000b4';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b4');
select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 5, now()),
  'not_assigned', 'not_assigned after juror removed from event');

-- ---------------------------------------------------------------- admin actions
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4, now()),
  'not_assigned', 'admin cannot score');

update criteria set weight = 25 where id = '20000000-0000-0000-0000-000000000001';
select is(
  (select (old->>'weight') || '->' || (new->>'weight') || ' by ' || actor::text
   from audit_log where action = 'weight_changed' and entity = 'criteria'),
  '10->25 by 00000000-0000-0000-0000-0000000000a1', 'weight update writes audit_log');

select set_event_status('10000000-0000-0000-0000-000000000001', 'locked');
select is(
  (select status_override || ' ' || (locked_at = now())::text from events where id = '10000000-0000-0000-0000-000000000001'),
  'locked true', 'set_event_status locked sets locked_at');

select set_now_pitching('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
select is(
  (select now_pitching_team_id::text || ' ' || (now_pitching_since = now())::text from events where id = '10000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001 true', 'set_now_pitching sets team and now_pitching_since');

select throws_ok(
  $$ select set_now_pitching('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002') $$,
  '22023', null, 'set_now_pitching rejects a team from another event');

-- copy_event_setup: source with the 9 Astra Hack criteria and 3 themes.
insert into events (id, name, starts_at, ends_at)
values ('10000000-0000-0000-0000-000000000009', 'Astra Hack', now() - interval '2 day', now() - interval '1 day');
insert into themes (event_id, name, position)
select '10000000-0000-0000-0000-000000000009', t, i
from unnest(array['Artificial Intelligence', 'Cybersecurity', 'Sustainability']) with ordinality as x(t, i);
insert into criteria (event_id, name, weight, position)
select '10000000-0000-0000-0000-000000000009', 'Criterion ' || i, w, i
from unnest(array[20, 90, 25, 25, 100, 80, 70, 20, 100]) with ordinality as x(w, i);

create temp table copied as
select copy_event_setup('10000000-0000-0000-0000-000000000009', 'Next Hack', now() + interval '1 day', now() + interval '2 day') as id;

select results_eq(
  $$ select name, weight, position from criteria where event_id = (select id from copied) order by position $$,
  $$ select name, weight, position from criteria where event_id = '10000000-0000-0000-0000-000000000009' order by position $$,
  'copy_event_setup copies 9 criteria with weights');

select results_eq(
  $$ select name, position from themes where event_id = (select id from copied) order by position $$,
  $$ select name, position from themes where event_id = '10000000-0000-0000-0000-000000000009' order by position $$,
  'copy_event_setup copies themes');

reset role;

-- ---------------------------------------------------------------- import_event (service role)
set local role service_role;
create temp table imported as
select import_event($json$
{
  "eventName": "Imported Hack",
  "themes": ["AI", "Security"],
  "criteria": [{"name": "Idea", "weight": 90, "position": 1}, {"name": "Demo", "weight": 100, "position": 2}],
  "jurors": [{"key": "ja", "id": "00000000-0000-0000-0000-0000000000b1"},
             {"key": "jc", "id": "00000000-0000-0000-0000-0000000000b3"}],
  "teams": [
    {"pitchOrder": 1, "name": "Alpha", "projectName": "Rocket", "theme": "Security",
     "repoUrl": "https://example.com/alpha", "description": "Goes up", "noShow": false,
     "scores": [{"criterionPosition": 1, "jurorKey": "ja", "value": 4.5},
                {"criterionPosition": 2, "jurorKey": "ja", "value": 3},
                {"criterionPosition": 2, "jurorKey": "jc", "value": 5}]},
    {"pitchOrder": 2, "name": "Beta", "projectName": null, "theme": null,
     "repoUrl": null, "description": null, "noShow": true, "scores": []}
  ]
}
$json$::jsonb) as id;
reset role;

select is(
  (select status_override || ' ' || (locked_at is not null)::text || ' ' || name from events where id = (select id from imported)),
  'locked true Imported Hack', 'import_event creates a locked event');

select results_eq(
  $$ select t.name, t.pitch_order, t.no_show, p.name, th.name, p.repo_url
     from teams t join projects p on p.team_id = t.id left join themes th on th.id = p.theme_id
     where t.event_id = (select id from imported) order by t.pitch_order $$,
  $$ values ('Alpha', 1, false, 'Rocket', 'Security', 'https://example.com/alpha'),
            ('Beta', 2, true, null, null, null) $$,
  'import_event creates teams and projects with themes');

select results_eq(
  $$ select c.position, s.juror_id, s.value
     from scores s join criteria c on c.id = s.criterion_id
     where s.event_id = (select id from imported) order by c.position, s.value $$,
  $$ values (1, '00000000-0000-0000-0000-0000000000b1'::uuid, 4.5::numeric),
            (2, '00000000-0000-0000-0000-0000000000b1'::uuid, 3::numeric),
            (2, '00000000-0000-0000-0000-0000000000b3'::uuid, 5::numeric) $$,
  'import_event maps scores to criteria and jurors');

select is(
  (select count(*)::int from event_jurors where event_id = (select id from imported)),
  2, 'import_event assigns every listed juror to the event');

select * from finish();
rollback;

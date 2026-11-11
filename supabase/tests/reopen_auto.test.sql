-- Re-opening a closed event and then handing it back to its dates ('open' -> 'auto' after
-- ends_at) closes scoring at that moment, not at the old ends_at.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(8);

create schema tests;
grant usage on schema tests to authenticated, anon;
create function tests.create_user(p_id uuid, p_name text, p_role text) returns uuid
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          lower(replace(p_name, ' ', '.')) || '@test.invalid',
          jsonb_build_object('display_name', p_name), jsonb_build_object('role', p_role), now(), now())
  returning id;
$$;
create function tests.authenticate_as(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function tests.ev(p_starts timestamptz, p_ends timestamptz, p_override text, p_locked timestamptz)
returns events language sql as $$
  select jsonb_populate_record(null::events, jsonb_build_object(
    'name', 'x', 'starts_at', p_starts, 'ends_at', p_ends,
    'status_override', p_override, 'locked_at', p_locked));
$$;
grant execute on all functions in schema tests to authenticated;

select tests.create_user('00000000-0000-0000-0000-0000000000a1', 'Ada Admin', 'admin');
select tests.create_user('00000000-0000-0000-0000-0000000000b1', 'Juror A', 'juror');

-- Event 1 ended an hour ago; event 2 is still running by its dates.
insert into events (id, name, starts_at, ends_at) values
  ('10000000-0000-0000-0000-000000000001', 'Reopened', now() - interval '3 hour', now() - interval '1 hour'),
  ('10000000-0000-0000-0000-000000000002', 'Running',  now() - interval '1 hour', now() + interval '1 hour');
insert into criteria (id, event_id, name, weight, position) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'C1', 10, 1);
insert into teams (id, event_id, name, pitch_order) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'T1', 1);
insert into event_jurors (event_id, juror_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1');

-- The organizer re-opens the ended event, then puts it back on 'auto'.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select set_event_status('10000000-0000-0000-0000-000000000001', 'open');
select set_event_status('10000000-0000-0000-0000-000000000001', 'auto');
reset role;

select is(
  (select locked_at from events where id = '10000000-0000-0000-0000-000000000001'),
  now(), 'open -> auto after ends_at stamps locked_at');

select is(
  (select event_closed_at(e) from events e where id = '10000000-0000-0000-0000-000000000001'),
  now(), 'the event closes at that moment, not at the old ends_at');

select is(
  (select event_phase(e) from events e where id = '10000000-0000-0000-0000-000000000001'),
  'locked', 'and it is locked by its dates again');

-- A tap made while it was re-opened (after ends_at), delivered late from the offline
-- queue, is still accepted within grace.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  upsert_score('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 4,
               now() - interval '1 minute', auth.uid()),
  'saved', 'a tap from the re-opened window is accepted after going back to auto');
reset role;

-- Direct updates take the same path as the RPC.
update events set status_override = 'open', locked_at = null where id = '10000000-0000-0000-0000-000000000001';
update events set status_override = 'auto' where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select locked_at from events where id = '10000000-0000-0000-0000-000000000001'),
  now(), 'open -> auto by direct update stamps locked_at too');

-- Before ends_at, going back to auto changes nothing: the dates still close it.
update events set status_override = 'open' where id = '10000000-0000-0000-0000-000000000002';
update events set status_override = 'auto' where id = '10000000-0000-0000-0000-000000000002';
select is(
  (select locked_at from events where id = '10000000-0000-0000-0000-000000000002'),
  null, 'open -> auto before ends_at leaves locked_at unset');

-- event_closed_at for 'auto': the later of ends_at and locked_at.
select is(
  event_closed_at(tests.ev(now() - interval '3 hour', now() - interval '1 hour', 'auto', now() - interval '5 minute')),
  now() - interval '5 minute', 'auto closes at locked_at when it is later than ends_at');

select is(
  event_closed_at(tests.ev(now() - interval '3 hour', now() - interval '1 hour', 'auto', now() - interval '2 hour')),
  now() - interval '1 hour', 'auto closes at ends_at when locked_at is earlier');

select * from finish();
rollback;

-- Revoking juror access on profile changes: a role change or deactivation must not
-- leave a stale login link alive, and a user who stops being a juror must not stay
-- assigned to events (admins never judge) -- their scores stay either way.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Test helpers (rolled back with the transaction).
create schema tests;
create function tests.create_user(p_id uuid, p_name text, p_role text) returns uuid
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          lower(replace(p_name, ' ', '.')) || '@test.invalid',
          jsonb_build_object('display_name', p_name), jsonb_build_object('role', p_role), now(), now())
  returning id;
$$;

-- Fixture: two jurors, each with an active login token; both assigned to one event;
-- juror A has already entered a score for it.
select tests.create_user('00000000-0000-0000-0000-0000000000b1', 'Juror A', 'juror');
select tests.create_user('00000000-0000-0000-0000-0000000000b2', 'Juror B', 'juror');

insert into juror_tokens (juror_id, token_hash) values
  ('00000000-0000-0000-0000-0000000000b1', 'hash-a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'hash-b1');

insert into events (id, name, starts_at, ends_at)
values ('10000000-0000-0000-0000-000000000001', 'Hack', now() - interval '1 hour', now() + interval '1 hour');
insert into criteria (id, event_id, name, weight, position)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Originality', 90, 1);
insert into teams (id, event_id, name, pitch_order)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team 1', 1);
insert into event_jurors (event_id, juror_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2');
insert into scores (event_id, team_id, criterion_id, juror_id, value, tapped_at) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 4, now());

-- role change revokes the juror's active token
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
select is(
  (select revoked_at is not null from juror_tokens where juror_id = '00000000-0000-0000-0000-0000000000b1'),
  true, 'role change revokes the juror''s active token');

-- role change away from juror deletes their event_jurors row...
select is(
  (select count(*)::int from event_jurors where juror_id = '00000000-0000-0000-0000-0000000000b1'),
  0, 'role change away from juror deletes their event_jurors row');

-- ...but their already-entered scores stay (admins never judge, but the record stands)
select is(
  (select count(*)::int from scores where juror_id = '00000000-0000-0000-0000-0000000000b1'),
  1, 'scores stay after the event_jurors row is deleted');

-- deactivation (role unchanged) revokes juror B's active token too
update profiles set active = false where id = '00000000-0000-0000-0000-0000000000b2';
select is(
  (select revoked_at is not null from juror_tokens where juror_id = '00000000-0000-0000-0000-0000000000b2'),
  true, 'deactivation revokes the juror''s active token');

-- ...but deactivation alone (still a juror) does not touch event_jurors
select is(
  (select count(*)::int from event_jurors where juror_id = '00000000-0000-0000-0000-0000000000b2'),
  1, 'deactivation alone keeps the event_jurors row (still a juror)');

-- reactivating does not revoke a token issued after the deactivation
insert into juror_tokens (juror_id, token_hash) values ('00000000-0000-0000-0000-0000000000b2', 'hash-b2');
update profiles set active = true where id = '00000000-0000-0000-0000-0000000000b2';
select is(
  (select revoked_at from juror_tokens
   where juror_id = '00000000-0000-0000-0000-0000000000b2' and token_hash = 'hash-b2'),
  null, 'reactivating does not revoke a token issued after the deactivation');

-- an unrelated column update (no role or active change) revokes nothing
insert into juror_tokens (juror_id, token_hash) values ('00000000-0000-0000-0000-0000000000b2', 'hash-b3');
update profiles set display_name = 'Juror B Renamed' where id = '00000000-0000-0000-0000-0000000000b2';
select is(
  (select revoked_at from juror_tokens
   where juror_id = '00000000-0000-0000-0000-0000000000b2' and token_hash = 'hash-b3'),
  null, 'renaming a profile does not revoke tokens');

select * from finish();
rollback;

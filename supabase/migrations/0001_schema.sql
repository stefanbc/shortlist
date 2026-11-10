-- Shortlist schema: roles/permissions, profiles, events and their setup, scores, audit.
-- Access rules live in 0002_security.sql; RPCs in 0003_rpc.sql.

-- ---------------------------------------------------------------------------
-- Roles and permissions (data, so a new role needs no rewrite)
-- ---------------------------------------------------------------------------
create table public.roles (
  key text primary key
);

create table public.permissions (
  key text primary key
);

create table public.role_permissions (
  role text not null references public.roles (key) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.roles (key) values ('admin'), ('juror');
insert into public.permissions (key) values
  ('events.manage'), ('users.manage'), ('reports.view'), ('scores.write');
insert into public.role_permissions (role, permission) values
  ('admin', 'events.manage'),
  ('admin', 'users.manage'),
  ('admin', 'reports.view'),
  ('juror', 'scores.write');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text,
  role text not null default 'juror' references public.roles (key),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Creates the profile for a new auth user. display_name comes from user metadata; the
-- role comes from app metadata, which only the service role can set (user metadata is
-- writable by the user at sign-up). Unknown or missing roles fall back to 'juror'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is null or not exists (select 1 from public.roles where key = v_role) then
    v_role := 'juror';
  end if;

  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), new.email, 'Unnamed'),
    new.email,
    v_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Events and their setup
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status_override text not null default 'auto' check (status_override in ('auto', 'open', 'locked')),
  locked_at timestamptz,
  pitch_minutes int not null default 7 check (pitch_minutes > 0),
  now_pitching_team_id uuid,
  now_pitching_since timestamptz,
  created_at timestamptz not null default now(),
  constraint events_ends_after_starts check (ends_at > starts_at)
);

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index themes_event_id_idx on public.themes (event_id);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  weight numeric not null check (weight > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index criteria_event_id_idx on public.criteria (event_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  members text[] not null default '{}',
  pitch_order int,
  no_show boolean not null default false,
  manual_tiebreak int,
  created_at timestamptz not null default now()
);
create index teams_event_id_idx on public.teams (event_id);

alter table public.events
  add constraint events_now_pitching_team_id_fkey
  foreign key (now_pitching_team_id) references public.teams (id) on delete set null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams (id) on delete cascade,
  name text,
  description text,
  theme_id uuid references public.themes (id) on delete set null,
  repo_url text,
  created_at timestamptz not null default now()
);
create index projects_theme_id_idx on public.projects (theme_id);

create table public.event_jurors (
  event_id uuid not null references public.events (id) on delete cascade,
  juror_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, juror_id)
);
create index event_jurors_juror_id_idx on public.event_jurors (juror_id);

-- ---------------------------------------------------------------------------
-- Scores, notes, late attempts
-- ---------------------------------------------------------------------------
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  criterion_id uuid not null references public.criteria (id) on delete cascade,
  juror_id uuid not null references public.profiles (id),
  value numeric not null check (value between 1 and 5 and value * 2 = floor(value * 2)),
  tapped_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (team_id, criterion_id, juror_id)
);
create index scores_event_id_idx on public.scores (event_id);
create index scores_juror_id_idx on public.scores (juror_id);
create index scores_criterion_id_idx on public.scores (criterion_id);

create table public.juror_notes (
  team_id uuid not null references public.teams (id) on delete cascade,
  juror_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, juror_id)
);
create index juror_notes_juror_id_idx on public.juror_notes (juror_id);

-- Scores that reached the server after the grace window; the admin can review them.
create table public.late_score_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  criterion_id uuid not null references public.criteria (id) on delete cascade,
  juror_id uuid not null references public.profiles (id) on delete cascade,
  value numeric check (value between 1 and 5 and value * 2 = floor(value * 2)),
  tapped_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index late_score_attempts_event_id_idx on public.late_score_attempts (event_id);

-- ---------------------------------------------------------------------------
-- Juror login tokens (hash only; the raw token lives in the login link)
-- ---------------------------------------------------------------------------
create table public.juror_tokens (
  id uuid primary key default gen_random_uuid(),
  juror_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index juror_tokens_juror_id_idx on public.juror_tokens (juror_id);

-- ---------------------------------------------------------------------------
-- Event phase (mirrors src/domain/eventPhase.ts)
-- ---------------------------------------------------------------------------
create function public.event_phase(e public.events)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when e.status_override = 'open' then 'open'
    when e.status_override = 'locked' then 'locked'
    when now() < e.starts_at then 'setup'
    when now() <= e.ends_at then 'open'
    else 'locked'
  end;
$$;

create function public.event_closed_at(e public.events)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when e.status_override = 'locked' and e.locked_at is not null then e.locked_at
    else e.ends_at
  end;
$$;

-- Locking (by any path: RPC, direct update, insert) stamps locked_at, which becomes the
-- closing time; re-locking after an unlock gets a fresh stamp. An insert may supply its own.
create function public.stamp_event_locked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status_override = 'locked'
     and (tg_op = 'INSERT' and new.locked_at is null
          or tg_op = 'UPDATE' and old.status_override is distinct from 'locked') then
    new.locked_at := now();
  end if;
  return new;
end;
$$;

create trigger events_stamp_locked_at
  before insert or update of status_override on public.events
  for each row execute function public.stamp_event_locked_at();

-- ---------------------------------------------------------------------------
-- Audit log (weight overrides and lock/unlock)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  old jsonb,
  new jsonb,
  at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create function public.audit_criteria_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, old, new)
  values (
    auth.uid(), 'weight_changed', 'criteria', new.id,
    jsonb_build_object('weight', old.weight),
    jsonb_build_object('weight', new.weight)
  );
  return new;
end;
$$;

create trigger criteria_weight_audit
  after update of weight on public.criteria
  for each row
  when (old.weight is distinct from new.weight)
  execute function public.audit_criteria_weight();

create function public.audit_event_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, old, new)
  values (
    auth.uid(), 'status_changed', 'events', new.id,
    jsonb_build_object('status_override', old.status_override, 'locked_at', old.locked_at),
    jsonb_build_object('status_override', new.status_override, 'locked_at', new.locked_at)
  );
  return new;
end;
$$;

create trigger events_status_audit
  after update of status_override on public.events
  for each row
  when (old.status_override is distinct from new.status_override)
  execute function public.audit_event_status();

-- Access rules. Admin = events.manage (+ users.manage for people); jurors see only their
-- assigned events and only their own scores/notes. Scores are written only via upsert_score.

-- ---------------------------------------------------------------------------
-- Helpers used by policies (security definer so they can read profiles/event_jurors
-- without recursing through RLS)
-- ---------------------------------------------------------------------------
create function public.has_permission(p text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.role_permissions rp on rp.role = pr.role
    where pr.id = auth.uid()
      and pr.active
      and rp.permission = p
  );
$$;

create function public.is_event_juror(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_jurors ej
    join public.profiles pr on pr.id = ej.juror_id
    where ej.event_id = event
      and ej.juror_id = auth.uid()
      and pr.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges: no anonymous access at all; authenticated relies on RLS, with direct
-- writes removed where only definer functions/triggers may write.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete on public.roles, public.permissions, public.role_permissions from authenticated;
revoke insert, update, delete on public.scores from authenticated;
revoke insert, update, delete on public.late_score_attempts from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

revoke execute on all functions in schema public from public, anon;
-- Keep later migrations closed to anon by default as well.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.audit_criteria_weight() from authenticated;
revoke execute on function public.audit_event_status() from authenticated;
revoke execute on function public.stamp_event_locked_at() from authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_event_juror(uuid) to authenticated;
grant execute on function public.event_phase(public.events) to authenticated;
grant execute on function public.event_closed_at(public.events) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.themes enable row level security;
alter table public.criteria enable row level security;
alter table public.teams enable row level security;
alter table public.projects enable row level security;
alter table public.event_jurors enable row level security;
alter table public.scores enable row level security;
alter table public.juror_notes enable row level security;
alter table public.late_score_attempts enable row level security;
alter table public.audit_log enable row level security;
alter table public.juror_tokens enable row level security;

-- Role catalogue: readable by any signed-in user.
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- Profiles: own row; people managers see and edit everyone.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users.manage'))
         or (select public.has_permission('events.manage')));
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select public.has_permission('users.manage')));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select public.has_permission('users.manage')));

-- Events and setup tables: admin manages; jurors read their assigned events.
create policy events_admin on public.events for all to authenticated
  using ((select public.has_permission('events.manage')))
  with check ((select public.has_permission('events.manage')));
create policy events_juror_select on public.events for select to authenticated
  using (public.is_event_juror(id));

create policy themes_admin on public.themes for all to authenticated
  using ((select public.has_permission('events.manage')))
  with check ((select public.has_permission('events.manage')));
create policy themes_juror_select on public.themes for select to authenticated
  using (public.is_event_juror(event_id));

create policy criteria_admin on public.criteria for all to authenticated
  using ((select public.has_permission('events.manage')))
  with check ((select public.has_permission('events.manage')));
create policy criteria_juror_select on public.criteria for select to authenticated
  using (public.is_event_juror(event_id));

create policy teams_admin on public.teams for all to authenticated
  using ((select public.has_permission('events.manage')))
  with check ((select public.has_permission('events.manage')));
create policy teams_juror_select on public.teams for select to authenticated
  using (public.is_event_juror(event_id));

create policy projects_admin on public.projects for all to authenticated
  using ((select public.has_permission('events.manage')))
  with check ((select public.has_permission('events.manage')));
create policy projects_juror_select on public.projects for select to authenticated
  using (exists (
    select 1 from public.teams t
    where t.id = projects.team_id and public.is_event_juror(t.event_id)
  ));

-- Juror assignment: people managers write; admins read; jurors see their own rows.
create policy event_jurors_select on public.event_jurors for select to authenticated
  using (juror_id = (select auth.uid()) or (select public.has_permission('events.manage'))
         or (select public.has_permission('users.manage')));
create policy event_jurors_insert on public.event_jurors for insert to authenticated
  with check ((select public.has_permission('users.manage')));
create policy event_jurors_update on public.event_jurors for update to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));
create policy event_jurors_delete on public.event_jurors for delete to authenticated
  using ((select public.has_permission('users.manage')));

-- Scores: own rows for jurors, all rows for admins/report viewers. No write policies:
-- writes go through upsert_score (security definer) only.
create policy scores_select on public.scores for select to authenticated
  using (juror_id = (select auth.uid()) or (select public.has_permission('events.manage'))
         or (select public.has_permission('reports.view')));

-- Notes: private to the juror (admins may read); writable by the juror on assigned events.
create policy juror_notes_select on public.juror_notes for select to authenticated
  using (juror_id = (select auth.uid()) or (select public.has_permission('events.manage')));
create policy juror_notes_insert on public.juror_notes for insert to authenticated
  with check (juror_id = (select auth.uid()) and exists (
    select 1 from public.teams t
    where t.id = juror_notes.team_id and public.is_event_juror(t.event_id)
  ));
create policy juror_notes_update on public.juror_notes for update to authenticated
  using (juror_id = (select auth.uid()))
  with check (juror_id = (select auth.uid()) and exists (
    select 1 from public.teams t
    where t.id = juror_notes.team_id and public.is_event_juror(t.event_id)
  ));
create policy juror_notes_delete on public.juror_notes for delete to authenticated
  using (juror_id = (select auth.uid()));

-- Late attempts: admins review; a juror may see their own.
create policy late_score_attempts_select on public.late_score_attempts for select to authenticated
  using (juror_id = (select auth.uid()) or (select public.has_permission('events.manage')));

-- Audit log: admins read; rows are written by triggers only.
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_permission('events.manage')));

-- Juror login tokens: people managers only.
create policy juror_tokens_admin on public.juror_tokens for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes honours the select policies above)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.events, public.scores;

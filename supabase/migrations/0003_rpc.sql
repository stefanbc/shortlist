-- RPCs. All are security definer with a pinned empty search_path and do their own checks.

-- ---------------------------------------------------------------------------
-- upsert_score: the only way a juror writes a score.
-- Returns 'saved' | 'not_open' | 'locked' | 'not_assigned' (client contract).
-- p_value null clears the caller's score for the cell. p_tapped_at is the client tap
-- time, clamped to now(); a tap at or before closing is accepted for 15 minutes after.
-- ---------------------------------------------------------------------------
create function public.upsert_score(
  p_team uuid,
  p_criterion uuid,
  p_value numeric,
  p_tapped_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_juror uuid := auth.uid();
  v_team public.teams;
  v_event public.events;
  v_tapped timestamptz := least(coalesce(p_tapped_at, now()), now());
  v_phase text;
  v_closed timestamptz;
begin
  select * into v_team from public.teams where id = p_team;
  if not found then
    return 'not_assigned';
  end if;

  -- Active juror with scores.write, assigned to this event.
  if v_juror is null
     or not public.has_permission('scores.write')
     or not exists (
       select 1 from public.event_jurors
       where event_id = v_team.event_id and juror_id = v_juror
     ) then
    return 'not_assigned';
  end if;

  if not exists (select 1 from public.criteria where id = p_criterion and event_id = v_team.event_id) then
    raise exception 'criterion % does not belong to the team''s event', p_criterion
      using errcode = '22023';
  end if;

  if v_team.no_show then
    return 'not_open';
  end if;

  select * into v_event from public.events where id = v_team.event_id;
  v_phase := public.event_phase(v_event);

  if v_phase = 'setup' then
    return 'not_open';
  end if;

  if v_phase = 'locked' then
    v_closed := public.event_closed_at(v_event);
    if not (v_tapped <= v_closed and now() <= v_closed + interval '15 minutes') then
      insert into public.late_score_attempts (event_id, team_id, criterion_id, juror_id, value, tapped_at)
      values (v_team.event_id, p_team, p_criterion, v_juror, p_value, v_tapped);
      return 'locked';
    end if;
  end if;

  if p_value is null then
    delete from public.scores
    where team_id = p_team and criterion_id = p_criterion and juror_id = v_juror;
  else
    insert into public.scores (event_id, team_id, criterion_id, juror_id, value, tapped_at)
    values (v_team.event_id, p_team, p_criterion, v_juror, p_value, v_tapped)
    on conflict (team_id, criterion_id, juror_id) do update
      set value = excluded.value,
          tapped_at = excluded.tapped_at,
          updated_at = now();
  end if;

  return 'saved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create function public.require_permission(p text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p) then
    raise exception 'permission % required', p using errcode = '42501';
  end if;
end;
$$;

-- Manual open/lock/auto. Locking stamps locked_at, which becomes the closing time.
create function public.set_event_status(p_event uuid, p_override text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('events.manage');

  update public.events
  set status_override = p_override,
      locked_at = case when p_override = 'locked' then now() else locked_at end
  where id = p_event;

  if not found then
    raise exception 'event % not found', p_event using errcode = 'P0002';
  end if;
end;
$$;

-- Sets (or clears, with null) the team currently pitching.
create function public.set_now_pitching(p_event uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('events.manage');

  if p_team is not null
     and not exists (select 1 from public.teams where id = p_team and event_id = p_event) then
    raise exception 'team % is not in event %', p_team, p_event using errcode = '22023';
  end if;

  update public.events
  set now_pitching_team_id = p_team,
      now_pitching_since = case when p_team is null then null else now() end
  where id = p_event;

  if not found then
    raise exception 'event % not found', p_event using errcode = 'P0002';
  end if;
end;
$$;

-- Creates a new event with the source event's themes and criteria (names, weights, order).
create function public.copy_event_setup(
  p_source uuid,
  p_name text,
  p_starts timestamptz,
  p_ends timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  perform public.require_permission('events.manage');

  if not exists (select 1 from public.events where id = p_source) then
    raise exception 'event % not found', p_source using errcode = 'P0002';
  end if;

  insert into public.events (name, starts_at, ends_at)
  values (p_name, p_starts, p_ends)
  returning id into v_event;

  insert into public.themes (event_id, name, position)
  select v_event, name, position from public.themes where event_id = p_source;

  insert into public.criteria (event_id, name, weight, position)
  select v_event, name, weight, position from public.criteria where event_id = p_source;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_event (service role only): creates a locked event from an ImportPayload:
-- { eventName, themes: string[], criteria: [{name, weight, position}],
--   jurors: [{key, id}], teams: [{pitchOrder, name, projectName, theme, repoUrl,
--   description, noShow, scores: [{criterionPosition, jurorKey, value}]}] }
-- ---------------------------------------------------------------------------
create function public.import_event(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_team_json jsonb;
  v_team uuid;
  v_theme uuid;
  v_expected int;
  v_inserted int;
begin
  insert into public.events (name, starts_at, ends_at, status_override, locked_at)
  values (p ->> 'eventName', now() - interval '1 day', now() - interval '1 hour', 'locked', now())
  returning id into v_event;

  insert into public.themes (event_id, name, position)
  select v_event, t.name, t.ord::int
  from jsonb_array_elements_text(p -> 'themes') with ordinality as t(name, ord);

  insert into public.criteria (event_id, name, weight, position)
  select v_event, c.name, c.weight, c.position
  from jsonb_to_recordset(p -> 'criteria') as c(name text, weight numeric, position int);

  insert into public.event_jurors (event_id, juror_id)
  select v_event, j.id
  from jsonb_to_recordset(p -> 'jurors') as j(key text, id uuid);

  for v_team_json in select value from jsonb_array_elements(p -> 'teams') loop
    insert into public.teams (event_id, name, pitch_order, no_show)
    values (
      v_event,
      v_team_json ->> 'name',
      (v_team_json ->> 'pitchOrder')::int,
      coalesce((v_team_json ->> 'noShow')::boolean, false)
    )
    returning id into v_team;

    v_theme := null;
    if v_team_json ->> 'theme' is not null then
      select id into v_theme from public.themes
      where event_id = v_event and name = v_team_json ->> 'theme';
      if v_theme is null then
        raise exception 'unknown theme % for team %', v_team_json ->> 'theme', v_team_json ->> 'name'
          using errcode = '22023';
      end if;
    end if;

    insert into public.projects (team_id, name, description, theme_id, repo_url)
    values (
      v_team,
      v_team_json ->> 'projectName',
      v_team_json ->> 'description',
      v_theme,
      v_team_json ->> 'repoUrl'
    );

    v_expected := coalesce(jsonb_array_length(v_team_json -> 'scores'), 0);

    insert into public.scores (event_id, team_id, criterion_id, juror_id, value, tapped_at)
    select v_event, v_team, c.id, j.id, s.value, now()
    from jsonb_to_recordset(coalesce(v_team_json -> 'scores', '[]'::jsonb))
           as s("criterionPosition" int, "jurorKey" text, value numeric)
    join public.criteria c on c.event_id = v_event and c.position = s."criterionPosition"
    join jsonb_to_recordset(p -> 'jurors') as j(key text, id uuid) on j.key = s."jurorKey";

    get diagnostics v_inserted = row_count;
    if v_inserted <> v_expected then
      raise exception 'team %: % of % scores matched a criterion and juror',
        v_team_json ->> 'name', v_inserted, v_expected
        using errcode = '22023';
    end if;
  end loop;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.upsert_score(uuid, uuid, numeric, timestamptz) from public, anon;
revoke execute on function public.require_permission(text) from public, anon, authenticated;
revoke execute on function public.set_event_status(uuid, text) from public, anon;
revoke execute on function public.set_now_pitching(uuid, uuid) from public, anon;
revoke execute on function public.copy_event_setup(uuid, text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.import_event(jsonb) from public, anon, authenticated;

grant execute on function public.upsert_score(uuid, uuid, numeric, timestamptz) to authenticated;
grant execute on function public.set_event_status(uuid, text) to authenticated;
grant execute on function public.set_now_pitching(uuid, uuid) to authenticated;
grant execute on function public.copy_event_setup(uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.import_event(jsonb) to service_role;

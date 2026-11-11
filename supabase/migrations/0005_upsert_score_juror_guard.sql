-- upsert_score gains p_juror: the juror the client queued the tap for. If it isn't the
-- caller, nothing is written (no score, no late_score_attempts row) and 'wrong_juror' is
-- returned, so a queued tap that reaches the server under another juror's session (shared
-- device, auth switch mid-flush) can never be stored under the wrong name. The client keeps
-- such a tap pending until its owner is signed in again.
-- Returns 'saved' | 'not_open' | 'locked' | 'not_assigned' | 'wrong_juror'. Everything else
-- behaves exactly as in 0003_rpc.sql.

drop function public.upsert_score(uuid, uuid, numeric, timestamptz);

create function public.upsert_score(
  p_team uuid,
  p_criterion uuid,
  p_value numeric,
  p_tapped_at timestamptz,
  p_juror uuid
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
  if p_juror is distinct from v_juror then
    return 'wrong_juror';
  end if;

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
    if not (v_tapped <= v_closed
            and now() <= v_closed + interval '15 minutes'
            and (v_event.status_override <> 'auto' or v_tapped >= v_event.starts_at)) then
      insert into public.late_score_attempts (event_id, team_id, criterion_id, juror_id, value, tapped_at)
      values (v_team.event_id, p_team, p_criterion, v_juror, p_value, v_tapped);
      return 'locked';
    end if;
  end if;

  if p_value is null then
    delete from public.scores
    where team_id = p_team and criterion_id = p_criterion and juror_id = v_juror
      and tapped_at <= v_tapped;
  else
    insert into public.scores as s (event_id, team_id, criterion_id, juror_id, value, tapped_at)
    values (v_team.event_id, p_team, p_criterion, v_juror, p_value, v_tapped)
    on conflict (team_id, criterion_id, juror_id) do update
      set value = excluded.value,
          tapped_at = excluded.tapped_at,
          updated_at = now()
      where s.tapped_at <= excluded.tapped_at;
  end if;

  return 'saved';
end;
$$;

revoke execute on function public.upsert_score(uuid, uuid, numeric, timestamptz, uuid) from public, anon;
grant execute on function public.upsert_score(uuid, uuid, numeric, timestamptz, uuid) to authenticated;

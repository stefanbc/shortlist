-- The built-in pitch timer replaces the stagetimer.io embed (0007).
--
-- One shared clock per event, stored on the event row so it travels over the Realtime
-- subscription every screen already has: the organizer's dashboard controls it, jurors
-- see it on the team that is on stage, and the projector page shows it full screen.
--
--   timer_duration_s  length of this run in seconds; null = the event's pitch_minutes
--   timer_started_at  when the current stretch started running; null = not running
--   timer_elapsed_ms  time already used before the current stretch (kept across pauses)
--
-- ready   = not started, nothing elapsed
-- running = timer_started_at is set
-- paused  = not running, some time elapsed
-- Time left = duration - elapsed - (now - started_at while running); negative = over time.
-- Mirrored in src/domain/pitchTimer.ts.

alter table public.events drop column stagetimer_url;

alter table public.events
  add column timer_duration_s int
    check (timer_duration_s is null or timer_duration_s between 10 and 14400),
  add column timer_started_at timestamptz,
  add column timer_elapsed_ms bigint not null default 0 check (timer_elapsed_ms >= 0);

-- A new team on stage (or an empty stage) always starts from a fresh, stopped clock,
-- whichever way the stage was changed.
create function public.events_reset_timer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.now_pitching_team_id is distinct from old.now_pitching_team_id then
    new.timer_duration_s := null;
    new.timer_started_at := null;
    new.timer_elapsed_ms := 0;
  end if;
  return new;
end;
$$;

create trigger events_reset_timer
  before update on public.events
  for each row execute function public.events_reset_timer();

-- Runs the timer. All timestamps are the database's, so every screen counts from the
-- same instant no matter which device pressed the button.
--   start  begin or resume            pause  stop, keeping the time used
--   reset  back to a full, stopped clock
--   add    lengthen (or, negative, shorten) this run by p_seconds
create function public.pitch_timer(p_event uuid, p_action text, p_seconds int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('events.manage');

  if p_action = 'start' then
    update public.events
    set timer_started_at = now()
    where id = p_event and timer_started_at is null;
  elsif p_action = 'pause' then
    update public.events
    set timer_elapsed_ms = timer_elapsed_ms
          + greatest(0, floor(extract(epoch from (now() - timer_started_at)) * 1000))::bigint,
        timer_started_at = null
    where id = p_event and timer_started_at is not null;
  elsif p_action = 'reset' then
    update public.events
    set timer_duration_s = null, timer_started_at = null, timer_elapsed_ms = 0
    where id = p_event;
  elsif p_action = 'add' then
    if p_seconds is null then
      raise exception 'add needs p_seconds' using errcode = '22023';
    end if;
    update public.events
    set timer_duration_s =
      least(14400, greatest(10, coalesce(timer_duration_s, pitch_minutes * 60) + p_seconds))
    where id = p_event;
  else
    raise exception 'unknown timer action %', p_action using errcode = '22023';
  end if;

  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'event % not found', p_event using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.pitch_timer(uuid, text, int) from public, anon;
grant execute on function public.pitch_timer(uuid, text, int) to authenticated;

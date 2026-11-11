-- Timer set-up: a countdown can run for a duration or until a time of day (a lunch
-- break that ends at 13:30), carry a label, and change colour as time runs out.
--
--   timer_target_at  when set, the timer counts down to this moment and cannot be paused;
--                    timer_started_at is when it was set (for the progress bar)
--   timer_label      what the countdown is for, when it isn't a team's pitch
--   timer_yellow_s   seconds left at which the clock turns yellow (wrap up)
--   timer_red_s      seconds left at which it turns red (stop); it stays red over time
-- The two wrap-up times belong to the event and survive stage changes; the rest is reset
-- whenever the team on stage changes. Mirrored in src/domain/pitchTimer.ts.

alter table public.events
  add column timer_target_at timestamptz,
  add column timer_label text check (timer_label is null or length(timer_label) between 1 and 80),
  add column timer_yellow_s int not null default 60 check (timer_yellow_s between 0 and 3600),
  add column timer_red_s int not null default 15 check (timer_red_s between 0 and 3600),
  add constraint events_timer_wrap_up_order check (timer_red_s <= timer_yellow_s);

create or replace function public.events_reset_timer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.now_pitching_team_id is distinct from old.now_pitching_team_id then
    new.timer_duration_s := null;
    new.timer_started_at := null;
    new.timer_elapsed_ms := 0;
    new.timer_target_at := null;
    new.timer_label := null;
  end if;
  return new;
end;
$$;

drop function public.pitch_timer(uuid, text, int);

-- Runs the timer. All timestamps are the database's.
--   start     begin or resume                 pause   stop, keeping the time used
--   reset     back to a full, stopped clock of the same length (a target time is dropped)
--   add       lengthen (negative: shorten) by p_seconds; moves a target time instead
--   duration  set up a stopped countdown of p_seconds, with an optional label;
--             null p_seconds means the event's pitch length
--   until     count down to p_target, with an optional label; starts at once
--   wrap_up   set the event's yellow (p_seconds) and red (p_red) times
create function public.pitch_timer(
  p_event uuid,
  p_action text,
  p_seconds int default null,
  p_target timestamptz default null,
  p_label text default null,
  p_red int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  perform public.require_permission('events.manage');

  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'event % not found', p_event using errcode = 'P0002';
  end if;

  if p_action = 'start' then
    update public.events
    set timer_started_at = now()
    where id = p_event and timer_started_at is null and timer_target_at is null;
  elsif p_action = 'pause' then
    update public.events
    set timer_elapsed_ms = timer_elapsed_ms
          + greatest(0, floor(extract(epoch from (now() - timer_started_at)) * 1000))::bigint,
        timer_started_at = null
    where id = p_event and timer_started_at is not null and timer_target_at is null;
  elsif p_action = 'reset' then
    update public.events
    set timer_started_at = null, timer_elapsed_ms = 0, timer_target_at = null
    where id = p_event;
  elsif p_action = 'add' then
    if p_seconds is null then
      raise exception 'add needs p_seconds' using errcode = '22023';
    end if;
    update public.events
    set timer_target_at = timer_target_at + make_interval(secs => p_seconds),
        timer_duration_s = case
          when timer_target_at is not null then timer_duration_s
          else least(14400, greatest(10, coalesce(timer_duration_s, pitch_minutes * 60) + p_seconds))
        end
    where id = p_event;
  elsif p_action = 'duration' then
    if p_seconds is not null and p_seconds not between 10 and 14400 then
      raise exception 'duration out of range' using errcode = '22023';
    end if;
    update public.events
    set timer_duration_s = p_seconds, timer_started_at = null, timer_elapsed_ms = 0,
        timer_target_at = null, timer_label = v_label
    where id = p_event;
  elsif p_action = 'until' then
    if p_target is null or p_target <= now() or p_target > now() + interval '24 hours' then
      raise exception 'target time must be within the next 24 hours' using errcode = '22023';
    end if;
    update public.events
    set timer_target_at = p_target, timer_started_at = now(), timer_elapsed_ms = 0,
        timer_duration_s = null, timer_label = v_label
    where id = p_event;
  elsif p_action = 'wrap_up' then
    if p_seconds is null or p_red is null or p_red > p_seconds then
      raise exception 'wrap-up needs yellow >= red' using errcode = '22023';
    end if;
    update public.events
    set timer_yellow_s = p_seconds, timer_red_s = p_red
    where id = p_event;
  else
    raise exception 'unknown timer action %', p_action using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.pitch_timer(uuid, text, int, timestamptz, text, int) from public, anon;
grant execute on function public.pitch_timer(uuid, text, int, timestamptz, text, int) to authenticated;

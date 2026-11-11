-- Re-opening an ended event ('open' override after ends_at) and later handing it back to
-- its dates ('auto') closes scoring at that moment. Before this, an 'auto' event always
-- closed at ends_at, so the hand-back retroactively closed scoring at the OLD ends_at:
-- every tap made while it was re-opened -- and the whole grace window -- was rejected.
--
-- The hand-back now stamps locked_at = now() (when it happens after ends_at), and an
-- 'auto' event closes at the later of ends_at and locked_at. Mirrored in
-- src/domain/eventPhase.ts (closedAt).

create or replace function public.event_closed_at(e public.events)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when e.status_override = 'locked' and e.locked_at is not null then e.locked_at
    when e.status_override = 'auto' and e.locked_at is not null and e.locked_at > e.ends_at
      then e.locked_at
    else e.ends_at
  end;
$$;

-- Locking (by any path: RPC, direct update, insert) stamps locked_at, which becomes the
-- closing time; re-locking after an unlock gets a fresh stamp. An insert may supply its own.
-- Going from 'open' back to 'auto' after ends_at also stamps it: that is when it closed.
create or replace function public.stamp_event_locked_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status_override = 'locked'
     and (tg_op = 'INSERT' and new.locked_at is null
          or tg_op = 'UPDATE' and old.status_override is distinct from 'locked') then
    new.locked_at := now();
  elsif tg_op = 'UPDATE'
        and old.status_override = 'open'
        and new.status_override = 'auto'
        and now() > new.ends_at then
    new.locked_at := now();
  end if;
  return new;
end;
$$;

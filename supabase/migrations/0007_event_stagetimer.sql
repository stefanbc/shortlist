-- Optional stagetimer.io viewer link per event. The organizer's live dashboard shows it
-- in a frame, so the room's timer sits next to "now pitching" and the live ranking.
-- Display only: Shortlist neither controls the timer nor reads its state.
--
-- Only https links on stagetimer.io are accepted, because the value is used as a frame
-- source. Jurors assigned to the event can read the row, so the app asks for the room's
-- viewer link and refuses a controller link.

alter table public.events
  add column stagetimer_url text
  check (
    stagetimer_url is null
    or (
      stagetimer_url ~ '^https://([a-z0-9-]+\.)?stagetimer\.io/'
      and stagetimer_url !~* 'controller'
      and length(stagetimer_url) <= 500
    )
  );

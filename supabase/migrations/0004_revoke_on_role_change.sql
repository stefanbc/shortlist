-- A role change or deactivation must not leave a stale juror login link alive, and a
-- user who stops being a juror must not stay assigned to events (admins never judge).
-- Their scores stay: this only touches juror_tokens and event_jurors, never scores.
create function public.revoke_juror_access_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or (old.active and not new.active) then
    update public.juror_tokens
    set revoked_at = now()
    where juror_id = new.id and revoked_at is null;
  end if;

  if new.role is distinct from old.role and old.role = 'juror' then
    delete from public.event_jurors where juror_id = new.id;
  end if;

  return new;
end;
$$;

create trigger profiles_revoke_juror_access
  after update of role, active on public.profiles
  for each row
  when (old.role is distinct from new.role or old.active is distinct from new.active)
  execute function public.revoke_juror_access_on_profile_change();

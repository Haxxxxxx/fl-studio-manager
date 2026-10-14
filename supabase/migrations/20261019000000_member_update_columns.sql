-- Members may change only their display name.
-- Before: the update grant on crew_members covered every column and the
-- guard checked role, crew and user only, so a member could backdate their
-- own joined_at; when the owner leaves, the earliest joiner becomes owner
-- (after_member_left), so that was a way to take over the crew.
-- Now clients can update display_name and nothing else (the guarded
-- functions and triggers run as the table owner and keep working), and the
-- guard refuses a joined_at change too, as a second lock.

revoke update on public.crew_members from authenticated;
grant update (display_name) on public.crew_members to authenticated;

create or replace function public.guard_member_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role
          or new.crew_id is distinct from old.crew_id
          or new.user_id is distinct from old.user_id
          or new.joined_at is distinct from old.joined_at) then
    raise exception 'only display_name can change' using errcode = '42501';
  end if;
  return new;
end;
$$;

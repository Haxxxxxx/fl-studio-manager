-- Delete a crew (part C1). The owner deletes the whole crew in one call:
-- every member loses access and the shared rows go (songs, releases,
-- columns, invites, members, by cascade). Nothing on anyone's computer is
-- touched: the apps go back to solo mode.
--
-- Until now the only way was removing every member then leaving, and the
-- direct crews_delete policy let an owner delete the row from the client
-- with no checks. Now delete_crew() is the only way.

-- ------------------------------------------------- 1. no direct deletes
drop policy if exists crews_delete on public.crews;
revoke delete on public.crews from authenticated;

-- ----------------------------------- 2. the trigger skips a crew delete
-- Deleting the crew cascades to crew_members, which fires after_member_left
-- once per member. While the crew itself is going there is nobody to hand
-- it over to and nothing to delete twice: delete_crew() sets a
-- transaction-local flag for that crew and the handover is skipped.
-- (Clients can't set it: set_config isn't exposed through the API.)
create or replace function public.after_member_left()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  if current_setting('hivo.deleting_crew', true) = old.crew_id::text then
    return old;
  end if;
  delete from public.songs where crew_id = old.crew_id and owner_id = old.user_id;
  delete from public.releases where crew_id = old.crew_id and owner_id = old.user_id;
  -- Removed by someone else (an owner), not leaving: the codes they may
  -- still hold stop working.
  if (select auth.uid()) is distinct from old.user_id then
    delete from public.crew_invites where crew_id = old.crew_id;
  end if;
  if old.role = 'owner' and not exists (
    select 1 from public.crew_members where crew_id = old.crew_id and role = 'owner'
  ) then
    select user_id into v_next from public.crew_members
      where crew_id = old.crew_id order by joined_at, user_id limit 1;
    if v_next is null then
      delete from public.crews where id = old.crew_id;
    else
      update public.crew_members set role = 'owner' where crew_id = old.crew_id and user_id = v_next;
    end if;
  end if;
  return old;
end;
$$;

-- ----------------------------------------------------- 3. delete_crew()
-- Owner only, and the crew's name must be typed back (the same check the
-- apps ask for), so a stray call can't delete a crew.
create function public.delete_crew(p_crew uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.is_crew_owner(p_crew) then
    raise exception 'only the owner can delete the crew' using errcode = '42501';
  end if;
  select name into v_name from public.crews where id = p_crew for update;
  if lower(btrim(coalesce(p_confirm_name, ''))) is distinct from lower(btrim(v_name)) then
    raise exception 'type the crew name to delete it' using errcode = '22023';
  end if;
  perform set_config('hivo.deleting_crew', p_crew::text, true);
  delete from public.crews where id = p_crew;
  perform set_config('hivo.deleting_crew', '', true);
end;
$$;

revoke execute on function public.after_member_left() from public, anon, authenticated;
revoke execute on function public.delete_crew(uuid, text) from public, anon;
grant execute on function public.delete_crew(uuid, text) to authenticated;

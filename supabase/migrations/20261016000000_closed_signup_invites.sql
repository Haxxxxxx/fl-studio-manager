-- Closed sign-up and tighter invites (security audit, Batch 0 item 6).
-- Sign-up is off (config.toml [auth] enable_signup = false, and the apps ask
-- with shouldCreateUser: false): accounts are created by the crew admin, and
-- people join a crew with an invite code as before.
-- 1. At most 3 crews owned per person, and 2000 shared songs per person in
--    total (on top of 1000 per person per crew), so one account can't bloat
--    the free project.
-- 2. Removing a member revokes the crew's open invite codes, so the removed
--    person can't walk straight back in with a code they still have.
--    Chosen over a ban list: no new table and no "unban" screen; the owner
--    makes a fresh code for the next person. Leaving on your own revokes
--    nothing.
-- 3. join_crew: "already in 10 crews" no longer tells a valid code from a
--    wrong one. It returns null and counts as a failed try, like a bad code.
-- 4. Credits must be exactly { name, role, split } with bounded values, and
--    each tag at most 40 characters (the app already sends that). NOT VALID:
--    enforced on every write from now on, without failing on older rows.

-- -------------------------------------------------------- 1. owned crews
create or replace function public.create_crew(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_crew uuid;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.crew_members where user_id = v_uid) >= 10 then
    raise exception 'you are already in 10 crews' using errcode = 'P0001';
  end if;
  if (select count(*) from public.crew_members where user_id = v_uid and role = 'owner') >= 3 then
    raise exception 'you already own 3 crews' using errcode = 'P0001';
  end if;
  insert into public.crews (name, created_by) values (btrim(p_name), v_uid) returning id into v_crew;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_crew, v_uid, btrim(p_display_name), 'owner');
  return v_crew;
end;
$$;

-- ------------------------------------------------- 1. songs per person
create or replace function public.enforce_quotas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'songs' then
    if exists (select 1 from public.songs where id = new.id) then
      return new;
    end if;
    if (select count(*) from public.songs where crew_id = new.crew_id and owner_id = new.owner_id) >= 1000 then
      raise exception 'share limit reached (1000 songs per person per crew)' using errcode = 'P0001';
    end if;
    if (select count(*) from public.songs where owner_id = new.owner_id) >= 2000 then
      raise exception 'share limit reached (2000 songs per person)' using errcode = 'P0001';
    end if;
  else
    if exists (select 1 from public.releases where id = new.id) then
      return new;
    end if;
    if (select count(*) from public.releases where crew_id = new.crew_id) >= 500 then
      raise exception 'release limit reached (500 per crew)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------- 2. removal revokes invites
create or replace function public.after_member_left()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
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

-- ------------------------------------------- 3. no valid-code oracle
create or replace function public.join_crew(p_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.crew_invites;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.join_attempts where user_id = v_uid and at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many tries, wait 10 minutes' using errcode = 'P0001';
  end if;
  select * into v_invite from public.crew_invites
    where code = upper(btrim(p_code)) for update;
  if found and exists (select 1 from public.crew_members where crew_id = v_invite.crew_id and user_id = v_uid) then
    return v_invite.crew_id;
  end if;
  -- Unknown, expired, used up, or the person is already in 10 crews: one
  -- answer for all of them, and each counts as a failed try.
  if not found or v_invite.expires_at < now() or v_invite.uses >= v_invite.max_uses
     or (select count(*) from public.crew_members where user_id = v_uid) >= 10 then
    insert into public.join_attempts (user_id) values (v_uid);
    delete from public.join_attempts where at < now() - interval '1 day';
    return null;
  end if;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_invite.crew_id, v_uid, btrim(p_display_name), 'member');
  update public.crew_invites set uses = uses + 1 where code = v_invite.code;
  return v_invite.crew_id;
end;
$$;

-- --------------------------------------------- 4. credits and tags shape
create function public.valid_credits(p_credits jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_credits) = 'array' and not exists (
    select 1 from jsonb_array_elements(p_credits) e
    where jsonb_typeof(e) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(e) k) is distinct from array['name', 'role', 'split']
       or jsonb_typeof(e -> 'name') <> 'string' or char_length(e ->> 'name') not between 1 and 60
       or jsonb_typeof(e -> 'role') <> 'string' or char_length(e ->> 'role') > 40
       or not (jsonb_typeof(e -> 'split') = 'null'
               or (jsonb_typeof(e -> 'split') = 'number' and (e ->> 'split')::numeric between 0 and 100))
  )
$$;

create function public.valid_tags(p_tags text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(char_length(t) between 1 and 40), true) from unnest(p_tags) t
$$;

alter table public.songs
  add constraint songs_credits_shape check (public.valid_credits(credits)) not valid,
  add constraint songs_tags_length check (public.valid_tags(tags)) not valid;

-- ---------------------------------------------------------------- grants
revoke execute on function public.enforce_quotas() from public, anon, authenticated;
revoke execute on function public.after_member_left() from public, anon, authenticated;
revoke execute on function public.create_crew(text, text) from public, anon;
revoke execute on function public.join_crew(text, text) from public, anon;
grant execute on function public.create_crew(text, text) to authenticated;
grant execute on function public.join_crew(text, text) to authenticated;
revoke execute on function public.valid_credits(jsonb) from public, anon;
revoke execute on function public.valid_tags(text[]) from public, anon;
grant execute on function public.valid_credits(jsonb) to authenticated;
grant execute on function public.valid_tags(text[]) to authenticated;

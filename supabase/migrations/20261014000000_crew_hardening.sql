-- Crew hardening after the security and sync reviews (docs/ARCHITECTURE.md).
-- 1. No password logins: the app signs in by emailed code only. A password
--    set behind the app's back (open /signup) could otherwise be used to take
--    over the person who signs in with that email by code.
-- 2. Invite codes: at most 5 wrong codes per person per 10 minutes, and the
--    same answer for unknown, expired and used-up codes.
-- 3. Accounts can be deleted (GDPR): crews.created_by no longer blocks it.
-- 4. Size caps and quotas, so one account can't bloat everyone's board.
-- 5. Leaving: your shared songs and releases leave with you; if the owner
--    leaves, the longest-standing member becomes owner; an empty crew is deleted.
-- 6. Stage moves are stamped by the server, never by the client.

-- ------------------------------------------------------------ 1. passwords

-- GoTrue gives code-only accounts a random password too, so the account row
-- can't tell them apart. Instead, refuse any session whose login method is a
-- password: whoever set one (e.g. via the open /signup endpoint) can't use it.
create function public.reject_password_logins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.authentication_method = 'password' then
    raise exception 'passwords are disabled: sign in with an emailed code' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_password_logins before insert on auth.mfa_amr_claims
  for each row execute function public.reject_password_logins();

-- ------------------------------------------------------------ 2. invites

create table public.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index join_attempts_user_at on public.join_attempts (user_id, at);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Returns the crew id, or null when the code isn't valid (unknown, expired or
-- used up: deliberately indistinguishable). Failures are recorded, so this
-- can't raise on them (that would roll the record back).
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
  if not found or v_invite.expires_at < now() or v_invite.uses >= v_invite.max_uses then
    insert into public.join_attempts (user_id) values (v_uid);
    delete from public.join_attempts where at < now() - interval '1 day';
    return null;
  end if;
  if (select count(*) from public.crew_members where user_id = v_uid) >= 10 then
    raise exception 'you are already in 10 crews' using errcode = 'P0001';
  end if;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_invite.crew_id, v_uid, btrim(p_display_name), 'member');
  update public.crew_invites set uses = uses + 1 where code = v_invite.code;
  return v_invite.crew_id;
end;
$$;

-- --------------------------------------------------------- 3. deletion

alter table public.crews alter column created_by drop not null;

-- ---------------------------------------------------- 4. caps and quotas

alter table public.songs
  add constraint songs_tags_size check (pg_column_size(tags) <= 2048),
  add constraint songs_credits_size check (jsonb_array_length(credits) <= 30 and pg_column_size(credits) <= 8192);

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
  insert into public.crews (name, created_by) values (btrim(p_name), v_uid) returning id into v_crew;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_crew, v_uid, btrim(p_display_name), 'owner');
  return v_crew;
end;
$$;

create or replace function public.create_invite(p_crew uuid, p_max_uses int default 10)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
begin
  if not public.is_crew_owner(p_crew) then
    raise exception 'only a crew owner can create invites' using errcode = '42501';
  end if;
  delete from public.crew_invites where crew_id = p_crew and (expires_at < now() or uses >= max_uses);
  if (select count(*) from public.crew_invites where crew_id = p_crew) >= 20 then
    raise exception 'too many open invites: revoke some first' using errcode = 'P0001';
  end if;
  for attempt in 1..5 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    begin
      insert into public.crew_invites (code, crew_id, created_by, max_uses)
        values (v_code, p_crew, (select auth.uid()), p_max_uses);
      return v_code;
    exception when unique_violation then
      -- Astronomically rare: pick another code.
    end;
  end loop;
  raise exception 'could not generate a unique invite code, try again' using errcode = 'P0001';
end;
$$;

create function public.enforce_quotas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'songs' then
    if (select count(*) from public.songs where crew_id = new.crew_id and owner_id = new.owner_id) >= 1000 then
      raise exception 'share limit reached (1000 songs per person per crew)' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.releases where crew_id = new.crew_id) >= 500 then
    raise exception 'release limit reached (500 per crew)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger songs_quota before insert on public.songs
  for each row execute function public.enforce_quotas();
create trigger releases_quota before insert on public.releases
  for each row execute function public.enforce_quotas();

-- -------------------------------------------------------------- 5. leaving

-- Role changes are allowed only from inside the guarded functions/triggers
-- (which run as the table owner), never from a signed-in client directly.
create or replace function public.guard_member_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role or new.crew_id is distinct from old.crew_id or new.user_id is distinct from old.user_id) then
    raise exception 'only display_name can change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.after_member_left()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  delete from public.songs where crew_id = old.crew_id and owner_id = old.user_id;
  delete from public.releases where crew_id = old.crew_id and owner_id = old.user_id;
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

create trigger crew_members_left after delete on public.crew_members
  for each row execute function public.after_member_left();

-- ----------------------------------------------------- 6. stage stamps

-- A client writing a song directly can't fake who moved it or when: a new
-- song is stamped now/by its owner; a stage change is stamped now/by the
-- caller; any other update keeps the existing stamp. set_song_stage runs as
-- the table owner and stamps itself.
create function public.stamp_song_stage()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_updated_at := now();
    new.stage_updated_by := (select auth.uid());
  else
    new.stage_updated_at := old.stage_updated_at;
    new.stage_updated_by := old.stage_updated_by;
  end if;
  return new;
end;
$$;

create trigger songs_stamp_stage before insert or update on public.songs
  for each row execute function public.stamp_song_stage();

-- ---------------------------------------------------------------- grants

revoke execute on function public.reject_password_logins() from public, anon, authenticated;
revoke execute on function public.enforce_quotas() from public, anon, authenticated;
revoke execute on function public.after_member_left() from public, anon, authenticated;
revoke execute on function public.stamp_song_stage() from public, anon, authenticated;
revoke execute on function public.is_crew_member(uuid) from public, anon;
revoke execute on function public.is_crew_owner(uuid) from public, anon;
grant execute on function public.is_crew_member(uuid) to authenticated;
grant execute on function public.is_crew_owner(uuid) to authenticated;

-- Crew sharing (docs/ARCHITECTURE.md). Every table has row-level security:
-- only members of a crew can see that crew's data. Writes that need extra
-- checks go through the security-definer functions at the bottom.

-- ---------------------------------------------------------------- tables

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

create table public.crew_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  crew_id uuid not null references public.crews (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 10 check (max_uses between 1 and 50),
  uses int not null default 0
);
create index crew_invites_crew_idx on public.crew_invites (crew_id);

-- A song's shared metadata. Never audio, file paths, samples or notes.
create table public.songs (
  id uuid primary key,
  crew_id uuid not null references public.crews (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  stage text check (stage in ('creation', 'production', 'prep', 'release', 'promotion')),
  bpm numeric(6, 2) check (bpm between 10 and 522),
  musical_key text check (char_length(musical_key) <= 8),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  -- [{ "name": "...", "role": "...", "split": 50 }]
  credits jsonb not null default '[]' check (jsonb_typeof(credits) = 'array'),
  release_date date,
  has_mixdown boolean not null default false,
  kit_accepted boolean not null default false,
  last_saved_at timestamptz,
  stage_updated_at timestamptz not null default now(),
  stage_updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index songs_crew_idx on public.songs (crew_id);

create table public.releases (
  id uuid primary key,
  crew_id uuid not null references public.crews (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind text not null default 'album' check (kind in ('album', 'ep', 'single', 'mixtape')),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  release_date date,
  song_ids uuid[] not null default '{}' check (cardinality(song_ids) <= 100),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index releases_crew_idx on public.releases (crew_id);

-- --------------------------------------------------------------- helpers

-- Security definer so policies on crew_members can use it without recursion.
create function public.is_crew_member(p_crew uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew and m.user_id = (select auth.uid())
  );
$$;

create function public.is_crew_owner(p_crew uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = p_crew and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- updated_at on every change; crew_id/owner_id can never be reassigned.
create function public.touch_and_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.crew_id is distinct from old.crew_id or new.owner_id is distinct from old.owner_id then
    raise exception 'crew_id and owner_id cannot change' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger songs_touch before update on public.songs
  for each row execute function public.touch_and_guard();
create trigger releases_touch before update on public.releases
  for each row execute function public.touch_and_guard();

-- --------------------------------------------------------------- RLS

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_invites enable row level security;
alter table public.songs enable row level security;
alter table public.releases enable row level security;

-- Crews: members see theirs; owners rename/delete. Created via create_crew().
create policy crews_select on public.crews for select to authenticated
  using (public.is_crew_member(id));
create policy crews_update on public.crews for update to authenticated
  using (public.is_crew_owner(id)) with check (public.is_crew_owner(id));
create policy crews_delete on public.crews for delete to authenticated
  using (public.is_crew_owner(id));

-- Members: see your crewmates; rename yourself; leave, or be removed by an
-- owner. Joining goes through join_crew().
create policy members_select on public.crew_members for select to authenticated
  using (public.is_crew_member(crew_id));
create policy members_update_self on public.crew_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Renaming yourself is the only allowed change: no self-promotion to owner,
-- no moving a membership to another crew or user.
create function public.guard_member_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.crew_id is distinct from old.crew_id or new.user_id is distinct from old.user_id then
    raise exception 'only display_name can change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger crew_members_guard before update on public.crew_members
  for each row execute function public.guard_member_update();
create policy members_delete on public.crew_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_crew_owner(crew_id));

-- Invites: owners see and revoke them. Created via create_invite().
create policy invites_select on public.crew_invites for select to authenticated
  using (public.is_crew_owner(crew_id));
create policy invites_delete on public.crew_invites for delete to authenticated
  using (public.is_crew_owner(crew_id));

-- Songs: the crew sees them; only the owner writes them. Moving a crewmate's
-- song on the board goes through set_song_stage().
create policy songs_select on public.songs for select to authenticated
  using (public.is_crew_member(crew_id));
create policy songs_insert on public.songs for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_crew_member(crew_id));
create policy songs_update on public.songs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_crew_member(crew_id));
create policy songs_delete on public.songs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy releases_select on public.releases for select to authenticated
  using (public.is_crew_member(crew_id));
create policy releases_insert on public.releases for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_crew_member(crew_id));
create policy releases_update on public.releases for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_crew_member(crew_id));
create policy releases_delete on public.releases for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ------------------------------------------------------ guarded actions

create function public.create_crew(p_name text, p_display_name text)
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
  insert into public.crews (name, created_by) values (btrim(p_name), v_uid) returning id into v_crew;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_crew, v_uid, btrim(p_display_name), 'owner');
  return v_crew;
end;
$$;

-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
create function public.create_invite(p_crew uuid, p_max_uses int default 10)
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

-- Join with a code. Joining a crew you're already in is a no-op.
create function public.join_crew(p_code text, p_display_name text)
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
  select * into v_invite from public.crew_invites
    where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.crew_members where crew_id = v_invite.crew_id and user_id = v_uid) then
    return v_invite.crew_id;
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite code expired' using errcode = 'P0001';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite code already used up' using errcode = 'P0001';
  end if;
  insert into public.crew_members (crew_id, user_id, display_name, role)
    values (v_invite.crew_id, v_uid, btrim(p_display_name), 'member');
  update public.crew_invites set uses = uses + 1 where code = v_invite.code;
  return v_invite.crew_id;
end;
$$;

-- The shared board: any crew member can move any crew song between stages.
create function public.set_song_stage(p_song uuid, p_stage text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_crew uuid;
begin
  select crew_id into v_crew from public.songs where id = p_song;
  if v_crew is null or not public.is_crew_member(v_crew) then
    raise exception 'song not found' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('creation', 'production', 'prep', 'release', 'promotion') then
    raise exception 'unknown stage %', p_stage using errcode = '22023';
  end if;
  update public.songs
    set stage = p_stage, stage_updated_at = now(), stage_updated_by = (select auth.uid())
    where id = p_song;
end;
$$;

-- Only signed-in users may call the actions; they check membership inside.
revoke execute on function public.create_crew(text, text) from public, anon;
revoke execute on function public.create_invite(uuid, int) from public, anon;
revoke execute on function public.join_crew(text, text) from public, anon;
revoke execute on function public.set_song_stage(uuid, text) from public, anon;
grant execute on function public.create_crew(text, text) to authenticated;
grant execute on function public.create_invite(uuid, int) to authenticated;
grant execute on function public.join_crew(text, text) to authenticated;
grant execute on function public.set_song_stage(uuid, text) to authenticated;

-- Table privileges: only what the policies above are meant to allow.
-- Creating crews, joining and inviting stay function-only.
grant select, update, delete on public.crews to authenticated;
grant select, update, delete on public.crew_members to authenticated;
grant select, delete on public.crew_invites to authenticated;
grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.releases to authenticated;

-- Anonymous visitors get nothing at all.
revoke all on public.crews, public.crew_members, public.crew_invites, public.songs, public.releases from anon;

-- Live updates for the board.
alter publication supabase_realtime add table public.songs, public.releases, public.crew_members;

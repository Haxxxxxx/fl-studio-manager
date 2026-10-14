-- Crew board columns, like the personal board's.
-- Each column has a name and sits on one fixed lifecycle stage (or null =
-- Unsorted). Columns never replace stages: a song's stage stays the source of
-- truth, a column is only where its card sits inside that stage.
-- Only the crew owner edits the columns (set_crew_columns); any member moves
-- cards (move_crew_card). Moving a card into a column of another stage is a
-- stage move with the same clock-proof version check as move_song_stage.
-- A crew with no columns shows one default column per stage (client side).

-- ---------------------------------------------------------------- table

create table public.crew_columns (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  stage text check (stage in ('creation', 'production', 'prep', 'release', 'promotion')), -- null = Unsorted
  position int not null,
  created_at timestamptz not null default now()
);
create index crew_columns_crew_idx on public.crew_columns (crew_id);

-- Members read; nobody writes directly (set_crew_columns only).
alter table public.crew_columns enable row level security;
create policy crew_columns_select on public.crew_columns for select to authenticated
  using (public.is_crew_member(crew_id));

revoke all on public.crew_columns from anon, authenticated;
grant select on public.crew_columns to authenticated;

alter publication supabase_realtime add table public.crew_columns;

-- ---------------------------------------------------------- song fields

alter table public.songs
  add column column_id uuid references public.crew_columns (id) on delete set null,
  add column board_order double precision;

-- A song's column must belong to the song's crew. A column of another stage
-- than the song's is dropped (the card falls back to its stage's default
-- column), so a stage move made anywhere else (move_song_stage, the owner's
-- app) never leaves a card in the wrong stage's column.
create function public.guard_song_column()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_crew uuid;
  v_stage text;
begin
  if new.column_id is null then
    return new;
  end if;
  select c.crew_id, c.stage into v_crew, v_stage from public.crew_columns c where c.id = new.column_id;
  if not found or v_crew <> new.crew_id then
    raise exception 'column not in this crew' using errcode = '22023';
  end if;
  if v_stage is distinct from new.stage then
    new.column_id := null;
  end if;
  return new;
end;
$$;

create trigger songs_column_guard before insert or update of column_id, stage, crew_id on public.songs
  for each row execute function public.guard_song_column();

-- -------------------------------------------------------- owner: columns

-- p_columns: [{ "id"?: uuid, "name": text, "stage": text | null }], 1..30,
-- in display order. Known ids of this crew are updated in place (songs stay
-- pinned), unknown ids are created with that id, no id gets a new one.
-- This crew's columns missing from the list are deleted (their songs go back
-- to the stage's default column). Every stage, Unsorted included, needs at
-- least one column.
create function public.set_crew_columns(p_crew uuid, p_columns jsonb)
returns setof public.crew_columns
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_stages text[] := '{}';
  v_id uuid;
  v_name text;
  v_stage text;
  v_crew uuid;
  v_old_stage text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_crew is null or not public.is_crew_owner(p_crew) then
    raise exception 'only a crew owner can edit the columns' using errcode = '42501';
  end if;
  if p_columns is null or jsonb_typeof(p_columns) <> 'array'
     or jsonb_array_length(p_columns) not between 1 and 30 then
    raise exception 'columns must be a list of 1 to 30' using errcode = '22023';
  end if;

  -- Validate everything before writing anything.
  for v_item in select e.value from jsonb_array_elements(p_columns) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each column must be an object' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or char_length(btrim(v_item ->> 'name')) not between 1 and 40 then
      raise exception 'column names are 1 to 40 characters' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_item -> 'stage'), 'null') not in ('null', 'string')
       or (v_item ->> 'stage') not in ('creation', 'production', 'prep', 'release', 'promotion') then
      raise exception 'unknown stage %', v_item ->> 'stage' using errcode = '22023';
    end if;
    v_id := null;
    if coalesce(jsonb_typeof(v_item -> 'id'), 'null') <> 'null' then
      begin
        v_id := (v_item ->> 'id')::uuid;
      exception when others then
        raise exception 'bad column id' using errcode = '22023';
      end;
      if v_id = any (v_ids) then
        raise exception 'column % listed twice', v_id using errcode = '22023';
      end if;
      select c.crew_id into v_crew from public.crew_columns c where c.id = v_id;
      if found and v_crew <> p_crew then
        raise exception 'column not in this crew' using errcode = '22023';
      end if;
    end if;
    v_ids := v_ids || coalesce(v_id, gen_random_uuid());
    v_names := v_names || btrim(v_item ->> 'name');
    v_stages := v_stages || (v_item ->> 'stage');
  end loop;

  if (select count(distinct coalesce(s, '')) from unnest(v_stages) as s) < 6 then
    raise exception 'every stage needs a column' using errcode = '22023';
  end if;

  -- One edit at a time per crew.
  perform 1 from public.crews where id = p_crew for update;

  delete from public.crew_columns c where c.crew_id = p_crew and c.id <> all (v_ids);

  for i in 1 .. array_length(v_ids, 1) loop
    select c.stage into v_old_stage from public.crew_columns c where c.id = v_ids[i] and c.crew_id = p_crew;
    if found then
      -- A column moved to another stage drops the cards of the old stage.
      if v_old_stage is distinct from v_stages[i] then
        update public.songs s set column_id = null where s.column_id = v_ids[i];
      end if;
      update public.crew_columns c
        set name = v_names[i], stage = v_stages[i], position = i - 1
        where c.id = v_ids[i] and c.crew_id = p_crew;
    else
      insert into public.crew_columns (id, crew_id, name, stage, position)
        values (v_ids[i], p_crew, v_names[i], v_stages[i], i - 1);
    end if;
  end loop;

  return query select * from public.crew_columns c where c.crew_id = p_crew order by c.position;
end;
$$;

-- -------------------------------------------------------- member: cards

-- Note: an owner deleting a column while someone drops a card into it can
-- deadlock (40P01) in Postgres; one of the two calls fails and the app
-- rolls back and says so. Rare enough to leave.
-- Same stage: only the column and order change (no version check, the stage
-- stamps stay). Another stage: a stage move, applied only if the song is
-- still on the version the caller saw (millisecond precision); otherwise
-- nothing changes and the current values come back.
create function public.move_crew_card(p_song uuid, p_column uuid, p_order double precision, p_expected_at timestamptz)
returns table (applied boolean, stage text, stage_updated_at timestamptz, stage_updated_by uuid, column_id uuid, board_order double precision)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.songs;
  v_crew uuid;
  v_stage text;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_row from public.songs s where s.id = p_song for update;
  if not found or not public.is_crew_member(v_row.crew_id) then
    raise exception 'song not found' using errcode = 'P0002';
  end if;
  if p_column is null then
    raise exception 'column not in this crew' using errcode = '22023';
  end if;
  if p_order is not null and (p_order = 'NaN'::double precision or p_order in ('Infinity'::double precision, '-Infinity'::double precision)) then
    raise exception 'bad card order' using errcode = '22023';
  end if;
  select c.crew_id, c.stage into v_crew, v_stage from public.crew_columns c where c.id = p_column;
  if not found or v_crew <> v_row.crew_id then
    raise exception 'column not in this crew' using errcode = '22023';
  end if;

  if v_stage is not distinct from v_row.stage then
    return query
      update public.songs s
        set column_id = p_column, board_order = p_order
        where s.id = p_song
        returning true, s.stage, s.stage_updated_at, s.stage_updated_by, s.column_id, s.board_order;
    return;
  end if;

  if p_expected_at is null
     or date_trunc('milliseconds', v_row.stage_updated_at) <> date_trunc('milliseconds', p_expected_at) then
    return query select false, v_row.stage, v_row.stage_updated_at, v_row.stage_updated_by, v_row.column_id, v_row.board_order;
    return;
  end if;

  return query
    update public.songs s
      set stage = v_stage, stage_updated_at = now(), stage_updated_by = (select auth.uid()),
          column_id = p_column, board_order = p_order
      where s.id = p_song
      returning true, s.stage, s.stage_updated_at, s.stage_updated_by, s.column_id, s.board_order;
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.guard_song_column() from public, anon, authenticated;
revoke execute on function public.set_crew_columns(uuid, jsonb) from public, anon;
revoke execute on function public.move_crew_card(uuid, uuid, double precision, timestamptz) from public, anon;
grant execute on function public.set_crew_columns(uuid, jsonb) to authenticated;
grant execute on function public.move_crew_card(uuid, uuid, double precision, timestamptz) to authenticated;

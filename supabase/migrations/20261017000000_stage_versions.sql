-- Stage moves without trusting anyone's clock.
-- Before: the desktop app compared its own clock with the server's to decide
-- whose stage move was newer, so a computer with a wrong clock could
-- silently overwrite a crewmate's move (or lose its own).
-- Now a move says which version of the song it was made on (the
-- stage_updated_at it last saw). If someone moved the song since, the move
-- is not applied and the caller gets the crewmate's move back, to show "X
-- moved it to Y meanwhile: keep theirs or yours?". Versions are compared at
-- millisecond precision (what JavaScript dates carry).
-- set_song_stage stays for app builds that don't know about versions yet.

create function public.move_song_stage(p_song uuid, p_stage text, p_expected_at timestamptz)
returns table (applied boolean, stage text, stage_updated_at timestamptz, stage_updated_by uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.songs;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_row from public.songs s where s.id = p_song for update;
  if not found or not public.is_crew_member(v_row.crew_id) then
    raise exception 'song not found' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('creation', 'production', 'prep', 'release', 'promotion') then
    raise exception 'unknown stage %', p_stage using errcode = '22023';
  end if;
  -- Someone moved it since the caller last looked: theirs stands.
  if p_expected_at is null
     or date_trunc('milliseconds', v_row.stage_updated_at) <> date_trunc('milliseconds', p_expected_at) then
    return query select false, v_row.stage, v_row.stage_updated_at, v_row.stage_updated_by;
    return;
  end if;
  return query
    update public.songs s
      set stage = p_stage, stage_updated_at = now(), stage_updated_by = (select auth.uid())
      where s.id = p_song
      returning true, s.stage, s.stage_updated_at, s.stage_updated_by;
end;
$$;

revoke execute on function public.move_song_stage(uuid, text, timestamptz) from public, anon;
grant execute on function public.move_song_stage(uuid, text, timestamptz) to authenticated;

-- Quotas vs upserts (docs/ARCHITECTURE.md). The songs/releases quota
-- triggers are BEFORE INSERT, and Postgres fires them for the INSERT half of
-- INSERT ... ON CONFLICT DO UPDATE too, before it finds the conflict. So
-- someone at exactly 1000 shared songs could no longer update any of them
-- (the app always writes with upsert). A row whose id already exists isn't a
-- new row: skip the count for it. The conflict then turns it into an update,
-- which the update policies check as usual.

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

revoke execute on function public.enforce_quotas() from public, anon, authenticated;

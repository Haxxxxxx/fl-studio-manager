-- Quotas vs upserts (supabase/migrations/*_crew_quota_upsert.sql): at the cap,
-- existing rows can still be upserted; only new rows are refused.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Night Crew', 'Ana')::text);

-- Fill both quotas exactly (triggers off for speed; the setup isn't under test).
reset role;
alter table public.songs disable trigger songs_quota;
alter table public.releases disable trigger releases_quota;
insert into public.songs (id, crew_id, owner_id, title)
  select ('50000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, (select v::uuid from ids where k = 'crew'),
         'a0000000-0000-0000-0000-000000000001', 'Song ' || g
  from generate_series(1, 1000) g;
insert into public.releases (id, crew_id, owner_id, title)
  select ('70000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, (select v::uuid from ids where k = 'crew'),
         'a0000000-0000-0000-0000-000000000001', 'Release ' || g
  from generate_series(1, 500) g;
alter table public.songs enable trigger songs_quota;
alter table public.releases enable trigger releases_quota;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ------------------------------------------------------------ songs
select throws_ok(
  $$ insert into public.songs (id, crew_id, title)
     values ('50000000-0000-0000-0000-999999999999', (select v::uuid from ids where k = 'crew'), 'One too many') $$,
  'P0001', null, 'at 1000 songs a new song is refused');
select lives_ok(
  $$ insert into public.songs (id, crew_id, title)
     values ('50000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Song 1 (renamed)')
     on conflict (id) do update set title = excluded.title $$,
  'at 1000 songs an existing song can still be upserted');
select is((select title from public.songs where id = '50000000-0000-0000-0000-000000000001'), 'Song 1 (renamed)',
  'the upsert updated the row');
select lives_ok(
  $$ insert into public.songs (id, crew_id, title)
     values ('50000000-0000-0000-0000-000000000002', (select v::uuid from ids where k = 'crew'), 'ignored')
     on conflict (id) do nothing $$,
  'at 1000 songs an upsert that ignores duplicates still works');
select is((select count(*)::int from public.songs where crew_id = (select v::uuid from ids where k = 'crew')), 1000,
  'still exactly 1000 songs');

-- ------------------------------------------------------------ releases
select throws_ok(
  $$ insert into public.releases (id, crew_id, title)
     values ('70000000-0000-0000-0000-999999999999', (select v::uuid from ids where k = 'crew'), 'One too many') $$,
  'P0001', null, 'at 500 releases a new release is refused');
select lives_ok(
  $$ insert into public.releases (id, crew_id, title)
     values ('70000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Release 1 (renamed)')
     on conflict (id) do update set title = excluded.title $$,
  'at 500 releases an existing release can still be upserted');
select is((select title from public.releases where id = '70000000-0000-0000-0000-000000000001'), 'Release 1 (renamed)',
  'the release upsert updated the row');

select * from finish();
rollback;

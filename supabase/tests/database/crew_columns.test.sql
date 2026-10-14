-- Crew board columns (set_crew_columns, move_crew_card).
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- The default layout: one column per stage, Unsorted included.
create temp table defaults as select '[
  {"name": "Unsorted", "stage": null},
  {"name": "Creation", "stage": "creation"},
  {"name": "Production", "stage": "production"},
  {"name": "Prep", "stage": "prep"},
  {"name": "Release", "stage": "release"},
  {"name": "Promotion", "stage": "promotion"}
]'::jsonb as v;
grant all on defaults to authenticated, anon;

set local role authenticated;

-- Cleo has her own crew and columns.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into ids values ('other', public.create_crew('Other', 'Cleo')::text);
insert into ids values ('foreign', (select id::text from public.set_crew_columns((select v::uuid from ids where k = 'other'), (select v from defaults)) limit 1));

-- Ana's crew, Ben joins, Ana shares a song.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));
insert into public.songs (id, crew_id, title, stage) values ('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Night Run', 'production');
-- now() is frozen inside a test transaction: date the first version an hour back.
reset role;
update public.songs set stage_updated_at = now() - interval '1 hour' where id = '5a000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into ids values ('v0', (select stage_updated_at::text from public.songs where id = '5a000000-0000-0000-0000-000000000001'));

-- Owner sets the columns.
create temp table cols as select * from public.set_crew_columns((select v::uuid from ids where k = 'crew'), (select v from defaults));
grant all on cols to authenticated, anon;
select is((select count(*) from cols)::int, 6, 'the owner sets the columns');
select is((select array_agg(name order by position) from cols), array['Unsorted', 'Creation', 'Production', 'Prep', 'Release', 'Promotion'], 'returned in order');

-- Refusals.
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'), (select v - 0 from defaults)) $$,
  '22023', 'every stage needs a column', 'every stage needs a column (Unsorted too)');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'),
  (select v || (select jsonb_agg(jsonb_build_object('name', 'X' || g, 'stage', 'prep')) from generate_series(1, 25) g) from defaults)) $$,
  '22023', null, 'more than 30 columns are refused');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'), '[]'::jsonb) $$,
  '22023', null, 'an empty list is refused');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'), (select v || '[{"name": "   ", "stage": "prep"}]' from defaults)) $$,
  '22023', null, 'a blank name is refused');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'), (select v || '[{"name": "Mix", "stage": "mixing"}]' from defaults)) $$,
  '22023', null, 'an unknown stage is refused');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'),
  (select v || jsonb_build_array(jsonb_build_object('id', (select v from ids where k = 'foreign'), 'name', 'Stolen', 'stage', 'prep')) from defaults)) $$,
  '22023', null, 'another crew''s column id is refused');

-- Direct writes are refused, even for the owner.
select throws_ok($$ insert into public.crew_columns (crew_id, name, stage, position) values ((select v::uuid from ids where k = 'crew'), 'Direct', 'prep', 9) $$,
  '42501', null, 'the owner cannot insert columns directly');
select throws_ok($$ update public.crew_columns set name = 'Direct' $$, '42501', null, 'the owner cannot update columns directly');
select throws_ok($$ delete from public.crew_columns $$, '42501', null, 'the owner cannot delete columns directly');

-- Rename Production in place and add Mixing + a second Prep column: ids stay.
insert into ids values ('production', (select id::text from cols where stage = 'production'));
insert into ids values ('prep', (select id::text from cols where stage = 'prep'));
create temp table cols2 as select * from public.set_crew_columns((select v::uuid from ids where k = 'crew'), jsonb_build_array(
  jsonb_build_object('id', (select id from cols where name = 'Unsorted'), 'name', 'Unsorted', 'stage', null),
  jsonb_build_object('id', (select id from cols where name = 'Creation'), 'name', 'Creation', 'stage', 'creation'),
  jsonb_build_object('id', (select v from ids where k = 'production'), 'name', 'Beats', 'stage', 'production'),
  jsonb_build_object('name', 'Mixing', 'stage', 'production'),
  jsonb_build_object('id', (select v from ids where k = 'prep'), 'name', 'Prep', 'stage', 'prep'),
  jsonb_build_object('name', 'Prep B', 'stage', 'prep'),
  jsonb_build_object('id', (select id from cols where name = 'Release'), 'name', 'Release', 'stage', 'release'),
  jsonb_build_object('id', (select id from cols where name = 'Promotion'), 'name', 'Promotion', 'stage', 'promotion')));
grant all on cols2 to authenticated, anon;
select is((select name from cols2 where id = (select v::uuid from ids where k = 'production')), 'Beats', 'an existing column keeps its id when renamed');
select is((select count(*) from cols2)::int, 8, 'new columns are added');
insert into ids values ('mixing', (select id::text from cols2 where name = 'Mixing'));
insert into ids values ('prepb', (select id::text from cols2 where name = 'Prep B'));

-- Ben (member) reads but can't edit; Cleo (outsider) sees nothing.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');
select is((select count(*) from public.crew_columns where crew_id = (select v::uuid from ids where k = 'crew'))::int, 8, 'a member reads the crew''s columns');
select throws_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'), (select v from defaults)) $$,
  '42501', null, 'a member cannot edit the columns');

-- Ben moves the card within Production: no version check, stage stamps untouched.
select is((select applied from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'mixing'), 1.5, null)),
  true, 'a move within the same stage is applied');
select is((select column_id from public.songs where id = '5a000000-0000-0000-0000-000000000001'), (select v::uuid from ids where k = 'mixing'), 'the card is in the new column');
select is((select stage_updated_at::text from public.songs where id = '5a000000-0000-0000-0000-000000000001'), (select v from ids where k = 'v0'), 'stage_updated_at is unchanged');

-- Ben moves it to Prep B on the right version: a stage move.
select is((select applied from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'prepb'), 2, (select v::timestamptz from ids where k = 'v0'))),
  true, 'a cross-stage move on the current version is applied');
select is((select stage from public.songs where id = '5a000000-0000-0000-0000-000000000001'), 'prep', 'the stage follows the column');
select is((select stage_updated_by from public.songs where id = '5a000000-0000-0000-0000-000000000001'), 'b0000000-0000-0000-0000-000000000002'::uuid, 'stamped by the mover');

-- Ana moves it on the OLD version: refused, nothing changes.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table answer as
  select * from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'mixing'), 3, (select v::timestamptz from ids where k = 'v0'));
select is((select applied from answer), false, 'a cross-stage move on an outdated version is not applied');
select is((select stage || '/' || column_id::text from answer), 'prep/' || (select v from ids where k = 'prepb'), 'the answer carries the current stage and column');
select is((select stage || '/' || column_id::text || '/' || board_order from public.songs where id = '5a000000-0000-0000-0000-000000000001'),
  'prep/' || (select v from ids where k = 'prepb') || '/2', 'nothing changed');

-- Foreign columns.
select throws_ok($$ select * from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'foreign'), 1, now()) $$,
  '22023', null, 'another crew''s column is refused in move_crew_card');
select throws_ok($$ select * from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'mixing'), 'NaN'::double precision, null) $$,
  '22023', null, 'a NaN card order is refused');
select throws_ok($$ update public.songs set column_id = (select v::uuid from ids where k = 'foreign') where id = '5a000000-0000-0000-0000-000000000001' $$,
  '22023', null, 'the song owner cannot pin it to another crew''s column directly');

-- The owner's app upserts without the board fields: they stay.
update public.songs set title = 'Night Run (v2)' where id = '5a000000-0000-0000-0000-000000000001';
select is((select column_id from public.songs where id = '5a000000-0000-0000-0000-000000000001'), (select v::uuid from ids where k = 'prepb'), 'a regular update keeps the column');

-- Removing a column sends its cards back to the stage's default column.
select lives_ok($$ select public.set_crew_columns((select v::uuid from ids where k = 'crew'),
  (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stage', stage) order by position) from cols2 where name <> 'Prep B')) $$,
  'the owner removes a column');
select is((select column_id from public.songs where id = '5a000000-0000-0000-0000-000000000001'), null, 'its songs lose their column');

-- A stage move made outside the board drops a column of the old stage.
select public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'prep'), 1, null);
select public.move_song_stage('5a000000-0000-0000-0000-000000000001', 'release',
  (select stage_updated_at from public.songs where id = '5a000000-0000-0000-0000-000000000001'));
select is((select column_id from public.songs where id = '5a000000-0000-0000-0000-000000000001'), null, 'a plain stage move drops the old stage''s column');

-- Outsiders and anonymous visitors.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.crew_columns where crew_id = (select v::uuid from ids where k = 'crew'))::int, 0, 'an outsider sees none of the crew''s columns');
select throws_ok($$ select * from public.move_crew_card('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'mixing'), 1, now()) $$,
  'P0002', 'song not found', 'an outsider cannot move a card');
select ok(not has_function_privilege('anon', 'public.move_crew_card(uuid, uuid, double precision, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_crew_columns(uuid, jsonb)', 'execute'), 'anonymous visitors cannot call them');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crew_columns'),
  'crew_columns is published for live updates');

select * from finish();
rollback;

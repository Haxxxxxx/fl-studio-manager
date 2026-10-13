-- Stage moves carry the version they were made on (move_song_stage).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));
insert into public.songs (id, crew_id, title, stage) values ('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Night Run', 'production');
-- now() is frozen inside a test transaction: date the first version an hour back.
reset role;
update public.songs set stage_updated_at = now() - interval '1 hour' where id = '5a000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into ids values ('v0', (select stage_updated_at::text from public.songs where id = '5a000000-0000-0000-0000-000000000001'));
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');

-- Ben moves it, based on the version he saw: applied.
select is(
  (select applied from public.move_song_stage('5a000000-0000-0000-0000-000000000001', 'prep', (select v::timestamptz from ids where k = 'v0'))),
  true, 'a move made on the current version is applied');
select is((select stage from public.songs where id = '5a000000-0000-0000-0000-000000000001'), 'prep', 'the stage changed');
select is((select stage_updated_by from public.songs where id = '5a000000-0000-0000-0000-000000000001'),
  'b0000000-0000-0000-0000-000000000002'::uuid, 'stamped by the mover');

-- Ana moves it based on the OLD version (her clock says she's newer): refused, Ben's move comes back.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table answer as
  select * from public.move_song_stage('5a000000-0000-0000-0000-000000000001', 'release', (select v::timestamptz from ids where k = 'v0'));
select is((select applied from answer), false, 'a move made on an outdated version is not applied');
select is((select stage from answer), 'prep', 'the answer carries the crewmate''s stage');
select is((select stage_updated_by from answer), 'b0000000-0000-0000-0000-000000000002'::uuid, 'and who moved it');
select is((select stage from public.songs where id = '5a000000-0000-0000-0000-000000000001'), 'prep', 'the crewmate''s move stands');

-- "Keep mine": retry on the version she was just shown.
select is(
  (select applied from public.move_song_stage('5a000000-0000-0000-0000-000000000001', 'release', (select stage_updated_at from answer))),
  true, 'keeping your own move after seeing theirs works');
select is((select stage from public.songs where id = '5a000000-0000-0000-0000-000000000001'), 'release', 'now it''s hers');

-- Outsiders and anonymous visitors.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select * from public.move_song_stage('5a000000-0000-0000-0000-000000000001', 'prep', now()) $$,
  'P0002', null, 'someone outside the crew cannot move it');
select ok(not has_function_privilege('anon', 'public.move_song_stage(uuid, text, timestamptz)', 'execute'), 'anonymous visitors cannot call it');

select * from finish();
rollback;

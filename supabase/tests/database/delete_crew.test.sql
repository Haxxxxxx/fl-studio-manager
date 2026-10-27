-- Deleting a crew (delete_crew), and leaving still working after the trigger change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

set local role authenticated;

-- Cleo has her own crew with a song.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into ids values ('other', public.create_crew('Other', 'Cleo')::text);
insert into public.songs (id, crew_id, title, stage) values ('5c000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'other'), 'Her Song', 'creation');

-- Ana's crew: Ben joins; both share a song, Ana a release; an invite and columns exist.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Night Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));
select public.set_crew_columns((select v::uuid from ids where k = 'crew'), '[
  {"name": "Unsorted", "stage": null}, {"name": "Creation", "stage": "creation"}, {"name": "Production", "stage": "production"},
  {"name": "Prep", "stage": "prep"}, {"name": "Release", "stage": "release"}, {"name": "Promotion", "stage": "promotion"}]'::jsonb);
insert into public.songs (id, crew_id, title, stage) values ('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Night Run', 'production');
insert into public.releases (id, crew_id, title) values ('7a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'The Tape');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');
insert into public.songs (id, crew_id, title, stage) values ('5b000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Ben Song', 'creation');

-- Refusals.
select throws_ok($$ select public.delete_crew((select v::uuid from ids where k = 'crew'), 'Night Crew') $$,
  '42501', 'only the owner can delete the crew', 'a member cannot delete the crew');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.delete_crew((select v::uuid from ids where k = 'crew'), 'Night Crew') $$,
  '42501', null, 'an outsider cannot delete the crew');
select ok(not has_function_privilege('anon', 'public.delete_crew(uuid, text)', 'execute'), 'anonymous visitors cannot call it');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.delete_crew((select v::uuid from ids where k = 'crew'), 'Day Crew') $$,
  '22023', 'type the crew name to delete it', 'the wrong name is refused');
select throws_ok($$ delete from public.crews where id = (select v::uuid from ids where k = 'crew') $$,
  '42501', null, 'the owner cannot delete the row directly any more');

-- The owner deletes it (name typed loosely).
select lives_ok($$ select public.delete_crew((select v::uuid from ids where k = 'crew'), '  night crew ') $$, 'the owner deletes the crew');

reset role;
select is((select count(*) from public.crews where id = (select v::uuid from ids where k = 'crew'))::int, 0, 'the crew is gone');
select is((select count(*) from public.crew_members where crew_id = (select v::uuid from ids where k = 'crew'))::int, 0, 'every member lost access');
select is((select count(*) from public.songs where id in ('5a000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001'))::int, 0, 'every member''s shared songs are gone');
select is((select count(*) from public.releases where id = '7a000000-0000-0000-0000-000000000001')::int, 0, 'shared releases are gone');
select is((select count(*) from public.crew_invites where code = (select v from ids where k = 'code'))::int, 0, 'invites are gone');
select is((select count(*) from public.crew_columns where crew_id = (select v::uuid from ids where k = 'crew'))::int, 0, 'columns are gone');
select is((select count(*) from public.songs where id = '5c000000-0000-0000-0000-000000000001')::int, 1, 'another crew''s song is untouched');
select is((select count(*) from public.crew_members where crew_id = (select v::uuid from ids where k = 'other'))::int, 1, 'another crew keeps its members');

-- Leaving still runs the old rules: the last member leaving deletes the crew.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
delete from public.crew_members where user_id = auth.uid();
reset role;
select is((select count(*) from public.crews where id = (select v::uuid from ids where k = 'other'))::int, 0, 'the last member leaving still deletes the crew');
select is((select count(*) from public.songs where id = '5c000000-0000-0000-0000-000000000001')::int, 0, 'and their songs leave with them');

select * from finish();
rollback;

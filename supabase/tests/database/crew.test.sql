-- Crew sharing rules (supabase/migrations/*_crew.sql), checked as real users.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Four people: Ana owns the crew, Ben joins it, Cleo joins later, Dan is an outsider.
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dan@test.local');

-- Values carried between steps.
create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- ----------------------------------------------------------- Ana (owner)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into ids values ('crew', public.create_crew('Night Crew', 'Ana')::text);
select is((select count(*)::int from public.crews), 1, 'Ana sees the crew she created');
select is((select role from public.crew_members where user_id = auth.uid()), 'owner', 'the creator is the owner');

insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 2));
select matches((select v from ids where k = 'code'), '^[A-HJ-NP-Z2-9]{8}$', 'invite codes are 8 unambiguous characters');

insert into public.songs (id, crew_id, title, stage, bpm, musical_key)
  values ('50000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'crew'), 'Night Run', 'production', 140, 'Am');
select is((select count(*)::int from public.songs), 1, 'Ana sees the song she shared');

-- ----------------------------------------------------------- Dan (outsider)
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select is((select count(*)::int from public.crews), 0, 'an outsider sees no crews');
select is((select count(*)::int from public.songs), 0, 'an outsider sees no songs');
select is((select count(*)::int from public.crew_members), 0, 'an outsider sees no members');
select is((select count(*)::int from public.crew_invites), 0, 'an outsider sees no invites');
select throws_ok(
  $$ select public.set_song_stage('50000000-0000-0000-0000-000000000001', 'prep') $$,
  'P0002', 'song not found', 'an outsider cannot move crew songs');
select throws_ok(
  $$ insert into public.songs (id, crew_id, title) values ('50000000-0000-0000-0000-000000000002', (select v::uuid from ids where k = 'crew'), 'Sneaky') $$,
  '42501', null, 'an outsider cannot add songs to the crew');
select throws_ok(
  $$ select public.create_invite((select v::uuid from ids where k = 'crew')) $$,
  '42501', null, 'an outsider cannot create invites');

-- ----------------------------------------------------------- Ben (member)
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(public.join_crew((select v from ids where k = 'code'), 'Ben'), (select v::uuid from ids where k = 'crew'), 'Ben joins with the code');
select is(public.join_crew(lower((select v from ids where k = 'code')), 'Ben'), (select v::uuid from ids where k = 'crew'), 'joining again is a no-op, and codes are case-insensitive');
select is((select count(*)::int from public.songs), 1, 'a member sees the crew''s songs');
select is((select count(*)::int from public.crew_members), 2, 'a member sees their crewmates');
select is((select count(*)::int from public.crew_invites), 0, 'members don''t see invite codes');

update public.songs set title = 'Hacked' where id = '50000000-0000-0000-0000-000000000001';
select is((select title from public.songs where id = '50000000-0000-0000-0000-000000000001'), 'Night Run', 'a member cannot edit a crewmate''s song details');

select lives_ok($$ select public.set_song_stage('50000000-0000-0000-0000-000000000001', 'prep') $$, 'a member can move a crew song on the board');
select is((select stage from public.songs where id = '50000000-0000-0000-0000-000000000001'), 'prep', 'the stage moved');
select is((select stage_updated_by::text from public.songs where id = '50000000-0000-0000-0000-000000000001'), 'b0000000-0000-0000-0000-000000000002', 'the move records who made it');
select throws_ok($$ select public.set_song_stage('50000000-0000-0000-0000-000000000001', 'mixing') $$, '22023', null, 'unknown stages are rejected');

select throws_ok($$ update public.crew_members set role = 'owner' where user_id = auth.uid() $$, '42501', null, 'a member cannot promote themselves');
select throws_ok($$ select public.create_invite((select v::uuid from ids where k = 'crew')) $$, '42501', null, 'members cannot create invites');

delete from public.songs where id = '50000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.songs), 1, 'a member cannot delete a crewmate''s song');

-- ----------------------------------------------------------- Cleo, then Dan, use the code
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(public.join_crew((select v from ids where k = 'code'), 'Cleo'), (select v::uuid from ids where k = 'crew'), 'the second use of a 2-use code works');

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.join_crew((select v from ids where k = 'code'), 'Dan') $$, 'P0001', 'invite code already used up', 'a used-up code is refused');

reset role;
insert into public.crew_invites (code, crew_id, created_by, expires_at)
  values ('EXPRDZZ2', (select v::uuid from ids where k = 'crew'), 'a0000000-0000-0000-0000-000000000001', now() - interval '1 day');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.join_crew('EXPRDZZ2', 'Dan') $$, 'P0001', 'invite code expired', 'an expired code is refused');

-- ----------------------------------------------------------- Ana again: ids are fixed
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ update public.songs set owner_id = 'b0000000-0000-0000-0000-000000000002' where id = '50000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a song cannot be handed to another owner');

-- ----------------------------------------------------------- anonymous
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.songs $$, '42501', null, 'anonymous visitors have no access');

select * from finish();
rollback;

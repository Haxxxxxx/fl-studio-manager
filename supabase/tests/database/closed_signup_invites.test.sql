-- Closed sign-up and tighter invites (supabase/migrations/*_closed_signup_invites.sql),
-- plus the isolation, revoke and removal paths the audit found untested.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eve@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'finn@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- ------------------------------------------------------------ setup
-- Ana owns crew A (Ben joins); Cleo owns crew B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('a', public.create_crew('Crew A', 'Ana')::text);
insert into ids values ('code1', public.create_invite((select v::uuid from ids where k = 'a'), 5));
insert into ids values ('code2', public.create_invite((select v::uuid from ids where k = 'a'), 5));
insert into public.songs (id, crew_id, title) values ('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'a'), 'Ana Song');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code1'), 'Ben');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into ids values ('b', public.create_crew('Crew B', 'Cleo')::text);
insert into public.songs (id, crew_id, title) values ('5b000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'b'), 'Cleo Song');

-- ------------------------------------------------------------ two-crew isolation
select is((select count(*)::int from public.songs where crew_id = (select v::uuid from ids where k = 'a')), 0,
  'a member of crew B sees none of crew A''s songs');
select is((select count(*)::int from public.crew_members where crew_id = (select v::uuid from ids where k = 'a')), 0,
  'a member of crew B sees none of crew A''s members');
select throws_ok(
  $$ insert into public.songs (id, crew_id, title) values ('5b000000-0000-0000-0000-000000000002', (select v::uuid from ids where k = 'a'), 'Planted') $$,
  '42501', null, 'a member of crew B cannot add a song to crew A');
with u as (update public.songs set title = 'Hijacked' where id = '5a000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'a member of crew B cannot edit crew A''s song') from u;
with d as (delete from public.songs where id = '5a000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'a member of crew B cannot delete crew A''s song') from d;
select throws_ok(
  $$ insert into public.songs (id, crew_id, title) values ('5a000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'b'), 'Upsert hijack')
     on conflict (id) do update set title = excluded.title $$,
  null, null, 'an upsert onto crew A''s song id is refused');
select throws_ok(
  $$ update public.songs set crew_id = (select v::uuid from ids where k = 'a') where id = '5b000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'an owner cannot move their song into another crew');
select throws_ok(
  $$ insert into public.songs (id, crew_id, owner_id, title) values ('5b000000-0000-0000-0000-000000000003', (select v::uuid from ids where k = 'b'), 'a0000000-0000-0000-0000-000000000001', 'Spoofed') $$,
  '42501', null, 'a song cannot be inserted in someone else''s name');

-- ------------------------------------------------------------ invite revoke
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
with d as (delete from public.crew_invites where code = (select v from ids where k = 'code2') returning 1)
select is(count(*)::int, 0, 'a member cannot revoke an invite') from d;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.crew_invites where code = (select v from ids where k = 'code2')), 1,
  'the invite survives a member''s attempt');
with d as (delete from public.crew_invites where code = (select v from ids where k = 'code2') returning 1)
select is(count(*)::int, 1, 'the owner can revoke an invite') from d;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(public.join_crew((select v from ids where k = 'code2'), 'Eve'), null, 'a revoked code returns nothing');

-- ------------------------------------------------------------ removal
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into public.songs (id, crew_id, title) values ('5a000000-0000-0000-0000-000000000002', (select v::uuid from ids where k = 'a'), 'Ben Song');
with d as (delete from public.crew_members where user_id = 'a0000000-0000-0000-0000-000000000001' returning 1)
select is(count(*)::int, 0, 'a member cannot remove the owner') from d;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('code3', public.create_invite((select v::uuid from ids where k = 'a'), 5));
with d as (delete from public.crew_members where user_id = 'b0000000-0000-0000-0000-000000000002' returning 1)
select is(count(*)::int, 1, 'the owner can remove a member') from d;
select is((select count(*)::int from public.crew_invites where crew_id = (select v::uuid from ids where k = 'a')), 0,
  'removing a member revokes the crew''s open invites');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.join_crew((select v from ids where k = 'code1'), 'Ben'), null, 'the removed member cannot rejoin with their old code');
select is(public.join_crew((select v from ids where k = 'code3'), 'Ben'), null, 'nor with a code made just before the removal');
select is((select count(*)::int from public.songs where crew_id = (select v::uuid from ids where k = 'a')), 0,
  'the removed member sees none of the crew''s songs');
select throws_ok($$ select public.set_song_stage('5a000000-0000-0000-0000-000000000001', 'prep') $$,
  'P0002', null, 'the removed member cannot move the crew''s songs');
reset role;
select is((select count(*)::int from public.songs where id = '5a000000-0000-0000-0000-000000000002'), 0,
  'the removed member''s shared songs leave with them');
set local role authenticated;

-- Leaving on your own keeps the crew's codes working.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('code4', public.create_invite((select v::uuid from ids where k = 'a'), 5));
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
reset role;
delete from public.join_attempts;
set local role authenticated;
select isnt(public.join_crew((select v from ids where k = 'code4'), 'Eve'), null, 'a valid code still works');
delete from public.crew_members where user_id = auth.uid() and crew_id = (select v::uuid from ids where k = 'a');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.crew_invites where code = (select v from ids where k = 'code4')), 1,
  'a member leaving on their own revokes nothing');

-- ------------------------------------------------------------ credits and tags
select throws_ok(
  $$ update public.songs set credits = '[{"name":"Ana","role":"","split":null,"path":"/Users/someone/song.flp"}]' where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a credit with an extra key is refused');
select throws_ok(
  $$ update public.songs set credits = '[{"name":"Ana"}]' where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a credit missing role and split is refused');
select throws_ok(
  $$ update public.songs set credits = jsonb_build_array(jsonb_build_object('name', repeat('n', 61), 'role', '', 'split', null)) where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a credit name over 60 characters is refused');
select throws_ok(
  $$ update public.songs set credits = '[{"name":"Ana","role":"Lead","split":150}]' where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a split over 100 is refused');
select throws_ok(
  $$ update public.songs set credits = '["just text"]' where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a credit that is not an object is refused');
select lives_ok(
  $$ update public.songs set credits = '[{"name":"Ana","role":"Lead rap","split":50},{"name":"Ben","role":"","split":null}]' where id = '5a000000-0000-0000-0000-000000000001' $$,
  'well-formed credits are accepted');
select throws_ok(
  $$ update public.songs set tags = array[repeat('t', 41)] where id = '5a000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a tag over 40 characters is refused');
select lives_ok(
  $$ update public.songs set tags = array[repeat('t', 40), 'dark'] where id = '5a000000-0000-0000-0000-000000000001' $$,
  'tags up to 40 characters are accepted');

-- ------------------------------------------------------------ owned crews
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
insert into ids values ('f1', public.create_crew('Finn 1', 'Finn')::text);
insert into ids values ('f2', public.create_crew('Finn 2', 'Finn')::text);
insert into ids values ('f3', public.create_crew('Finn 3', 'Finn')::text);
select throws_ok($$ select public.create_crew('Finn 4', 'Finn') $$, 'P0001', null, 'nobody owns more than 3 crews');

-- ------------------------------------------------------------ songs per person
-- 1000 songs in each of two crews (setup, quota trigger off), then a third crew.
reset role;
alter table public.songs disable trigger songs_quota;
insert into public.songs (id, crew_id, owner_id, title)
  select ('5f000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
         (select v::uuid from ids where k = case when g <= 1000 then 'f1' else 'f2' end),
         'f0000000-0000-0000-0000-000000000006', 'Song ' || g
  from generate_series(1, 2000) g;
alter table public.songs enable trigger songs_quota;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.songs (id, crew_id, title) values ('5f000000-0000-0000-0000-100000000000', (select v::uuid from ids where k = 'f3'), 'One too many') $$,
  'P0001', null, 'nobody shares more than 2000 songs in total');
select lives_ok(
  $$ insert into public.songs (id, crew_id, title) values ('5f000000-0000-0000-0000-000000000001', (select v::uuid from ids where k = 'f1'), 'Renamed')
     on conflict (id) do update set title = excluded.title $$,
  'at the total cap, an existing song can still be updated');

-- ------------------------------------------------------------ 10 crews is not an oracle
-- Eve is put in 10 crews directly (setup), then tries a valid code.
reset role;
insert into public.crews (id, name, created_by)
  select ('ce000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Filler ' || g, 'c0000000-0000-0000-0000-000000000003'
  from generate_series(1, 10) g;
insert into public.crew_members (crew_id, user_id, display_name, role)
  select ('ce000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'e0000000-0000-0000-0000-000000000005', 'Eve', 'member'
  from generate_series(1, 10) g;
delete from public.join_attempts;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is(public.join_crew((select v from ids where k = 'code4'), 'Eve'), null,
  'someone in 10 crews gets the same answer as for a wrong code');
reset role;
select is((select count(*)::int from public.join_attempts where user_id = 'e0000000-0000-0000-0000-000000000005'), 1,
  'and it counts as a failed try');

-- ------------------------------------------------------------ anonymous visitors
select ok(
  not has_function_privilege('anon', 'public.create_crew(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.join_crew(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_invite(uuid, int)', 'execute')
  and not has_function_privilege('anon', 'public.set_song_stage(uuid, text)', 'execute'),
  'anonymous visitors cannot call create_crew, join_crew, create_invite or set_song_stage');

select * from finish();
rollback;

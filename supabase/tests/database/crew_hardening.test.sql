-- Hardening rules (supabase/migrations/*_crew_hardening.sql), checked as real users.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dan@test.local');

-- ------------------------------------------------------------ passwords
insert into auth.sessions (id, user_id) values ('5e000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into auth.mfa_amr_claims (id, session_id, authentication_method, created_at, updated_at)
     values (gen_random_uuid(), '5e000000-0000-0000-0000-000000000001', 'password', now(), now()) $$,
  '42501', null, 'a password login is refused');
select lives_ok(
  $$ insert into auth.mfa_amr_claims (id, session_id, authentication_method, created_at, updated_at)
     values (gen_random_uuid(), '5e000000-0000-0000-0000-000000000001', 'otp', now(), now()) $$,
  'an emailed-code login works');
select lives_ok(
  $$ update auth.users set encrypted_password = 'random' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  'accounts may still carry GoTrue''s random password');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- ------------------------------------------------------------ setup: Ana's crew, Ben + Cleo join
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Night Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');
insert into public.songs (id, crew_id, title, stage, stage_updated_by, stage_updated_at)
  values ('50000000-0000-0000-0000-000000000002', (select v::uuid from ids where k = 'crew'), 'Ben Song', 'creation',
          'a0000000-0000-0000-0000-000000000001', now() + interval '1 year');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Cleo');

-- ------------------------------------------------------------ stage stamps
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select stage_updated_by from public.songs where id = '50000000-0000-0000-0000-000000000002'),
  'b0000000-0000-0000-0000-000000000002'::uuid, 'a new song is stamped by its owner, whatever the client sent');
select ok((select stage_updated_at <= now() from public.songs where id = '50000000-0000-0000-0000-000000000002'),
  'a new song cannot be stamped in the future');
update public.songs set title = 'Ben Song 2', stage_updated_by = 'c0000000-0000-0000-0000-000000000003'
  where id = '50000000-0000-0000-0000-000000000002';
select is((select stage_updated_by from public.songs where id = '50000000-0000-0000-0000-000000000002'),
  'b0000000-0000-0000-0000-000000000002'::uuid, 'editing details cannot rewrite who moved the song');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.set_song_stage('50000000-0000-0000-0000-000000000002', 'prep');
select is((select stage_updated_by from public.songs where id = '50000000-0000-0000-0000-000000000002'),
  'c0000000-0000-0000-0000-000000000003'::uuid, 'a board move is stamped by the crewmate who made it');
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.songs set title = 'Ben Song 3' where id = '50000000-0000-0000-0000-000000000002';
select is((select stage from public.songs where id = '50000000-0000-0000-0000-000000000002'), 'prep',
  'an owner''s detail edit leaves a crewmate''s move alone');

-- ------------------------------------------------------------ size caps
select throws_ok(
  $$ update public.songs set tags = array[repeat('x', 3000)] where id = '50000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'huge tags are refused');
select throws_ok(
  $$ update public.songs set credits = (select jsonb_agg(jsonb_build_object('name', 'n' || g)) from generate_series(1, 31) g)
     where id = '50000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'more than 30 credits are refused');

-- ------------------------------------------------------------ invite guessing
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(public.join_crew('ZZZZZZZ2', 'Dan'), null, 'an unknown code returns nothing (1)');
select public.join_crew('ZZZZZZZ3', 'Dan');
select public.join_crew('ZZZZZZZ4', 'Dan');
select public.join_crew('ZZZZZZZ5', 'Dan');
select public.join_crew('ZZZZZZZ6', 'Dan');
select throws_ok($$ select public.join_crew((select v from ids where k = 'code'), 'Dan') $$,
  'P0001', null, 'after 5 wrong codes even a good code waits 10 minutes');
select throws_ok($$ select count(*) from public.join_attempts $$, '42501', null, 'attempts are not readable by users');

-- ------------------------------------------------------------ roles
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ update public.crew_members set role = 'owner' where user_id = auth.uid() $$,
  '42501', null, 'members still cannot promote themselves');

-- ------------------------------------------------------------ leaving
delete from public.crew_members where user_id = auth.uid();
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.songs where id = '50000000-0000-0000-0000-000000000002'), 0,
  'a member''s shared songs leave with them');

delete from public.crew_members where user_id = auth.uid();
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select role from public.crew_members where user_id = auth.uid()), 'owner',
  'when the owner leaves, the longest-standing member takes over');

delete from public.crew_members where user_id = auth.uid();
reset role;
select is((select count(*)::int from public.crews where id = (select v::uuid from ids where k = 'crew')), 0,
  'a crew with nobody left is deleted');

-- ------------------------------------------------------------ account deletion
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
reset role;
delete from public.join_attempts;
set local role authenticated;
insert into ids values ('crew2', public.create_crew('Dan Crew', 'Dan')::text);
reset role;
select lives_ok($$ delete from auth.users where id = 'd0000000-0000-0000-0000-000000000004' $$,
  'a crew creator''s account can be deleted');
select is((select count(*)::int from public.crews where id = (select v::uuid from ids where k = 'crew2')), 0,
  'their now-empty crew goes with them');

-- ------------------------------------------------------------ helpers
select ok(not has_function_privilege('anon', 'public.is_crew_member(uuid)', 'execute'), 'anonymous visitors cannot call the helpers');

select * from finish();
rollback;

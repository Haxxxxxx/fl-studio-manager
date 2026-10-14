-- Members can change their display name and nothing else (20261019000000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cleo@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;
set local role authenticated;

-- Ana's crew; Ben joins, then Cleo.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Cleo');

-- Cleo (the latest to join) tries to look like the earliest.
select throws_ok($$ update public.crew_members set joined_at = '1970-01-01' where user_id = 'c0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'a member cannot backdate their join date');
select throws_ok($$ update public.crew_members set role = 'owner' where user_id = 'c0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'a member cannot make themselves owner');
select lives_ok($$ update public.crew_members set display_name = 'Cleo K' where user_id = 'c0000000-0000-0000-0000-000000000003' $$,
  'a member can still rename themselves');
select is((select display_name from public.crew_members where user_id = 'c0000000-0000-0000-0000-000000000003'), 'Cleo K', 'the new name is saved');

-- Ana leaves: the earliest joiner (Ben) becomes owner, not Cleo.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
delete from public.crew_members where crew_id = (select v::uuid from ids where k = 'crew') and user_id = 'a0000000-0000-0000-0000-000000000001';
reset role;
select is((select user_id::text from public.crew_members where crew_id = (select v::uuid from ids where k = 'crew') and role = 'owner'),
  'b0000000-0000-0000-0000-000000000002', 'ownership goes to the real earliest joiner');

select * from finish();
rollback;

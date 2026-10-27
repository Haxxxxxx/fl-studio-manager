-- Renaming a crew: owners change the name and nothing else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('crew', public.create_crew('Night Crew', 'Ana')::text);
insert into ids values ('code', public.create_invite((select v::uuid from ids where k = 'crew'), 5));

-- The owner renames it.
update public.crews set name = 'Day Crew' where id = (select v::uuid from ids where k = 'crew');
select is((select name from public.crews where id = (select v::uuid from ids where k = 'crew')), 'Day Crew', 'the owner renames the crew');
select throws_ok($$ update public.crews set name = '   ' where id = (select v::uuid from ids where k = 'crew') $$,
  '23514', null, 'a blank name is refused');
select throws_ok($$ update public.crews set created_by = 'b0000000-0000-0000-0000-000000000002' where id = (select v::uuid from ids where k = 'crew') $$,
  '42501', null, 'created_by cannot change');
select throws_ok($$ update public.crews set created_at = now() - interval '1 year' where id = (select v::uuid from ids where k = 'crew') $$,
  '42501', null, 'created_at cannot change');

-- A member can't rename it (the policy matches no row).
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.join_crew((select v from ids where k = 'code'), 'Ben');
update public.crews set name = 'Ben Crew' where id = (select v::uuid from ids where k = 'crew');
select is((select name from public.crews where id = (select v::uuid from ids where k = 'crew')), 'Day Crew', 'a member cannot rename the crew');
select ok(not has_table_privilege('anon', 'public.crews', 'update'), 'anonymous visitors cannot update crews');

select * from finish();
rollback;

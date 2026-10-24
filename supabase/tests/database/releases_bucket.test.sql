-- The releases bucket: public to read, nobody but CI writes (20261024000000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is((select count(*)::int from storage.buckets where id = 'releases'), 1, 'the releases bucket exists');
select is((select public from storage.buckets where id = 'releases'), true, 'the releases bucket is public');

-- No user, signed in or anonymous, can put a file in it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('releases', 'latest.json') $$,
  '42501', null, 'a signed-in user cannot write to the releases bucket');
set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('releases', 'latest.json') $$,
  '42501', null, 'an anonymous user cannot write to the releases bucket');
reset role;

select * from finish();
rollback;

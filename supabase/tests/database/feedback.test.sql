-- In-app feedback (supabase/migrations/*_feedback.sql): anyone can send one
-- through submit_feedback(), nobody reads the table from the app.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;

-- ------------------------------------------------------------ anonymous send
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into ids values ('anon', public.submit_feedback(
  '10000000-0000-0000-0000-000000000001', 'bug', '  The board jumps when I drag.  ', ' ana@example.com ',
  '0.5.0', 'macOS', 'pipeline', 'en')::text);
select ok((select v from ids where k = 'anon') is not null, 'an anonymous user can send feedback');

select throws_ok($$ select count(*) from public.feedback $$, '42501', null, 'an anonymous user cannot read feedback');
select throws_ok(
  $$ insert into public.feedback (install_id, category, message) values ('10000000-0000-0000-0000-000000000001', 'bug', 'forged') $$,
  '42501', null, 'an anonymous user cannot insert feedback directly');

-- ------------------------------------------------------------ refused input
select throws_ok(
  $$ select public.submit_feedback('10000000-0000-0000-0000-000000000001', 'bug', '   ', null, '0.5.0', 'macOS', 'pipeline', 'en') $$,
  'P0001', 'empty message', 'a blank message is refused');
select throws_ok(
  $$ select public.submit_feedback('10000000-0000-0000-0000-000000000001', 'rant', 'hi', null, '0.5.0', 'macOS', 'pipeline', 'en') $$,
  '22023', null, 'an unknown category is refused');

-- ------------------------------------------------------------ clipping
insert into ids values ('long', public.submit_feedback(
  '10000000-0000-0000-0000-000000000001', 'idea', repeat('x', 5000), repeat('e', 300),
  repeat('v', 100), repeat('o', 100), repeat('w', 100), repeat('l', 100))::text);
select ok((select v from ids where k = 'long') is not null, 'over-long strings are clipped, not refused');

-- ------------------------------------------------------------ rate limit
select lives_ok($$
  select public.submit_feedback('20000000-0000-0000-0000-000000000002', 'question', 'message ' || g, null, '0.5.0', 'Windows', 'dashboard', 'fr')
    from generate_series(1, 10) g $$,
  'ten messages a day from one install are fine');
select throws_ok(
  $$ select public.submit_feedback('20000000-0000-0000-0000-000000000002', 'question', 'one more', null, '0.5.0', 'Windows', 'dashboard', 'fr') $$,
  'P0001', 'too many messages today', 'the eleventh message in a day is refused');
select lives_ok(
  $$ select public.submit_feedback('30000000-0000-0000-0000-000000000003', 'question', 'hello', null, '0.5.0', 'Windows', 'dashboard', 'fr') $$,
  'another install is not held back by it');

-- ------------------------------------------------------------ signed in
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids values ('ana', public.submit_feedback(
  '10000000-0000-0000-0000-000000000001', 'question', 'How do I share a song?', null, '0.5.0', 'macOS', 'crewBoard', 'fr')::text);
select ok((select v from ids where k = 'ana') is not null, 'a signed-in user can send feedback');
select throws_ok($$ select count(*) from public.feedback $$, '42501', null, 'a signed-in user cannot read feedback');
select throws_ok($$ delete from public.feedback $$, '42501', null, 'a signed-in user cannot delete feedback');

-- ------------------------------------------------------------ what was stored
reset role;
select is((select category from public.feedback where id = (select v::uuid from ids where k = 'anon')), 'bug', 'the category is stored');
select is((select message from public.feedback where id = (select v::uuid from ids where k = 'anon')), 'The board jumps when I drag.', 'the message is trimmed');
select is((select reply_to from public.feedback where id = (select v::uuid from ids where k = 'anon')), 'ana@example.com', 'the reply address is trimmed');
select is((select (app_version, os, view, lang)::text from public.feedback where id = (select v::uuid from ids where k = 'anon')),
  '(0.5.0,macOS,pipeline,en)', 'the row carries the app context');
select is((select (signed_in, user_id)::text from public.feedback where id = (select v::uuid from ids where k = 'anon')),
  '(f,)', 'an anonymous send carries no user');
select is((select (signed_in, user_id)::text from public.feedback where id = (select v::uuid from ids where k = 'ana')),
  '(t,a0000000-0000-0000-0000-000000000001)', 'a signed-in send is stamped with the user');
select is((select char_length(message) from public.feedback where id = (select v::uuid from ids where k = 'long')), 4000, 'the message is clipped to 4000');
select is((select char_length(reply_to) from public.feedback where id = (select v::uuid from ids where k = 'long')), 200, 'the reply address is clipped to 200');
select is((select (char_length(app_version), char_length(os), char_length(view), char_length(lang))::text
  from public.feedback where id = (select v::uuid from ids where k = 'long')), '(40,40,40,8)', 'context fields are clipped');

select * from finish();
rollback;

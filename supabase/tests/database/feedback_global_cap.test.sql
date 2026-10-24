-- Global feedback cap (supabase/migrations/*_feedback_global_cap.sql): no more
-- than 200 messages an hour across every install, on top of 10 a day each.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- ------------------------------------------------------------ per install still holds
select lives_ok($$
  select public.submit_feedback('20000000-0000-0000-0000-000000000001', 'bug', 'message ' || g, null, '0.5.0', 'macOS', 'pipeline', 'en')
    from generate_series(1, 10) g $$,
  'ten messages a day from one install are fine');
select throws_ok(
  $$ select public.submit_feedback('20000000-0000-0000-0000-000000000001', 'bug', 'one more', null, '0.5.0', 'macOS', 'pipeline', 'en') $$,
  'P0001', 'too many messages today', 'the eleventh message in a day from one install is still refused');

-- ------------------------------------------------------------ global cap
-- 19 more installs at 10 each: 200 messages in the hour across all installs.
select lives_ok($$
  select public.submit_feedback(('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'idea', 'message ' || g, null, '0.5.0', 'Windows', 'dashboard', 'fr')
    from generate_series(1, 19) i, generate_series(1, 10) g $$,
  'two hundred messages an hour across installs are fine');
select throws_ok(
  $$ select public.submit_feedback('40000000-0000-0000-0000-000000000001', 'question', 'hello', null, '0.5.0', 'Windows', 'dashboard', 'fr') $$,
  'P0001', 'too many messages right now', 'the 201st message in an hour is refused even from a fresh install');

-- ------------------------------------------------------------ the window slides
reset role;
update public.feedback set created_at = now() - interval '2 hours';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $$ select public.submit_feedback('40000000-0000-0000-0000-000000000001', 'question', 'hello', null, '0.5.0', 'Windows', 'dashboard', 'fr') $$,
  'messages older than an hour no longer count');

select * from finish();
rollback;

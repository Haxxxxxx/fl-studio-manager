-- A global cap on feedback: the per-install limit (10 a day) holds for one
-- app, but install ids are made up by the client, so a script could mint a
-- fresh one per message and fill the table. Across every install, no more
-- than 200 messages an hour get in. Same signature, body and grants as the
-- feedback migration, plus that one check.

create or replace function public.submit_feedback(
  p_install uuid,
  p_category text,
  p_message text,
  p_reply_to text,
  p_app_version text,
  p_os text,
  p_view text,
  p_lang text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_message text := left(btrim(coalesce(p_message, '')), 4000);
  v_reply_to text := nullif(left(btrim(coalesce(p_reply_to, '')), 200), '');
  v_id uuid;
begin
  if v_message = '' then
    raise exception 'empty message' using errcode = 'P0001';
  end if;
  if p_category not in ('bug', 'idea', 'question') then
    raise exception 'unknown category %', p_category using errcode = '22023';
  end if;
  if (select count(*) from public.feedback
      where install_id = p_install and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too many messages today' using errcode = 'P0001';
  end if;
  if (select count(*) from public.feedback
      where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'too many messages right now' using errcode = 'P0001';
  end if;
  insert into public.feedback (install_id, category, message, reply_to, app_version, os, view, lang, signed_in, user_id)
    values (
      p_install,
      p_category,
      v_message,
      v_reply_to,
      nullif(left(btrim(coalesce(p_app_version, '')), 40), ''),
      nullif(left(btrim(coalesce(p_os, '')), 40), ''),
      nullif(left(btrim(coalesce(p_view, '')), 40), ''),
      nullif(left(btrim(coalesce(p_lang, '')), 8), ''),
      v_uid is not null,
      v_uid
    )
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- grants
-- Unchanged: feedback works without a crew sign-in, so anon may call it too.
revoke execute on function public.submit_feedback(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback(uuid, text, text, text, text, text, text, text) to anon, authenticated;

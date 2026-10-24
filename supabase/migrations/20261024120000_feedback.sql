-- In-app feedback ("Report a bug or send feedback" in the sidebar). Anyone
-- running the app can send one, signed in to a crew or not, through
-- submit_feedback() only: nobody but the dashboard reads the table, and
-- there is no insert policy either, so a client can't forge rows. Rate
-- limit: 10 messages a day per install (a uuid the app generates once).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  install_id uuid not null,
  category text not null check (category in ('bug', 'idea', 'question')),
  message text not null check (char_length(message) between 1 and 4000),
  reply_to text check (reply_to is null or char_length(reply_to) <= 200),
  app_version text,
  os text,
  view text,
  lang text,
  signed_in boolean not null default false,
  user_id uuid
);
create index feedback_install_at on public.feedback (install_id, created_at);

alter table public.feedback enable row level security;
-- No policy at all: neither anon nor authenticated can read, change or
-- insert directly. The function below is the only way in.
revoke all on public.feedback from public, anon, authenticated;

-- Trims and clips every string to its column's limit (an empty message is
-- the one thing refused). Stamps who sent it when a crew session is on.
create function public.submit_feedback(
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
-- Feedback works without a crew sign-in, so anon may call it too.
revoke execute on function public.submit_feedback(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback(uuid, text, text, text, text, text, text, text) to anon, authenticated;

-- The public `releases` bucket: the updater manifest (latest.json) and the
-- stable installer links the website points at (latest/Hivo.dmg,
-- latest/Hivo-setup.exe). Anyone can read it; only the release workflow
-- (CI, with the service key) writes to it, so there is no insert, update or
-- delete policy for users, signed in or not.
insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do nothing;

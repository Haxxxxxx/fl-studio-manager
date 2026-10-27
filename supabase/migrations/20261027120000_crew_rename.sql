-- Renaming a crew (part C1, the website's owner tools). crews_update let an
-- owner update every column from the client (id, created_by, created_at), not
-- just the name. Now clients can update the name and nothing else; the
-- policy still limits it to owners, and the name check (1-80 characters)
-- still applies.

revoke update on public.crews from authenticated;
grant update (name) on public.crews to authenticated;

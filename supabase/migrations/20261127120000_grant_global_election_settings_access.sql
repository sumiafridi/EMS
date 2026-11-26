-- Table privileges are separate from RLS policies. The policies below this
-- migration's predecessor already restrict writes to global administrators.
-- Authenticated users may read defaults; RLS permits writes only to Super Admins.
grant select, insert, update, delete on table public.global_election_settings to authenticated;

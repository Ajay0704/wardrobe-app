-- Pack with friends — Phase 3: realtime. Add the trip tables to the Supabase
-- realtime publication so members receive live postgres_changes when someone
-- packs/unpacks or joins. RLS still applies to realtime (a subscriber only gets
-- changes to rows they can SELECT), so no new policies are needed. Idempotent —
-- adding a table already in the publication would otherwise error.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_items'
  ) then
    alter publication supabase_realtime add table public.trip_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members'
  ) then
    alter publication supabase_realtime add table public.trip_members;
  end if;
end $$;

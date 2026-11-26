-- Publish district-scoped operational tables so every open EMS page can
-- refresh its shared district data after imports and edits.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'election_tehsils',
    'election_councils',
    'polling_stations',
    'census_blocks',
    'block_station_allocations',
    'polling_booths',
    'election_staff',
    'master_trainers',
    'training_venues',
    'training_rooms',
    'district_settings',
    'demand_rules',
    'training_plans',
    'training_batches',
    'training_participants',
    'training_attendance',
    'staff_assignments',
    'reserve_staff',
    'data_imports',
    'import_issues',
    'district_app_state'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

create table if not exists public.global_election_settings (
  setting_key text primary key,
  setting_value jsonb not null default 'null'::jsonb,
  is_locked boolean not null default false,
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.global_election_settings enable row level security;
drop policy if exists global_settings_read_authenticated on public.global_election_settings;
create policy global_settings_read_authenticated on public.global_election_settings
  for select to authenticated using (true);
drop policy if exists global_settings_manage_admin on public.global_election_settings;
create policy global_settings_manage_admin on public.global_election_settings
  for all to authenticated using (public.is_global_admin())
  with check (public.is_global_admin());

alter table public.district_settings add column if not exists is_locked boolean not null default false;
alter table public.demand_rules add column if not exists is_locked boolean not null default false;

create or replace function public.guard_district_setting_lock()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_key text;
begin
  v_key := case when TG_OP='DELETE' then old.setting_key else new.setting_key end;
  if not public.is_global_admin() then
    if TG_OP='INSERT' and coalesce(new.is_locked,false) then raise exception 'Only the Super Admin can lock district settings.'; end if;
    if TG_OP='DELETE' and (coalesce(old.is_locked,false) or exists (
      select 1 from public.global_election_settings g where g.setting_key=v_key and g.is_locked
    )) then raise exception 'This setting is locked by the Super Admin.'; end if;
    if TG_OP='UPDATE' and (coalesce(old.is_locked,false) or coalesce(new.is_locked,false) or exists (
      select 1 from public.global_election_settings g where g.setting_key=v_key and g.is_locked
    )) then raise exception 'This setting is locked by the Super Admin.'; end if;
    if TG_OP='INSERT' and exists (
      select 1 from public.global_election_settings g where g.setting_key=v_key and g.is_locked
    ) then raise exception 'This setting is locked by the Super Admin.'; end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists district_settings_lock_guard on public.district_settings;
create trigger district_settings_lock_guard before insert or update or delete
on public.district_settings for each row execute function public.guard_district_setting_lock();

create or replace function public.guard_demand_rule_lock()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_global_admin() then
    if TG_OP='INSERT' and coalesce(new.is_locked,false) then raise exception 'Only the Super Admin can lock demand rules.'; end if;
    if TG_OP='DELETE' and coalesce(old.is_locked,false) then raise exception 'This demand rule is locked by the Super Admin.'; end if;
    if TG_OP='UPDATE' and (coalesce(old.is_locked,false) or coalesce(new.is_locked,false)) then raise exception 'This demand rule is locked by the Super Admin.'; end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists demand_rules_lock_guard on public.demand_rules;
create trigger demand_rules_lock_guard before insert or update or delete
on public.demand_rules for each row execute function public.guard_demand_rule_lock();

drop policy if exists global_settings_read_authenticated on public.global_election_settings;
create policy global_settings_read_authenticated on public.global_election_settings for select to authenticated using (true);
drop policy if exists global_settings_manage_admin on public.global_election_settings;
create policy global_settings_manage_admin on public.global_election_settings for all to authenticated using (public.is_global_admin()) with check (public.is_global_admin());

drop policy if exists district_settings_insert_scope on public.district_settings;
create policy district_settings_insert_scope on public.district_settings for insert to authenticated
with check (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']));
drop policy if exists district_settings_update_scope on public.district_settings;
create policy district_settings_update_scope on public.district_settings for update to authenticated
using (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']))
with check (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']));
drop policy if exists district_settings_delete_scope on public.district_settings;
create policy district_settings_delete_scope on public.district_settings for delete to authenticated
using (public.is_global_admin() or public.has_district_role(district_id,array['district_admin']));

drop policy if exists district_rules_insert_scope on public.demand_rules;
create policy district_rules_insert_scope on public.demand_rules for insert to authenticated
with check (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']));
drop policy if exists district_rules_update_scope on public.demand_rules;
create policy district_rules_update_scope on public.demand_rules for update to authenticated
using (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']))
with check (public.is_global_admin() or public.has_district_role(district_id,array['district_admin','data_entry','training_officer']));
drop policy if exists district_rules_delete_scope on public.demand_rules;
create policy district_rules_delete_scope on public.demand_rules for delete to authenticated
using (public.is_global_admin() or public.has_district_role(district_id,array['district_admin']));

insert into public.global_election_settings(setting_key,setting_value,is_locked) values
 ('training:reserve_percent','5'::jsonb,false),
 ('training:pres_duration_days','2'::jsonb,false),
 ('training:pres_batch_size','25'::jsonb,false),
 ('training:apo_duration_days','1'::jsonb,false),
 ('training:apo_batch_size','40'::jsonb,false),
 ('training:po_duration_days','1'::jsonb,false),
 ('training:po_batch_size','40'::jsonb,false),
 ('training:morning_start','"09:00"'::jsonb,false),
 ('training:morning_end','"12:00"'::jsonb,false),
 ('training:evening_start','"14:00"'::jsonb,false),
 ('training:evening_end','"17:00"'::jsonb,false),
 ('training:include_sunday','false'::jsonb,false),
 ('training:apo_start_mode','"auto"'::jsonb,false),
 ('allocation:presiding_min_bps','16'::jsonb,false),
 ('allocation:senior_apo_min_bps','16'::jsonb,false),
 ('allocation:apo_min_bps','7'::jsonb,false),
 ('allocation:apo_max_bps','15'::jsonb,false),
 ('allocation:po_min_bps','7'::jsonb,false),
 ('allocation:po_max_bps','15'::jsonb,false),
 ('allocation:allow_senior_surplus_to_junior','true'::jsonb,false),
 ('allocation:home_tehsil_first','true'::jsonb,false)
on conflict(setting_key) do nothing;

do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='global_election_settings') then
  alter publication supabase_realtime add table public.global_election_settings;
 end if;
end $$;

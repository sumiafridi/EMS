-- Preserve every prior duty assignment while allowing only one current active assignment per employee.
alter table public.staff_assignments
  drop constraint if exists staff_assignments_district_id_staff_id_key;

create unique index if not exists staff_assignments_one_active_per_staff
  on public.staff_assignments (district_id, staff_id)
  where assignment_status = 'Active';

-- Keep one current scheduled participant per employee/programme.
-- Historical participant rows remain linked to their original batch and attendance.
alter table public.training_participants
  drop constraint if exists training_participants_district_id_plan_id_staff_id_key;

drop index if exists public.uq_training_participant_per_plan;

create unique index if not exists training_participants_one_current_per_plan
  on public.training_participants (district_id, plan_id, staff_id)
  where status not in ('Historical', 'Superseded');

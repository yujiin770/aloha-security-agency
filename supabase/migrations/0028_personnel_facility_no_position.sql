-- ===========================================================================
-- 0028 — Personnel: drop position and rank, record the facility instead
-- ===========================================================================
-- The agency's rosters (one sheet per client) track each guard by AREA OF
-- ASSIGNMENT — the facility — and carry no position or rank at all. So:
--
--   * `personnel.position_id` and `personnel.rank_id` are dropped. Applicants
--     keep their position (it is what they applied for), and the Positions /
--     Ranks configuration tables are untouched.
--   * A person's facility is their deployment, as before — that is what feeds
--     facility headcounts and vacancies. What changes is that the facility can
--     now be set at the moment the person is put on the roster:
--       - add_existing_personnel()        "Add existing personnel"
--       - promote_applicant_to_personnel() hiring an applicant
--     Both create the person and their first deployment in one transaction.
--
-- DATA: existing personnel lose their position and rank. Nothing else reads
-- them once this migration has run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Views that select the columns are dropped first, recreated in §4
-- ---------------------------------------------------------------------------
drop view if exists public.v_personnel_roster;
drop view if exists public.v_active_deployments;

-- The old signature takes p_rank_id; it is replaced in §3.
drop function if exists public.promote_applicant_to_personnel(uuid, date, uuid);

-- ---------------------------------------------------------------------------
-- 2. The columns
-- ---------------------------------------------------------------------------
-- Their indexes and foreign keys go with them.
alter table public.personnel drop column if exists position_id;
alter table public.personnel drop column if exists rank_id;

-- ---------------------------------------------------------------------------
-- 3. Creating a person together with their facility
-- ---------------------------------------------------------------------------
-- Opens the first deployment for a person who was just put on the roster.
-- Starts on the hire date: active if that date has arrived, pending otherwise.
-- Not callable by clients; the two functions below check privileges first.
create or replace function public.open_first_deployment(
  p_personnel_id uuid,
  p_branch_id    uuid,
  p_start        date,
  p_shift        public.shift_type,
  p_post         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    raise exception 'Choose an active facility.';
  end if;

  insert into public.deployments (
    personnel_id, branch_id, shift, post_assignment, start_date, status, assigned_by
  ) values (
    p_personnel_id, p_branch_id, coalesce(p_shift, 'day'),
    nullif(btrim(coalesce(p_post, '')), ''),
    p_start,
    case when p_start <= current_date then 'active' else 'pending' end::public.deployment_status,
    (select auth.uid())
  );
end;
$$;

revoke all on function public.open_first_deployment(uuid, uuid, date, public.shift_type, text)
  from public, anon, authenticated;

-- "Add existing personnel": guards employed before the system existed.
-- Replaces the client-side INSERT so the person and their facility are written
-- together — HR may add personnel but not deployments (deployments_insert), and
-- a half-written record with no facility is what this exists to avoid.
create or replace function public.add_existing_personnel(
  p_data      jsonb,
  p_branch_id uuid default null,
  p_shift     public.shift_type default 'day',
  p_post      text default null
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.personnel;
  v_employee_no text := nullif(btrim(coalesce(p_data ->> 'employee_no', '')), '');
  v_hired date := coalesce(nullif(p_data ->> 'date_hired', '')::date, current_date);
begin
  if not (public.is_admin() or public.has_role('hr_staff'::public.app_role)) then
    raise exception 'Only administrators and HR can add personnel.'
      using errcode = 'insufficient_privilege';
  end if;

  if nullif(btrim(coalesce(p_data ->> 'first_name', '')), '') is null
     or nullif(btrim(coalesce(p_data ->> 'last_name', '')), '') is null then
    raise exception 'First and last name are required.';
  end if;

  insert into public.personnel (
    employee_no,
    first_name, middle_name, last_name, suffix,
    email, phone, birth_date, sex, date_hired,
    emergency_contact_name, emergency_contact_phone,
    sss_no, philhealth_no, pagibig_no, tin_no,
    security_license_no, security_license_expiry,
    created_by
  ) values (
    coalesce(v_employee_no,
             'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0')),
    btrim(p_data ->> 'first_name'),
    nullif(btrim(coalesce(p_data ->> 'middle_name', '')), ''),
    btrim(p_data ->> 'last_name'),
    nullif(btrim(coalesce(p_data ->> 'suffix', '')), ''),
    nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), ''),
    nullif(btrim(coalesce(p_data ->> 'phone', '')), ''),
    nullif(p_data ->> 'birth_date', '')::date,
    nullif(p_data ->> 'sex', '')::public.sex_type,
    v_hired,
    nullif(btrim(coalesce(p_data ->> 'emergency_contact_name', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'emergency_contact_phone', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'sss_no', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'philhealth_no', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'pagibig_no', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'tin_no', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'security_license_no', '')), ''),
    nullif(p_data ->> 'security_license_expiry', '')::date,
    (select auth.uid())
  )
  returning * into v_row;

  if p_branch_id is not null then
    perform public.open_first_deployment(v_row.id, p_branch_id, v_hired, p_shift, p_post);
  end if;

  return v_row;
end;
$$;

revoke all on function public.add_existing_personnel(jsonb, uuid, public.shift_type, text) from public;
grant execute on function public.add_existing_personnel(jsonb, uuid, public.shift_type, text)
  to authenticated;

-- Hiring: 0022's body without position/rank, plus an optional facility.
create or replace function public.promote_applicant_to_personnel(
  p_applicant_id uuid,
  p_date_hired   date default current_date,
  p_branch_id    uuid default null,
  p_shift        public.shift_type default 'day'
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applicant public.applicants;
  v_personnel public.personnel;
begin
  if not public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role, 'hr_staff'::public.app_role
  ) then
    raise exception 'Insufficient privileges to hire an applicant'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_applicant from public.applicants where id = p_applicant_id for update;

  if not found then
    raise exception 'Applicant % not found', p_applicant_id using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.personnel where applicant_id = p_applicant_id) then
    raise exception 'Applicant % has already been onboarded', v_applicant.reference_no
      using errcode = 'unique_violation';
  end if;

  if v_applicant.status <> 'interview' then
    raise exception 'Only applicants at the interview stage can be hired (current: %)',
      v_applicant.status using errcode = 'check_violation';
  end if;

  -- Authorises the status change below for this transaction only (0022).
  perform set_config('app.onboarding', 'on', true);

  update public.applicants set status = 'hired' where id = p_applicant_id;

  insert into public.personnel (
    employee_no, applicant_id, first_name, middle_name, last_name, suffix,
    email, phone, birth_date, sex, date_hired,
    sss_no, philhealth_no, pagibig_no, tin_no,
    security_license_no, security_license_expiry, created_by
  )
  values (
    'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0'),
    v_applicant.id, v_applicant.first_name, v_applicant.middle_name,
    v_applicant.last_name, v_applicant.suffix, v_applicant.email, v_applicant.phone,
    v_applicant.birth_date, v_applicant.sex, coalesce(p_date_hired, current_date),
    v_applicant.sss_no, v_applicant.philhealth_no, v_applicant.pagibig_no,
    v_applicant.tin_no, v_applicant.security_license_no,
    v_applicant.security_license_expiry, (select auth.uid())
  )
  returning * into v_personnel;

  if p_branch_id is not null then
    perform public.open_first_deployment(
      v_personnel.id, p_branch_id, v_personnel.date_hired, p_shift, null
    );
  end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  values (
    (select auth.uid()), 'applicant.hired', 'personnel', v_personnel.id,
    v_applicant.first_name || ' ' || v_applicant.last_name || ' hired'
      || coalesce(' — ' || (select b.name from public.branches b where b.id = p_branch_id), ''),
    jsonb_build_object('applicant_id', v_applicant.id,
                       'reference_no', v_applicant.reference_no,
                       'branch_id', p_branch_id)
  );

  return v_personnel;
end;
$$;

revoke all on function public.promote_applicant_to_personnel(uuid, date, uuid, public.shift_type)
  from public;
grant execute on function public.promote_applicant_to_personnel(uuid, date, uuid, public.shift_type)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Views, without position and rank
-- ---------------------------------------------------------------------------
-- The roster's facility is the person's live deployment: the active one, or —
-- for someone whose first day has not come yet — the pending one.
create view public.v_personnel_roster
with (security_invoker = true) as
select
  p.id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name) as full_name,
  p.first_name,
  p.last_name,
  p.employment_status,
  p.date_hired,
  p.phone,
  p.email,
  p.photo_path,
  p.security_license_no,
  p.security_license_expiry,
  (p.security_license_expiry is not null
    and p.security_license_expiry < current_date + 60) as license_expiring_soon,
  cur.id          as current_deployment_id,
  cur.branch_id   as current_branch_id,
  cb.name         as current_branch_name,
  cur.shift       as current_shift,
  cur.start_date  as current_start_date,
  cur.status      as current_deployment_status,
  p.status_effective_date,
  p.date_separated,
  p.is_blocklisted,
  (select count(*) from public.personnel_actions a
    where a.personnel_id = p.id and a.action_type = 'violation')::int as violation_count
from public.personnel p
left join lateral (
  select d.* from public.deployments d
  where d.personnel_id = p.id and d.status in ('active', 'pending')
  order by (d.status = 'active') desc, d.start_date desc
  limit 1
) cur on true
left join public.branches cb on cb.id = cur.branch_id;

create view public.v_active_deployments
with (security_invoker = true) as
select
  d.id,
  d.personnel_id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name) as personnel_name,
  p.employment_status,
  p.photo_path,
  d.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  b.city_municipality,
  b.region,
  d.shift,
  d.post_assignment,
  d.start_date,
  d.end_date,
  d.status,
  d.daily_rate,
  current_date - d.start_date as days_deployed,
  d.assigned_by,
  d.created_at
from public.deployments d
join public.personnel p on p.id = d.personnel_id
join public.branches b on b.id = d.branch_id;

grant select on public.v_personnel_roster to authenticated;
grant select on public.v_active_deployments to authenticated;

comment on view public.v_personnel_roster is
  'Roster with each person''s current facility (live deployment). Position and rank removed in 0028.';

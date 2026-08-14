-- ===========================================================================
-- 0019 — Separation closes deployments; headcounts stop counting leavers
-- ===========================================================================
-- Recording a separation wrote two columns on `personnel` and nothing else.
-- Nothing bridged that to `deployments`: no trigger, no second statement, and
-- no constraint tying a deployment's liveness to its guard's employment. The
-- deployment therefore stayed `active` forever, and because `v_branch_staffing`
-- joins only branches → deployments, the facility went on counting a person who
-- had left. `get_dashboard_stats()` shared the defect, to the point where
-- `personnel.deployed` could exceed `personnel.active`.
--
-- The old UI copy told operators to go and end the deployment by hand on the
-- Deployments page. That is a process asking to be forgotten, and the numbers it
-- protects — vacancy counts, fill rates — are the ones the agency staffs
-- against. So the closure moves into the write path, and the views are hardened
-- as well: two independent layers, because a direct table edit or a future code
-- path could reintroduce the drift at either one.
--
-- Also folded in here: `applicants.submission_id`, the idempotency key the
-- public form now sends so a retry after a timed-out submit cannot create a
-- second applicant.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. separate_personnel() — one transaction, both tables
-- ---------------------------------------------------------------------------
create or replace function public.separate_personnel(
  p_personnel_id uuid,
  p_status       text,
  p_date         date default current_date,
  p_note         text default null
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.personnel;
  v_closed integer;
begin
  if p_status not in ('resigned', 'terminated') then
    raise exception 'Separation status must be resigned or terminated, not %', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Same gate as the personnel update policy it replaces: administrators, plus
  -- HR. Deployment officers can end a deployment but may not end an employment.
  if not (public.is_admin() or public.has_role('hr_staff'::public.app_role)) then
    raise exception 'Insufficient privileges to record a separation'
      using errcode = 'insufficient_privilege';
  end if;

  update public.personnel
     set employment_status = p_status::public.employment_status,
         date_separated    = p_date
   where id = p_personnel_id
     and employment_status = 'active'
  returning * into v_row;

  if not found then
    raise exception 'No active personnel record % to separate', p_personnel_id
      using errcode = 'no_data_found';
  end if;

  -- Close anything still open. `greatest` guards deployments_date_order_chk:
  -- a pending assignment that was due to start after the separation date would
  -- otherwise be given an end date before its own start.
  update public.deployments
     set status       = 'ended',
         end_date     = greatest(p_date, start_date),
         ended_reason = coalesce(
           p_note,
           'Personnel ' || replace(p_status, '_', ' ') || ' on ' || to_char(p_date, 'DD Mon YYYY')
         )
   where personnel_id = p_personnel_id
     and status in ('pending', 'active');

  get diagnostics v_closed = row_count;

  -- The audit trigger on `deployments` (0007) records each closure, so the
  -- history stays readable; this note ties them back to the reason.
  if v_closed > 0 then
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary)
    values (
      (select auth.uid()),
      'personnel.separated',
      'personnel',
      p_personnel_id,
      v_closed || ' deployment(s) ended automatically on separation'
    );
  end if;

  return v_row;
end;
$$;

comment on function public.separate_personnel(uuid, text, date, text) is
  'Records a resignation or termination and ends the person''s open deployments in the same transaction. Added in 0019 — separation used to leave deployments active, inflating facility headcounts.';

revoke all on function public.separate_personnel(uuid, text, date, text) from public;
grant execute on function public.separate_personnel(uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill the rows the old write path left behind
-- ---------------------------------------------------------------------------
update public.deployments d
   set status       = 'ended',
       end_date     = greatest(coalesce(p.date_separated, current_date), d.start_date),
       ended_reason = coalesce(
         d.ended_reason,
         'Closed retroactively — personnel ' || replace(p.employment_status::text, '_', ' ')
       )
  from public.personnel p
 where p.id = d.personnel_id
   and d.status in ('pending', 'active')
   and p.employment_status in ('resigned', 'terminated');

-- ---------------------------------------------------------------------------
-- 3. Views stop counting people who no longer work here
-- ---------------------------------------------------------------------------
-- `personnel` joins in purely so `employment_status` is visible to the filters;
-- the grain is unchanged (one deployment row per join row), so the counts mean
-- exactly what they did before, minus the leavers.
create or replace view public.v_branch_staffing
with (security_invoker = true) as
select
  b.id as branch_id,
  b.code,
  b.name,
  b.city_municipality,
  b.region,
  b.is_active,
  b.required_headcount,
  b.coordinator_id,
  c.full_name as coordinator_name,
  count(d.id) filter (
    where d.status = 'active' and pe.employment_status = 'active'
  ) as deployed_count,
  greatest(
    b.required_headcount - count(d.id) filter (
      where d.status = 'active' and pe.employment_status = 'active'
    ), 0
  ) as vacancy_count,
  case
    when b.required_headcount = 0 then null
    else round(
      100.0 * count(d.id) filter (
        where d.status = 'active' and pe.employment_status = 'active'
      ) / b.required_headcount, 1
    )
  end as fill_rate_pct
from public.branches b
left join public.deployments d on d.branch_id = b.id
left join public.personnel pe on pe.id = d.personnel_id
left join public.profiles c on c.id = b.coordinator_id
group by b.id, c.full_name;

comment on view public.v_branch_staffing is
  'Per-facility staffing rollup. Counts only active deployments held by actively employed personnel (0019).';

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'applicants', jsonb_build_object(
      'total',     (select count(*) from public.applicants),
      'pending',   (select count(*) from public.applicants where status = 'pending'),
      'screening', (select count(*) from public.applicants where status = 'screening'),
      'interview', (select count(*) from public.applicants where status = 'interview'),
      'hired',     (select count(*) from public.applicants where status = 'hired'),
      'rejected',  (select count(*) from public.applicants where status = 'rejected'),
      'new_this_month', (select count(*) from public.applicants
                          where created_at >= date_trunc('month', now()))
    ),
    'personnel', jsonb_build_object(
      'total',    (select count(*) from public.personnel),
      'active',   (select count(*) from public.personnel where employment_status = 'active'),
      -- Joined to personnel in 0019: this used to count deployments belonging
      -- to people who had left, and could therefore exceed 'active' above.
      'deployed', (select count(distinct d.personnel_id)
                     from public.deployments d
                     join public.personnel p on p.id = d.personnel_id
                    where d.status = 'active' and p.employment_status = 'active'),
      'license_expiring', (select count(*) from public.personnel
                            where employment_status = 'active'
                              and security_license_expiry is not null
                              and security_license_expiry < current_date + 60)
    ),
    'branches', jsonb_build_object(
      'total',     (select count(*) from public.branches),
      'active',    (select count(*) from public.branches where is_active),
      'vacancies', (select coalesce(sum(vacancy_count), 0) from public.v_branch_staffing
                     where is_active)
    ),
    'deployments', jsonb_build_object(
      'active',        (select count(*) from public.deployments d
                          join public.personnel p on p.id = d.personnel_id
                         where d.status = 'active' and p.employment_status = 'active'),
      'ending_soon',   (select count(*) from public.deployments d
                          join public.personnel p on p.id = d.personnel_id
                         where d.status = 'active' and p.employment_status = 'active'
                           and d.end_date is not null
                           and d.end_date < current_date + 14),
      'new_this_month', (select count(*) from public.deployments
                          where created_at >= date_trunc('month', now()))
    )
  );
$$;

grant execute on function public.get_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Idempotent public submission
-- ---------------------------------------------------------------------------
-- The public form generates one uuid per filled-in form. When a submit times
-- out the applicant cannot tell whether the row was written, so the retry
-- carries the same key and gets the original receipt back rather than filing a
-- second application under a second reference number.
alter table public.applicants
  add column if not exists submission_id uuid;

create unique index if not exists applicants_submission_id_key
  on public.applicants (submission_id)
  where submission_id is not null;

comment on column public.applicants.submission_id is
  'Client-generated idempotency key for public submissions. Null for records created by staff.';

create or replace function public.submit_application(
  p_payload       jsonb,
  p_submission_id uuid default null
)
returns table (id uuid, reference_no text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id  uuid;
  v_ref text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'submit_application expects a JSON object payload';
  end if;

  -- A retry of a submission that actually landed: hand back the same receipt.
  if p_submission_id is not null then
    select a.id, a.reference_no into v_id, v_ref
      from public.applicants a
     where a.submission_id = p_submission_id;

    if found then
      return query select v_id, v_ref;
      return;
    end if;
  end if;

  insert into public.applicants (
    first_name, middle_name, last_name, suffix,
    email, phone, birth_date, sex, civil_status, height_cm, weight_kg,
    address_line, barangay, city_municipality, province, region, postal_code,
    position_id, preferred_branch_id, years_experience, highest_education,
    expected_salary, availability_date, source,
    sss_no, philhealth_no, pagibig_no, tin_no,
    nbi_clearance_no, nbi_clearance_expiry, police_clearance_no,
    security_license_no, security_license_expiry, is_licensed,
    submission_id,
    -- Pinned, never taken from the payload.
    status, reviewed_by, interview_at, interview_notes,
    rating, rejection_reason, internal_notes, archived_at
  )
  values (
    btrim(p_payload ->> 'first_name'),
    nullif(btrim(coalesce(p_payload ->> 'middle_name', '')), ''),
    btrim(p_payload ->> 'last_name'),
    nullif(btrim(coalesce(p_payload ->> 'suffix', '')), ''),
    lower(btrim(p_payload ->> 'email')),
    btrim(p_payload ->> 'phone'),
    (p_payload ->> 'birth_date')::date,
    (p_payload ->> 'sex')::public.sex_type,
    nullif(btrim(coalesce(p_payload ->> 'civil_status', '')), '')::public.civil_status,
    nullif(btrim(coalesce(p_payload ->> 'height_cm', '')), '')::numeric,
    nullif(btrim(coalesce(p_payload ->> 'weight_kg', '')), '')::numeric,

    nullif(btrim(coalesce(p_payload ->> 'address_line', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'barangay', '')), ''),
    btrim(p_payload ->> 'city_municipality'),
    nullif(btrim(coalesce(p_payload ->> 'province', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'region', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'postal_code', '')), ''),

    (p_payload ->> 'position_id')::uuid,
    nullif(btrim(coalesce(p_payload ->> 'preferred_branch_id', '')), '')::uuid,
    coalesce(nullif(btrim(coalesce(p_payload ->> 'years_experience', '')), '')::smallint, 0),
    nullif(btrim(coalesce(p_payload ->> 'highest_education', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'expected_salary', '')), '')::numeric,
    nullif(btrim(coalesce(p_payload ->> 'availability_date', '')), '')::date,
    nullif(btrim(coalesce(p_payload ->> 'source', '')), ''),

    nullif(btrim(coalesce(p_payload ->> 'sss_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'philhealth_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'pagibig_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'tin_no', '')), ''),

    nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_expiry', '')), '')::date,
    nullif(btrim(coalesce(p_payload ->> 'police_clearance_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'security_license_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'security_license_expiry', '')), '')::date,
    coalesce((p_payload ->> 'is_licensed')::boolean, false),

    p_submission_id,

    'pending'::public.applicant_status, null, null, null,
    null, null, null, null
  )
  returning applicants.id, applicants.reference_no
  into v_id, v_ref;

  return query select v_id, v_ref;
end;
$$;

comment on function public.submit_application(jsonb, uuid) is
  'Public application intake. SECURITY DEFINER because anon has no SELECT on applicants and therefore cannot use INSERT ... RETURNING. Idempotent on p_submission_id since 0019.';

-- The single-argument signature is superseded; dropping it keeps PostgREST from
-- resolving an ambiguous overload when the client omits the new argument.
drop function if exists public.submit_application(jsonb);

revoke all on function public.submit_application(jsonb, uuid) from public;
grant execute on function public.submit_application(jsonb, uuid) to anon, authenticated;

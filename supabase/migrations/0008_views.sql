-- ===========================================================================
-- 0008 — Views and materialized views
-- ===========================================================================
-- Postgres 15+ honours the *querying* user's RLS for views declared with
-- security_invoker, so these views inherit the policies of their base tables
-- rather than leaking data as the view owner. This is essential: without it a
-- view is a hole straight through RLS.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_applicant_summary — the admin applicant table's read model
-- ---------------------------------------------------------------------------
create or replace view public.v_applicant_summary
with (security_invoker = true) as
select
  a.id,
  a.reference_no,
  a.first_name,
  a.middle_name,
  a.last_name,
  (a.first_name || ' ' || coalesce(a.middle_name || ' ', '') || a.last_name) as full_name,
  a.email,
  a.phone,
  a.sex,
  a.birth_date,
  date_part('year', age(a.birth_date))::int as age,
  a.position_applied,
  a.status,
  a.is_licensed,
  a.years_experience,
  a.rating,
  a.interview_at,
  a.preferred_branch_id,
  b.name as preferred_branch_name,
  b.code as preferred_branch_code,
  a.reviewed_by,
  r.full_name as reviewed_by_name,
  a.created_at,
  a.status_changed_at,
  (select count(*) from public.applicant_documents d where d.applicant_id = a.id)
    as document_count,
  (select count(*) from public.applicant_documents d
    where d.applicant_id = a.id and d.verified_at is not null)
    as verified_document_count
from public.applicants a
left join public.branches b on b.id = a.preferred_branch_id
left join public.profiles r on r.id = a.reviewed_by;

-- ---------------------------------------------------------------------------
-- v_active_deployments — the deployment board
-- ---------------------------------------------------------------------------
create or replace view public.v_active_deployments
with (security_invoker = true) as
select
  d.id,
  d.personnel_id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name)
    as personnel_name,
  p.position,
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
  (current_date - d.start_date) as days_deployed,
  d.assigned_by,
  d.created_at
from public.deployments d
join public.personnel p on p.id = d.personnel_id
join public.branches b on b.id = d.branch_id;

-- ---------------------------------------------------------------------------
-- v_branch_staffing — capacity vs. actual, drives the staffing gap report
-- ---------------------------------------------------------------------------
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
  count(d.id) filter (where d.status = 'active') as deployed_count,
  greatest(
    b.required_headcount - count(d.id) filter (where d.status = 'active'), 0
  ) as vacancy_count,
  case
    when b.required_headcount = 0 then null
    else round(
      100.0 * count(d.id) filter (where d.status = 'active') / b.required_headcount, 1
    )
  end as fill_rate_pct
from public.branches b
left join public.deployments d on d.branch_id = b.id
left join public.profiles c on c.id = b.coordinator_id
group by b.id, c.full_name;

-- ---------------------------------------------------------------------------
-- v_personnel_roster
-- ---------------------------------------------------------------------------
create or replace view public.v_personnel_roster
with (security_invoker = true) as
select
  p.id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name) as full_name,
  p.first_name,
  p.last_name,
  p.position,
  p.rank_title,
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
  cur.start_date  as current_start_date
from public.personnel p
left join lateral (
  select d.* from public.deployments d
  where d.personnel_id = p.id and d.status = 'active'
  order by d.start_date desc limit 1
) cur on true
left join public.branches cb on cb.id = cur.branch_id;

-- ---------------------------------------------------------------------------
-- mv_recruitment_funnel — dashboard KPIs
-- ---------------------------------------------------------------------------
-- Materialized because the dashboard is read constantly and the underlying
-- aggregate scans the whole applicants table. Refreshed by the
-- refresh-analytics Edge Function on a schedule, or after bulk imports.
drop materialized view if exists public.mv_recruitment_funnel;
create materialized view public.mv_recruitment_funnel as
select
  date_trunc('month', a.created_at)::date as period_month,
  a.position_applied,
  a.preferred_branch_id,
  count(*)                                             as total,
  count(*) filter (where a.status = 'pending')         as pending,
  count(*) filter (where a.status = 'screening')       as screening,
  count(*) filter (where a.status = 'interview')       as interview,
  count(*) filter (where a.status = 'hired')           as hired,
  count(*) filter (where a.status = 'rejected')        as rejected,
  count(*) filter (where a.status = 'archived')        as archived,
  round(
    (avg(extract(epoch from (a.status_changed_at - a.created_at)) / 86400)
      filter (where a.status in ('hired', 'rejected')))::numeric,
    1
  )                                                    as avg_days_to_decision
from public.applicants a
group by 1, 2, 3;

create unique index if not exists mv_recruitment_funnel_pk
  on public.mv_recruitment_funnel (period_month, position_applied, coalesce(preferred_branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on materialized view public.mv_recruitment_funnel is
  'Pre-aggregated recruitment KPIs. Refresh via public.refresh_analytics().';

-- The unique index above is what allows a CONCURRENT refresh, so the dashboard
-- never sees an empty table mid-refresh.
create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_recruitment_funnel;
end;
$$;

revoke all on function public.refresh_analytics() from public, anon;
grant execute on function public.refresh_analytics() to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard rollup — one round trip for the KPI tiles
-- ---------------------------------------------------------------------------
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
      'deployed', (select count(distinct personnel_id) from public.deployments
                    where status = 'active'),
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
      'active',        (select count(*) from public.deployments where status = 'active'),
      'ending_soon',   (select count(*) from public.deployments
                         where status = 'active' and end_date is not null
                           and end_date < current_date + 14),
      'new_this_month', (select count(*) from public.deployments
                          where created_at >= date_trunc('month', now()))
    )
  );
$$;

grant execute on function public.get_dashboard_stats() to authenticated;

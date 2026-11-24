-- ===========================================================================
-- 0030 — Roster shows who has been re-hired
-- ===========================================================================
-- A re-hire is an event, not a status: the person is Active again (0027). Staff
-- still need to see at a glance that someone came back, so the roster view
-- derives it from the personnel_actions log. Columns are appended, so CREATE
-- OR REPLACE keeps the view's grants.
-- ===========================================================================

create or replace view public.v_personnel_roster
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
    where a.personnel_id = p.id and a.action_type = 'violation')::int as violation_count,
  -- 0030
  coalesce(rh.rehire_count, 0) > 0 as is_rehired,
  coalesce(rh.rehire_count, 0)     as rehire_count,
  rh.last_rehired_on
from public.personnel p
left join lateral (
  select d.* from public.deployments d
  where d.personnel_id = p.id and d.status in ('active', 'pending')
  order by (d.status = 'active') desc, d.start_date desc
  limit 1
) cur on true
left join public.branches cb on cb.id = cur.branch_id
left join lateral (
  select count(*)::int as rehire_count, max(a.effective_date) as last_rehired_on
    from public.personnel_actions a
   where a.personnel_id = p.id and a.action_type = 'rehire'
) rh on true;

grant select on public.v_personnel_roster to authenticated;

comment on view public.v_personnel_roster is
  'Roster with each person''s current facility (live deployment) and whether they have been re-hired (0030).';

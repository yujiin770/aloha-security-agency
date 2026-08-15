-- ===========================================================================
-- 0022 — "Hired" cannot be a bare status update
-- ===========================================================================
-- validate_applicant_transition() (0007) lists 'hired' as a legal move out of
-- 'interview', so `update applicants set status = 'hired'` succeeds. But the
-- personnel row — the employee number, the roster entry, the thing that makes
-- someone assignable to a post — is written only by
-- promote_applicant_to_personnel(). Nothing tied the two together.
--
-- The result is an applicant who reads as Hired with no personnel record
-- behind them: absent from v_personnel_roster, absent from the Assign
-- Personnel dropdown, invisible to every staffing count. Silent, and
-- indistinguishable from "the hire didn't work".
--
-- The UI now routes hiring through the RPC, but the UI is not the boundary —
-- PostgREST accepts the same UPDATE from anyone with the applicants_update
-- policy. So the invariant is enforced here.
--
-- Approach: promote_applicant_to_personnel() announces itself with a
-- transaction-local setting, and a BEFORE UPDATE trigger rejects any move to
-- 'hired' that does not carry it. `set_config(..., true)` is scoped to the
-- transaction, so the permission cannot leak to a later statement on the same
-- connection.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Repair the applicants already stranded in this state
-- ---------------------------------------------------------------------------
-- Idempotent by construction: it only touches hired applicants that have no
-- personnel row, so it is a no-op on a healthy database and safe to re-run.
--
-- `personnel` is FORCE ROW LEVEL SECURITY (0009), which subjects the table
-- owner to its policies too. personnel_insert requires has_role(...), and
-- auth.uid() is null in a migration, so the insert would be silently refused.
-- Lifted for this statement only and restored immediately.
alter table public.personnel no force row level security;

insert into public.personnel (
  employee_no, applicant_id, first_name, middle_name, last_name, suffix,
  email, phone, birth_date, sex, position_id, rank_id, date_hired,
  sss_no, philhealth_no, pagibig_no, tin_no,
  security_license_no, security_license_expiry, created_by
)
select
  'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0'),
  a.id, a.first_name, a.middle_name, a.last_name, a.suffix,
  a.email, a.phone, a.birth_date, a.sex, a.position_id,
  null,  -- Rank was never chosen: the dialog that asks for it was bypassed.
  coalesce(
    (select max(h.created_at)::date
       from public.applicant_status_history h
      where h.applicant_id = a.id and h.to_status = 'hired'),
    a.updated_at::date,
    current_date
  ),
  a.sss_no, a.philhealth_no, a.pagibig_no, a.tin_no,
  a.security_license_no, a.security_license_expiry,
  null   -- No actor to attribute this to; it is a repair, not someone's action.
from public.applicants a
where a.status = 'hired'
  and not exists (
    select 1 from public.personnel p where p.applicant_id = a.id
  );

alter table public.personnel force row level security;

-- ---------------------------------------------------------------------------
-- 2. The RPC announces itself
-- ---------------------------------------------------------------------------
-- Body is 0013's, unchanged except for the set_config call. Recreated with the
-- same (uuid, date, uuid) signature so the existing grant still applies.
create or replace function public.promote_applicant_to_personnel(
  p_applicant_id uuid,
  p_date_hired   date default current_date,
  p_rank_id      uuid default null
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
    email, phone, birth_date, sex, position_id, rank_id, date_hired,
    sss_no, philhealth_no, pagibig_no, tin_no,
    security_license_no, security_license_expiry, created_by
  )
  values (
    'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0'),
    v_applicant.id, v_applicant.first_name, v_applicant.middle_name,
    v_applicant.last_name, v_applicant.suffix, v_applicant.email, v_applicant.phone,
    v_applicant.birth_date, v_applicant.sex, v_applicant.position_id,
    p_rank_id, p_date_hired,
    v_applicant.sss_no, v_applicant.philhealth_no, v_applicant.pagibig_no,
    v_applicant.tin_no, v_applicant.security_license_no,
    v_applicant.security_license_expiry, (select auth.uid())
  )
  returning * into v_personnel;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  select
    (select auth.uid()), 'applicant.hired', 'personnel', v_personnel.id,
    v_applicant.first_name || ' ' || v_applicant.last_name || ' hired as ' || pos.name,
    jsonb_build_object('applicant_id', v_applicant.id,
                       'reference_no', v_applicant.reference_no)
  from public.positions pos where pos.id = v_applicant.position_id;

  return v_personnel;
end;
$$;

comment on function public.promote_applicant_to_personnel(uuid, date, uuid) is
  'The only supported way to hire an applicant: moves them to hired AND creates the personnel row, in one transaction. Sets app.onboarding so the guard trigger in 0022 admits the status change.';

-- ---------------------------------------------------------------------------
-- 3. Reject any other route to 'hired'
-- ---------------------------------------------------------------------------
create or replace function public.enforce_hiring_through_onboarding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'hired'
     and old.status is distinct from 'hired'
     and coalesce(current_setting('app.onboarding', true), '') <> 'on' then
    raise exception
      'An applicant is hired through the onboarding step, which also creates their personnel record. Use the Hire action rather than setting the status directly.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_hiring_through_onboarding is
  'Blocks a bare update to status = hired, which would leave an applicant marked hired with no personnel record and therefore absent from the roster (0022).';

-- BEFORE, so the row is rejected ahead of log_applicant_status_change() writing
-- history and firing notifications for a change that is not going to happen.
drop trigger if exists enforce_hiring_through_onboarding on public.applicants;
create trigger enforce_hiring_through_onboarding
  before update of status on public.applicants
  for each row execute function public.enforce_hiring_through_onboarding();

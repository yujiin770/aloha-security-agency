-- ===========================================================================
-- 0029 — Personnel address, and CSV import of existing personnel
-- ===========================================================================
-- The agency's roster sheets carry an ADDRESS per guard; personnel had no
-- column for it. And seeding hundreds of existing guards one dialog at a time
-- is not realistic, so the staff console now imports a CSV (preview → edit →
-- import). Each row goes through import_personnel_row(), which writes the
-- person, their facility, their current status and an optional violation in
-- ONE transaction — a row either lands completely or not at all, so a failed
-- row can be fixed and retried without leaving half a record behind.
-- ===========================================================================

alter table public.personnel add column if not exists address text;

comment on column public.personnel.address is 'Present address (0029).';

-- ---------------------------------------------------------------------------
-- add_existing_personnel(): 0028's body, now also saving the address
-- ---------------------------------------------------------------------------
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
    email, phone, birth_date, sex, address, date_hired,
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
    nullif(btrim(coalesce(p_data ->> 'address', '')), ''),
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

-- ---------------------------------------------------------------------------
-- import_personnel_row(): one CSV row, all or nothing
-- ---------------------------------------------------------------------------
-- p_row carries the add_existing_personnel() fields plus:
--   branch_id, shift, post          facility (resolved by the client)
--   status                          active | on_leave | suspended | resigned
--                                   | terminated | blocklisted
--   status_date, status_reason      effectivity date and reason
--   violation, violation_details,   an optional violation / offense
--   violation_date
-- Status changes reuse the 0027 functions, so the same rules apply (a reason
-- is required for suspension, termination and blocklisting) and the same
-- history rows are written.
create or replace function public.import_personnel_row(p_row jsonb)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       public.personnel;
  v_status    text := lower(coalesce(nullif(btrim(p_row ->> 'status'), ''), 'active'));
  v_date      date := coalesce(nullif(p_row ->> 'status_date', '')::date, current_date);
  v_reason    text := nullif(btrim(coalesce(p_row ->> 'status_reason', '')), '');
  v_offense   text := nullif(btrim(coalesce(p_row ->> 'violation', '')), '');
begin
  v_row := public.add_existing_personnel(
    p_row,
    nullif(p_row ->> 'branch_id', '')::uuid,
    coalesce(nullif(p_row ->> 'shift', ''), 'day')::public.shift_type,
    p_row ->> 'post'
  );

  if v_offense is not null then
    perform public.record_personnel_violation(
      v_row.id,
      v_offense,
      coalesce(nullif(btrim(coalesce(p_row ->> 'violation_details', '')), ''), v_offense),
      coalesce(nullif(p_row ->> 'violation_date', '')::date, v_date)
    );
  end if;

  case v_status
    when 'active' then
      null;
    when 'on_leave' then
      update public.personnel
         set employment_status = 'on_leave', status_effective_date = v_date
       where id = v_row.id;
    when 'suspended' then
      perform public.suspend_personnel(v_row.id, v_reason, v_date, null);
    when 'resigned', 'terminated' then
      perform public.separate_personnel(v_row.id, v_status, v_date, v_reason);
    when 'blocklisted' then
      perform public.blocklist_personnel(v_row.id, v_reason, v_date);
    else
      raise exception 'Unknown status "%". Use Active, On leave, Suspended, Resigned, Terminated or Blocklisted.',
        p_row ->> 'status';
  end case;

  select * into v_row from public.personnel where id = v_row.id;
  return v_row;
end;
$$;

revoke all on function public.import_personnel_row(jsonb) from public;
grant execute on function public.import_personnel_row(jsonb) to authenticated;

comment on function public.import_personnel_row(jsonb) is
  'CSV import (0029): creates one existing guard with facility, status and optional violation in a single transaction. Administrators and HR only (checked by add_existing_personnel).';

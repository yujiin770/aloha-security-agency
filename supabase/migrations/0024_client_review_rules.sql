-- ===========================================================================
-- 0024 — Pipeline and access rules from client review
-- ===========================================================================
--   1. Applicant statuses only move forward. Once an applicant has left a
--      stage they cannot be put back into it (no screening -> pending,
--      interview -> screening, rejected -> pending).
--   2. A rejected applicant may apply again with the same email address, but
--      only after a cool-down (default 6 months, setting
--      `recruitment.reapply_after_months`).
--   3. There is exactly one Owner, and the Owner role cannot be granted from
--      the application at all — not by an admin, not by the Owner, not by an
--      Edge Function using the service_role key. It is assigned directly in
--      Supabase (SQL editor / psql), which connects as `postgres`.
--   4. The activity feed is readable by Owner and Administrator only.
--   5. personnel.employee_no gets a default, so a guard who was hired before
--      the system existed can be entered directly instead of only through
--      promote_applicant_to_personnel().
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Forward-only status transitions
-- ---------------------------------------------------------------------------
-- Body is 0007's; only the transition map and the message changed. Must stay
-- in step with APPLICANT_TRANSITIONS in src/utils/constants.ts.
create or replace function public.validate_applicant_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed public.applicant_status[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'pending'   then array['screening', 'interview', 'rejected', 'archived']
    when 'screening' then array['interview', 'rejected', 'archived']
    when 'interview' then array['hired', 'rejected', 'archived']
    when 'hired'     then array['archived']
    when 'rejected'  then array['archived']
    when 'archived'  then array[]::text[]
  end::public.applicant_status[];

  if not (new.status = any (v_allowed)) then
    raise exception
      'An applicant cannot be moved from % to %. Statuses only move forward.',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();
  new.reviewed_by := coalesce((select auth.uid()), new.reviewed_by);

  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
    new.purge_after := (
      current_date + make_interval(
        days => coalesce(
          (select (value #>> '{}')::int from public.settings
           where key = 'retention.applicant_days'),
          1825  -- 5 years
        )
      )
    )::date;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Re-applying after rejection
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description)
values (
  'recruitment.reapply_after_months',
  '6'::jsonb,
  'Months a rejected applicant must wait before applying again with the same email address.'
)
on conflict (key) do nothing;

-- The date from which an address that was rejected may apply again, or null
-- if it was never rejected. Uses the latest rejection, so a person rejected
-- twice waits from the second one. An application that was rejected and then
-- archived still counts as rejected.
create or replace function public.email_reapply_date(p_email text)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    max(
      coalesce(
        (select max(h.created_at)
           from public.applicant_status_history h
          where h.applicant_id = a.id and h.to_status = 'rejected'),
        case when a.status = 'rejected' then a.status_changed_at end
      )
    )
    + make_interval(months => coalesce(
        (select (s.value #>> '{}')::int from public.settings s
          where s.key = 'recruitment.reapply_after_months'),
        6
      ))
  )::date
  from public.applicants a
  where lower(btrim(a.email)) = lower(btrim(p_email));
$$;

revoke all on function public.email_reapply_date(text) from public, anon, authenticated;

-- Same contract as 0023 ('available', 'hired', or a blocking status), with one
-- change: a rejection only blocks while its cool-down is running.
--
--   active personnel                        -> 'hired'
--   an open application                     -> its status
--   an archived application never rejected  -> 'archived' (as in 0023)
--   a rejection still inside the cool-down  -> 'rejected'
--   otherwise                               -> 'available'
create or replace function public.email_application_state(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'hired'
       from public.personnel p
      where p.email is not null
        and lower(btrim(p.email)) = lower(btrim(p_email))
        and p.employment_status = 'active'
      limit 1),
    (select a.status::text
       from public.applicants a
      where lower(btrim(a.email)) = lower(btrim(p_email))
        and a.status in ('pending', 'screening', 'interview', 'hired')
      order by a.created_at
      limit 1),
    (select 'archived'
       from public.applicants a
      where lower(btrim(a.email)) = lower(btrim(p_email))
        and a.status = 'archived'
        and not exists (
          select 1 from public.applicant_status_history h
           where h.applicant_id = a.id and h.to_status = 'rejected'
        )
      limit 1),
    (select 'rejected'
      where public.email_reapply_date(p_email) > current_date),
    'available'
  );
$$;

-- One place for the sentence the applicant reads, so the pre-flight check and
-- the submit path cannot drift apart.
create or replace function public.email_ineligible_message(p_state text, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_state = 'available' then null
    when p_state = 'hired' then
      'This email address belongs to a current member of our personnel. Please contact HR instead of applying again.'
    when p_state = 'rejected' then
      'Your previous application was not successful. You may apply again with this email address from '
      || to_char(public.email_reapply_date(p_email), 'FMMonth FMDD, YYYY') || '.'
    else
      'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'
  end;
$$;

revoke all on function public.email_ineligible_message(text, text) from public, anon, authenticated;

create or replace function public.check_email_eligibility(p_email text)
returns table (eligible boolean, state text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  if p_email is null or btrim(p_email) = '' then
    return query select true, 'available'::text, null::text;
    return;
  end if;

  v_state := public.email_application_state(p_email);

  return query select
    v_state = 'available',
    v_state,
    public.email_ineligible_message(v_state, p_email);
end;
$$;

revoke all on function public.check_email_eligibility(text) from public;
grant execute on function public.check_email_eligibility(text) to anon, authenticated;

-- The unique index from 0023 covered every row, which would make a second
-- application from a rejected address impossible even after the cool-down.
-- It now covers open applications only: an address holds at most one live
-- application at a time, and any number of closed ones.
drop index if exists public.applicants_email_unique_idx;

do $$
declare
  v_dupes text;
begin
  select string_agg(email || ' (' || n || ')', ', ' order by email)
    into v_dupes
    from (
      select lower(btrim(email)) as email, count(*) as n
        from public.applicants
       where status in ('pending', 'screening', 'interview', 'hired')
       group by 1
      having count(*) > 1
    ) d;

  if v_dupes is null then
    create unique index applicants_email_unique_idx
      on public.applicants (lower(btrim(email)))
      where status in ('pending', 'screening', 'interview', 'hired');

    comment on index public.applicants_email_unique_idx is
      'At most one open application per email address (0023, narrowed in 0024).';
  else
    raise warning
      'applicants_email_unique_idx NOT created: several open applications share an email — %. Resolve them, then re-run this block.',
      v_dupes;
  end if;
end;
$$;

-- submit_application: 0023's body with the eligibility gate routed through
-- email_ineligible_message(). Everything else is unchanged.
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
  v_id    uuid;
  v_ref   text;
  v_email text;
  v_state text;
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

  v_email := lower(btrim(p_payload ->> 'email'));

  if v_email is null or v_email = '' then
    raise exception 'An email address is required.'
      using errcode = 'P0001';
  end if;

  v_state := public.email_application_state(v_email);

  if v_state <> 'available' then
    raise exception '%', public.email_ineligible_message(v_state, v_email)
      using errcode = 'P0001';
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
    v_email,
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

exception
  -- Two submissions of the same address in the same instant: both pass the
  -- check above, one loses the unique index. Restate it as the sentence the
  -- applicant would have got had they been a moment later.
  when unique_violation then
    if sqlerrm like '%applicants_email_unique_idx%' then
      raise exception 'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'
        using errcode = 'P0001';
    end if;
    raise;
end;
$$;

comment on function public.submit_application(jsonb, uuid) is
  'Public application intake. SECURITY DEFINER because anon has no SELECT on applicants and therefore cannot use INSERT ... RETURNING. Idempotent on p_submission_id (0019); one open application per email address (0023), with a cool-down after rejection (0024).';

revoke all on function public.submit_application(jsonb, uuid) from public;
grant execute on function public.submit_application(jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Exactly one Owner, assigned only in Supabase
-- ---------------------------------------------------------------------------
-- True for 'owner' and for any custom role that inherits from it.
create or replace function public.role_is_owner(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(r.inherits_from::text, r.key) = 'owner'
       from public.roles r
      where r.key = p_role),
    p_role = 'owner'
  );
$$;

grant execute on function public.role_is_owner(text) to authenticated;

-- Roles reached over the API: the browser (anon/authenticated) and Edge
-- Functions holding the service_role key. A grant made from the SQL editor or
-- psql runs as `postgres` and is the one sanctioned way to set the Owner.
create or replace function public.enforce_single_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.role_is_owner(new.role) then
    return new;
  end if;

  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception
      'The Owner role cannot be granted from the application. It is assigned directly in the Supabase database.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.user_roles ur
     where ur.user_id <> new.user_id
       and public.role_is_owner(ur.role)
  ) then
    raise exception
      'There can be only one Owner account. Remove the Owner role from the current holder before assigning it to someone else.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_single_owner on public.user_roles;
create trigger enforce_single_owner
  before insert or update of role, user_id on public.user_roles
  for each row execute function public.enforce_single_owner();

-- A custom role inheriting Owner would be a second Owner by another name.
create or replace function public.enforce_no_owner_derived_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key <> 'owner'
     and new.inherits_from = 'owner'::public.app_role
     and current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'A role cannot be based on Owner. There is only one Owner account.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_no_owner_derived_roles on public.roles;
create trigger enforce_no_owner_derived_roles
  before insert or update of inherits_from on public.roles
  for each row execute function public.enforce_no_owner_derived_roles();

-- Owner grants are out of reach of the write policy in both directions: an
-- admin can neither grant the Owner role nor revoke it from the Owner.
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin() and not public.role_is_owner(role))
  with check (
    public.is_admin()
    and not public.role_is_owner(role)
    and exists (
      select 1 from public.roles r
      where r.key = user_roles.role and r.is_assignable
    )
  );

-- Hides Owner from every role picker, which already filter on is_assignable.
update public.roles
   set is_assignable = false
 where key = 'owner' or inherits_from = 'owner'::public.app_role;

do $$
declare
  v_count int;
begin
  select count(distinct ur.user_id) into v_count
    from public.user_roles ur
   where public.role_is_owner(ur.role);

  if v_count > 1 then
    raise warning
      '% accounts currently hold the Owner role. Keep one and delete the other grants from public.user_roles in the SQL editor.',
      v_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Activity feed: Owner and Administrator only
-- ---------------------------------------------------------------------------
-- has_role() resolves inheritance, so System Administrator (which inherits
-- 'system_administrator', not 'admin') is excluded, as are all staff roles.
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (public.has_role('owner'::public.app_role, 'admin'::public.app_role));

-- ---------------------------------------------------------------------------
-- 5. Existing guards can be entered directly
-- ---------------------------------------------------------------------------
-- Same format promote_applicant_to_personnel() uses. A guard who already has
-- an employee number from before the system can still be given it explicitly.
alter table public.personnel
  alter column employee_no
  set default 'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0');

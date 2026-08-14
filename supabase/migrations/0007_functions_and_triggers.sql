-- ===========================================================================
-- 0007 — Functions and triggers
-- ===========================================================================
-- Every function sets an explicit empty search_path and fully qualifies its
-- object references. The role helpers are SECURITY DEFINER + STABLE: RLS
-- policies on other tables call them instead of sub-querying `user_roles`
-- directly, which is what prevents infinite policy recursion.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Housekeeping: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'branches', 'applicants', 'applicant_documents',
    'personnel', 'deployments', 'settings'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_roles()
returns public.app_role[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(ur.role), array[]::public.app_role[])
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid())
    and p.is_active;
$$;

comment on function public.current_user_roles is
  'Roles of the calling user. Returns empty for anon or deactivated accounts.';

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.is_active
      and ur.role = any (roles)
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_role('owner'::public.app_role, 'admin'::public.app_role);
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid()) and p.is_active
  );
$$;

comment on function public.is_staff is
  'True for any authenticated user holding at least one active role. The baseline read gate for internal tables.';

-- Branch scoping for the branch_coordinator role.
create or replace function public.current_user_branch_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select branch_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    public.has_role(
      'owner'::public.app_role, 'admin'::public.app_role,
      'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
      'deployment_officer'::public.app_role
    )
    or (
      public.has_role('branch_coordinator'::public.app_role)
      and target_branch is not distinct from public.current_user_branch_id()
    );
$$;

comment on function public.can_access_branch is
  'Agency-wide roles see every branch; a branch_coordinator sees only their own.';

-- ---------------------------------------------------------------------------
-- Generic audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_actor_email text;
  v_old         jsonb;
  v_new         jsonb;
  v_keys        text[];
  v_record_id   uuid;
begin
  select email into v_actor_email from public.profiles where id = v_actor;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_record_id := (v_old ->> 'id')::uuid;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_record_id := (v_new ->> 'id')::uuid;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_record_id := (v_new ->> 'id')::uuid;
    select array_agg(key) into v_keys
    from jsonb_each(v_new)
    where v_new -> key is distinct from v_old -> key
      and key not in ('updated_at');
    -- Nothing but the timestamp moved: not worth an audit row.
    if v_keys is null then
      return new;
    end if;
  end if;

  insert into public.audit_logs (
    table_name, record_id, action, actor_id, actor_email,
    old_data, new_data, changed_keys
  )
  values (
    tg_table_name, v_record_id, lower(tg_op)::public.audit_action,
    v_actor, v_actor_email, v_old, v_new, v_keys
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'applicants', 'applicant_documents', 'branches',
    'personnel', 'deployments', 'profiles', 'user_roles', 'settings'
  ]
  loop
    execute format('drop trigger if exists audit_changes on public.%I', t);
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Applicant reference numbers — ASA-YYYY-000001
-- ---------------------------------------------------------------------------
create or replace function public.generate_reference_no()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reference_no is null or new.reference_no = '' then
    new.reference_no := 'ASA-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.applicant_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists generate_reference_no on public.applicants;
create trigger generate_reference_no
  before insert on public.applicants
  for each row execute function public.generate_reference_no();

-- ---------------------------------------------------------------------------
-- Applicant pipeline guards
-- ---------------------------------------------------------------------------
-- The client can propose any status; the database decides whether the
-- transition is legal. This is a business rule, so it belongs here — not only
-- in the UI, which an attacker can bypass.
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
    when 'screening' then array['interview', 'rejected', 'pending', 'archived']
    when 'interview' then array['hired', 'rejected', 'screening', 'archived']
    when 'hired'     then array['archived']
    when 'rejected'  then array['archived', 'pending']
    when 'archived'  then array[]::text[]
  end::public.applicant_status[];

  if not (new.status = any (v_allowed)) then
    raise exception
      'Illegal applicant status transition: % -> %', old.status, new.status
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

drop trigger if exists validate_applicant_transition on public.applicants;
create trigger validate_applicant_transition
  before update of status on public.applicants
  for each row execute function public.validate_applicant_transition();

create or replace function public.log_applicant_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, (select auth.uid()), 'Application submitted');
  elsif new.status is distinct from old.status then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, (select auth.uid()), new.rejection_reason);

    -- Fan a notification out to every recruitment-facing staff member.
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    select
      ur.user_id,
      'applicant_status_changed'::public.notification_type,
      'Applicant ' || new.reference_no || ' moved to ' || new.status,
      new.first_name || ' ' || new.last_name || ' — ' ||
        replace(new.position_applied::text, '_', ' '),
      'applicant', new.id, '/admin/applicants/' || new.id
    from public.user_roles ur
    where ur.role in ('hr_staff', 'recruitment_officer', 'admin', 'owner')
      and ur.user_id is distinct from (select auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists log_applicant_status_change on public.applicants;
create trigger log_applicant_status_change
  after insert or update of status on public.applicants
  for each row execute function public.log_applicant_status_change();

-- ---------------------------------------------------------------------------
-- Deployment history + branch coordinator notification
-- ---------------------------------------------------------------------------
create or replace function public.log_deployment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deployment_history
      (deployment_id, personnel_id, branch_id, from_status, to_status, changed_by, note)
    values (new.id, new.personnel_id, new.branch_id, null, new.status,
            (select auth.uid()), 'Deployment created');

    insert into public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    select b.coordinator_id, 'deployment_assigned'::public.notification_type,
           'New deployment at ' || b.name,
           p.first_name || ' ' || p.last_name || ' (' || p.employee_no || ')',
           'deployment', new.id, '/admin/deployments/' || new.id
    from public.branches b
    join public.personnel p on p.id = new.personnel_id
    where b.id = new.branch_id and b.coordinator_id is not null;

  elsif new.status is distinct from old.status or new.branch_id is distinct from old.branch_id then
    insert into public.deployment_history
      (deployment_id, personnel_id, branch_id, from_status, to_status, changed_by, note)
    values (new.id, new.personnel_id, new.branch_id, old.status, new.status,
            (select auth.uid()), new.ended_reason);
  end if;

  return new;
end;
$$;

drop trigger if exists log_deployment_change on public.deployments;
create trigger log_deployment_change
  after insert or update on public.deployments
  for each row execute function public.log_deployment_change();

-- ---------------------------------------------------------------------------
-- Hiring: applicant -> personnel
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the whole promotion is atomic and callable as one RPC,
-- but it re-checks the caller's role explicitly — a definer function must never
-- assume RLS protected it.
create or replace function public.promote_applicant_to_personnel(
  p_applicant_id uuid,
  p_date_hired   date default current_date,
  p_rank_title   text default null
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

  update public.applicants set status = 'hired' where id = p_applicant_id;

  insert into public.personnel (
    employee_no, applicant_id, first_name, middle_name, last_name, suffix,
    email, phone, birth_date, sex, position, rank_title, date_hired,
    sss_no, philhealth_no, pagibig_no, tin_no,
    security_license_no, security_license_expiry, created_by
  )
  values (
    'ASA-EMP-' || lpad(nextval('public.personnel_employee_seq')::text, 5, '0'),
    v_applicant.id, v_applicant.first_name, v_applicant.middle_name,
    v_applicant.last_name, v_applicant.suffix, v_applicant.email, v_applicant.phone,
    v_applicant.birth_date, v_applicant.sex, v_applicant.position_applied,
    p_rank_title, p_date_hired,
    v_applicant.sss_no, v_applicant.philhealth_no, v_applicant.pagibig_no,
    v_applicant.tin_no, v_applicant.security_license_no,
    v_applicant.security_license_expiry, (select auth.uid())
  )
  returning * into v_personnel;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  values (
    (select auth.uid()), 'applicant.hired', 'personnel', v_personnel.id,
    v_applicant.first_name || ' ' || v_applicant.last_name ||
      ' hired as ' || replace(v_applicant.position_applied::text, '_', ' '),
    jsonb_build_object('applicant_id', v_applicant.id, 'reference_no', v_applicant.reference_no)
  );

  return v_personnel;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ending / transferring a deployment
-- ---------------------------------------------------------------------------
create or replace function public.end_deployment(
  p_deployment_id uuid,
  p_end_date      date default current_date,
  p_reason        text default null
)
returns public.deployments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.deployments;
begin
  if not public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role, 'deployment_officer'::public.app_role
  ) then
    raise exception 'Insufficient privileges to end a deployment'
      using errcode = 'insufficient_privilege';
  end if;

  update public.deployments
     set status = 'ended', end_date = p_end_date, ended_reason = p_reason
   where id = p_deployment_id and status in ('pending', 'active')
  returning * into v_row;

  if not found then
    raise exception 'No open deployment % to end', p_deployment_id
      using errcode = 'no_data_found';
  end if;

  return v_row;
end;
$$;

create or replace function public.transfer_deployment(
  p_deployment_id  uuid,
  p_target_branch  uuid,
  p_effective_date date default current_date,
  p_shift          public.shift_type default null,
  p_reason         text default null
)
returns public.deployments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.deployments;
  v_new public.deployments;
begin
  if not public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role, 'deployment_officer'::public.app_role
  ) then
    raise exception 'Insufficient privileges to transfer a deployment'
      using errcode = 'insufficient_privilege';
  end if;

  -- Close the old assignment the day before the new one starts, so the
  -- no-overlap exclusion constraint is satisfied.
  update public.deployments
     set status = 'transferred',
         end_date = greatest(start_date, p_effective_date - 1),
         ended_reason = coalesce(p_reason, 'Transferred to another post')
   where id = p_deployment_id and status in ('pending', 'active')
  returning * into v_old;

  if not found then
    raise exception 'No open deployment % to transfer', p_deployment_id
      using errcode = 'no_data_found';
  end if;

  insert into public.deployments
    (personnel_id, branch_id, shift, start_date, status, daily_rate, assigned_by, remarks)
  values (
    v_old.personnel_id, p_target_branch, coalesce(p_shift, v_old.shift),
    p_effective_date, 'active', v_old.daily_rate, (select auth.uid()),
    'Transferred from deployment ' || v_old.id
  )
  returning * into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public status checker
-- ---------------------------------------------------------------------------
-- The anonymous role gets no SELECT on `applicants`. This RPC is the only
-- public read path: it requires two matching facts (reference number AND
-- surname) and returns nothing that could be used to enumerate applicants.
create or replace function public.check_application_status(
  p_reference_no text,
  p_last_name    text
)
returns table (
  reference_no      text,
  first_name        text,
  last_name         text,
  position_applied  public.position_type,
  status            public.applicant_status,
  submitted_at      timestamptz,
  status_changed_at timestamptz,
  interview_at      timestamptz,
  timeline          jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    a.reference_no,
    -- Partially masked: enough to confirm identity, not enough to harvest.
    left(a.first_name, 1) || repeat('*', greatest(length(a.first_name) - 1, 0)),
    a.last_name,
    a.position_applied,
    a.status,
    a.created_at,
    a.status_changed_at,
    a.interview_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('status', h.to_status, 'at', h.created_at)
                 order by h.created_at
               )
        from public.applicant_status_history h
        where h.applicant_id = a.id
      ),
      '[]'::jsonb
    )
  from public.applicants a
  where upper(a.reference_no) = upper(btrim(p_reference_no))
    and lower(a.last_name) = lower(btrim(p_last_name))
    and a.status <> 'archived';
end;
$$;

revoke all on function public.check_application_status(text, text) from public;
grant execute on function public.check_application_status(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention: purge archived applicants past their retention date
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_applicants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.applicants
  where archived_at is not null
    and purge_after is not null
    and purge_after < current_date
    and not exists (select 1 from public.personnel p where p.applicant_id = applicants.id);

  get diagnostics v_count = row_count;

  insert into public.activity_logs (action, entity_type, summary, metadata)
  values ('retention.purge', 'applicant',
          v_count || ' archived applicant record(s) permanently deleted',
          jsonb_build_object('count', v_count));

  return v_count;
end;
$$;

comment on function public.purge_expired_applicants is
  'Retention policy enforcement. Invoke from the scheduled Edge Function or pg_cron, never from the client.';

revoke all on function public.purge_expired_applicants() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notification convenience
-- ---------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.promote_applicant_to_personnel(uuid, date, text) to authenticated;
grant execute on function public.end_deployment(uuid, date, text) to authenticated;
grant execute on function public.transfer_deployment(uuid, uuid, date, public.shift_type, text) to authenticated;

-- ===========================================================================
-- 0015 — System Administrator gains full access
-- ===========================================================================
-- Supersedes the read-only-on-operations scope set in 0014. The role is now
-- equivalent to `admin` everywhere.
--
-- The one thing it still cannot do is mint an `owner` — and neither can an
-- admin. That invariant is what stops any compromised administrative account
-- from escalating to permanent, unrevokable control, so it is preserved rather
-- than removed. Everything else an admin can do, a system administrator can do.
--
-- Implementation note: rather than listing the role in thirty separate
-- policies, `is_admin()` is redefined to include it. Every policy already
-- written in terms of `is_admin()` widens automatically, and future changes to
-- "who counts as an administrator" happen in one function instead of thirty
-- places that can drift apart.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Redefine the administrator predicate
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.has_role(
    'owner'::public.app_role,
    'admin'::public.app_role,
    'system_administrator'::public.app_role
  );
$$;

comment on function public.is_admin is
  'Administrator-equivalent roles: owner, admin, system_administrator. Redefined in 0015 to include the latter.';

-- `is_config_admin()` now covers exactly the same set. Kept as a distinct name
-- because configuration policies read more clearly with it, and because the two
-- may legitimately diverge again later.
create or replace function public.is_config_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 2. Policies with explicit role lists
-- ---------------------------------------------------------------------------
-- These name individual operational roles rather than calling is_admin(), so
-- they are rewritten as "is_admin() OR <the specific roles>". That keeps the
-- specific grants intact while folding the administrator set into one call.

-- applicants ----------------------------------------------------------------
drop policy if exists applicants_update_staff on public.applicants;
create policy applicants_update_staff on public.applicants
  for update to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role)
  )
  with check (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role)
  );

drop policy if exists applicants_select_staff on public.applicants;
create policy applicants_select_staff on public.applicants
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role,
                       'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and preferred_branch_id = public.current_user_branch_id())
  );

-- applicant_documents -------------------------------------------------------
drop policy if exists applicant_documents_insert on public.applicant_documents;
create policy applicant_documents_insert on public.applicant_documents
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.applicants a
      where a.id = applicant_id
        and (
          a.status = 'pending'
          or public.is_admin()
          or public.has_role('hr_staff'::public.app_role,
                             'recruitment_officer'::public.app_role)
        )
    )
  );

drop policy if exists applicant_documents_select_staff on public.applicant_documents;
create policy applicant_documents_select_staff on public.applicant_documents
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role,
                       'deployment_officer'::public.app_role)
  );

drop policy if exists applicant_documents_update_staff on public.applicant_documents;
create policy applicant_documents_update_staff on public.applicant_documents
  for update to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role)
  )
  with check (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role)
  );

drop policy if exists applicant_documents_delete on public.applicant_documents;
create policy applicant_documents_delete on public.applicant_documents
  for delete to authenticated
  using (public.is_admin() or public.has_role('hr_staff'::public.app_role));

-- personnel -----------------------------------------------------------------
drop policy if exists personnel_select on public.personnel;
create policy personnel_select on public.personnel
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role,
                       'deployment_officer'::public.app_role)
    or (
      public.has_role('branch_coordinator'::public.app_role)
      and exists (
        select 1 from public.deployments d
        where d.personnel_id = personnel.id
          and d.status = 'active'
          and d.branch_id = public.current_user_branch_id()
      )
    )
  );

drop policy if exists personnel_insert on public.personnel;
create policy personnel_insert on public.personnel
  for insert to authenticated
  with check (public.is_admin() or public.has_role('hr_staff'::public.app_role));

drop policy if exists personnel_update on public.personnel;
create policy personnel_update on public.personnel
  for update to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'deployment_officer'::public.app_role)
  )
  with check (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'deployment_officer'::public.app_role)
  );

-- deployments ---------------------------------------------------------------
drop policy if exists deployments_select on public.deployments;
create policy deployments_select on public.deployments
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

drop policy if exists deployments_insert on public.deployments;
create policy deployments_insert on public.deployments
  for insert to authenticated
  with check (
    public.is_admin() or public.has_role('deployment_officer'::public.app_role)
  );

drop policy if exists deployments_update on public.deployments;
create policy deployments_update on public.deployments
  for update to authenticated
  using (
    public.is_admin() or public.has_role('deployment_officer'::public.app_role)
  )
  with check (
    public.is_admin() or public.has_role('deployment_officer'::public.app_role)
  );

drop policy if exists deployment_history_select on public.deployment_history;
create policy deployment_history_select on public.deployment_history
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

-- branches ------------------------------------------------------------------
drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches
  for update to authenticated
  using (
    public.is_admin()
    or public.has_role('deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  )
  with check (
    public.is_admin()
    or public.has_role('deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  );

-- ---------------------------------------------------------------------------
-- 3. Role granting
-- ---------------------------------------------------------------------------
-- `is_admin()` now includes system_administrator, so this policy already
-- admits it. Restated here so the owner-only rule stays visible in the
-- migration history rather than being an inherited side effect.
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    -- Only an owner may mint another owner. This holds for every
    -- administrative role, including system_administrator.
    and (role <> 'owner' or public.has_role('owner'::public.app_role))
  );

-- ---------------------------------------------------------------------------
-- 4. Privileged functions
-- ---------------------------------------------------------------------------

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
  if not (public.is_admin() or public.has_role('hr_staff'::public.app_role)) then
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

grant execute on function public.promote_applicant_to_personnel(uuid, date, uuid)
  to authenticated;

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
  if not (
    public.is_admin() or public.has_role('deployment_officer'::public.app_role)
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
  if not (
    public.is_admin() or public.has_role('deployment_officer'::public.app_role)
  ) then
    raise exception 'Insufficient privileges to transfer a deployment'
      using errcode = 'insufficient_privilege';
  end if;

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

grant execute on function public.end_deployment(uuid, date, text) to authenticated;
grant execute on function public.transfer_deployment(uuid, uuid, date, public.shift_type, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------------
-- The applicant document buckets name their roles explicitly, so they need the
-- same treatment. `is_admin()` covers the administrative set.

do $$
declare
  b text;
begin
  foreach b in array array['resumes', 'government-ids', 'certificates']
  loop
    execute format($p$drop policy if exists %I on storage.objects$p$, b || '_select_staff');
    execute format(
      $p$create policy %I on storage.objects
         for select to authenticated
         using (
           bucket_id = %L
           and (
             public.is_admin()
             or public.has_role(
               'hr_staff'::public.app_role,
               'recruitment_officer'::public.app_role,
               'deployment_officer'::public.app_role
             )
           )
         )$p$,
      b || '_select_staff', b
    );

    execute format($p$drop policy if exists %I on storage.objects$p$, b || '_delete_staff');
    execute format(
      $p$create policy %I on storage.objects
         for delete to authenticated
         using (
           bucket_id = %L
           and (public.is_admin() or public.has_role('hr_staff'::public.app_role))
         )$p$,
      b || '_delete_staff', b
    );
  end loop;
end
$$;

drop policy if exists personnel_images_write on storage.objects;
create policy personnel_images_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'personnel-images'
    and (public.is_admin() or public.has_role('hr_staff'::public.app_role))
  );

drop policy if exists personnel_images_update on storage.objects;
create policy personnel_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'personnel-images'
    and (public.is_admin() or public.has_role('hr_staff'::public.app_role))
  );

-- ---------------------------------------------------------------------------
-- 6. Reference data
-- ---------------------------------------------------------------------------

update public.roles
   set description = 'Full access to the entire system, equivalent to an administrator. Cannot grant the owner role.',
       rank = 2
 where key = 'system_administrator';

insert into public.role_permissions (role_key, permission_key)
select 'system_administrator', key from public.permissions
on conflict do nothing;

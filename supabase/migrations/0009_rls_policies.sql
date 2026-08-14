-- ===========================================================================
-- 0009 — Row Level Security
-- ===========================================================================
-- Principles
--   1. RLS is enabled on EVERY table in `public`. No exceptions.
--   2. The client only ever holds the anon or authenticated key. The
--      service_role key never leaves an Edge Function.
--   3. Policies call the SECURITY DEFINER helpers from 0007 rather than
--      sub-querying user_roles inline — inline sub-queries against an
--      RLS-protected table cause infinite recursion.
--   4. `(select auth.uid())` is wrapped in a scalar sub-select so Postgres
--      evaluates it once per statement instead of once per row.
--   5. Anonymous access is exactly two things: INSERT an application, and read
--      settings flagged is_public. Everything else requires a role.
-- ===========================================================================

alter table public.profiles                 enable row level security;
alter table public.roles                    enable row level security;
alter table public.permissions              enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.user_roles               enable row level security;
alter table public.branches                 enable row level security;
alter table public.applicants               enable row level security;
alter table public.applicant_documents      enable row level security;
alter table public.applicant_status_history enable row level security;
alter table public.personnel                enable row level security;
alter table public.deployments              enable row level security;
alter table public.deployment_history       enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.activity_logs            enable row level security;
alter table public.notifications            enable row level security;
alter table public.settings                 enable row level security;
alter table public.email_logs               enable row level security;

-- Force RLS even for the table owner, so a compromised owner-role connection
-- still cannot read around the policies.
alter table public.applicants          force row level security;
alter table public.applicant_documents force row level security;
alter table public.personnel           force row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- roles / permissions / role_permissions — read-only reference data
-- ---------------------------------------------------------------------------
drop policy if exists roles_select_staff on public.roles;
create policy roles_select_staff on public.roles
  for select to authenticated using (public.is_staff());

drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists permissions_select_staff on public.permissions;
create policy permissions_select_staff on public.permissions
  for select to authenticated using (public.is_staff());

drop policy if exists permissions_admin_write on public.permissions;
create policy permissions_admin_write on public.permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists role_permissions_select_staff on public.role_permissions;
create policy role_permissions_select_staff on public.role_permissions
  for select to authenticated using (public.is_staff());

drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
-- Read your own grants (the app needs this to build the sidebar); only
-- owner/admin may grant or revoke.
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    -- Only an owner may mint another owner.
    and (role <> 'owner' or public.has_role('owner'::public.app_role))
  );

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
drop policy if exists branches_select_staff on public.branches;
create policy branches_select_staff on public.branches
  for select to authenticated using (public.is_staff());

drop policy if exists branches_insert on public.branches;
create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role
  ));

drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches
  for update to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  )
  with check (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  );

drop policy if exists branches_delete on public.branches;
create policy branches_delete on public.branches
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- applicants
-- ---------------------------------------------------------------------------
-- The public application form. Anonymous submitters may INSERT and nothing
-- else; the WITH CHECK pins the incoming row to a fresh pending application so
-- a crafted request cannot self-hire or backdate.
drop policy if exists applicants_insert_public on public.applicants;
create policy applicants_insert_public on public.applicants
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_by is null
    and rejection_reason is null
    and internal_notes is null
    and rating is null
    and interview_at is null
    and archived_at is null
  );

drop policy if exists applicants_select_staff on public.applicants;
create policy applicants_select_staff on public.applicants
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
                    'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and preferred_branch_id = public.current_user_branch_id())
  );

drop policy if exists applicants_update_staff on public.applicants;
create policy applicants_update_staff on public.applicants
  for update to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role
  ))
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role
  ));

-- Hard delete is reserved for owner/admin; the normal path is archive + the
-- scheduled retention purge, which runs as service_role and bypasses RLS.
drop policy if exists applicants_delete_admin on public.applicants;
create policy applicants_delete_admin on public.applicants
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- applicant_documents
-- ---------------------------------------------------------------------------
-- Anonymous applicants attach files during the same submission flow. They may
-- only attach to an application that is still pending — no back-filling old
-- records, and no reading anything.
drop policy if exists applicant_documents_insert on public.applicant_documents;
create policy applicant_documents_insert on public.applicant_documents
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.applicants a
      where a.id = applicant_id
        and (
          a.status = 'pending'
          or public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                             'hr_staff'::public.app_role,
                             'recruitment_officer'::public.app_role)
        )
    )
  );

drop policy if exists applicant_documents_select_staff on public.applicant_documents;
create policy applicant_documents_select_staff on public.applicant_documents
  for select to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
    'deployment_officer'::public.app_role
  ));

drop policy if exists applicant_documents_update_staff on public.applicant_documents;
create policy applicant_documents_update_staff on public.applicant_documents
  for update to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role
  ))
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role
  ));

drop policy if exists applicant_documents_delete on public.applicant_documents;
create policy applicant_documents_delete on public.applicant_documents
  for delete to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role, 'hr_staff'::public.app_role
  ));

-- ---------------------------------------------------------------------------
-- applicant_status_history — append-only, staff-readable
-- ---------------------------------------------------------------------------
drop policy if exists applicant_status_history_select on public.applicant_status_history;
create policy applicant_status_history_select on public.applicant_status_history
  for select to authenticated using (public.is_staff());

-- No INSERT/UPDATE/DELETE policies: rows are written only by the SECURITY
-- DEFINER trigger in 0007.

-- ---------------------------------------------------------------------------
-- personnel
-- ---------------------------------------------------------------------------
drop policy if exists personnel_select on public.personnel;
create policy personnel_select on public.personnel
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
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
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role, 'hr_staff'::public.app_role
  ));

drop policy if exists personnel_update on public.personnel;
create policy personnel_update on public.personnel
  for update to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role
  ))
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role
  ));

drop policy if exists personnel_delete on public.personnel;
create policy personnel_delete on public.personnel
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- deployments
-- ---------------------------------------------------------------------------
drop policy if exists deployments_select on public.deployments;
create policy deployments_select on public.deployments
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

drop policy if exists deployments_insert on public.deployments;
create policy deployments_insert on public.deployments
  for insert to authenticated
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'deployment_officer'::public.app_role
  ));

drop policy if exists deployments_update on public.deployments;
create policy deployments_update on public.deployments
  for update to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'deployment_officer'::public.app_role
  ))
  with check (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'deployment_officer'::public.app_role
  ));

drop policy if exists deployments_delete on public.deployments;
create policy deployments_delete on public.deployments
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- deployment_history — append-only, written by trigger
-- ---------------------------------------------------------------------------
drop policy if exists deployment_history_select on public.deployment_history;
create policy deployment_history_select on public.deployment_history
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

-- ---------------------------------------------------------------------------
-- audit_logs — read-only for owner/admin, immutable for everyone
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

-- Deliberately no INSERT/UPDATE/DELETE policy. The audit trigger is SECURITY
-- DEFINER and therefore writes as the table owner, bypassing RLS; no client
-- can forge or erase an audit row.

-- ---------------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------------
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated using (public.is_staff());

drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs
  for insert to authenticated
  with check (public.is_staff() and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- notifications — strictly per-user
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
drop policy if exists settings_select_public on public.settings;
create policy settings_select_public on public.settings
  for select to anon using (is_public);

drop policy if exists settings_select_staff on public.settings;
create policy settings_select_staff on public.settings
  for select to authenticated using (is_public or public.is_staff());

drop policy if exists settings_write_admin on public.settings;
create policy settings_write_admin on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- email_logs — observability for admins only
-- ---------------------------------------------------------------------------
drop policy if exists email_logs_select_admin on public.email_logs;
create policy email_logs_select_admin on public.email_logs
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Table-level grants
-- ---------------------------------------------------------------------------
-- RLS filters rows; GRANT decides whether the role may attempt the verb at
-- all. Both are required — a missing GRANT is a second, coarser safety net.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;

revoke all on all tables in schema public from anon;
grant insert on public.applicants to anon;
grant insert on public.applicant_documents to anon;
grant select on public.settings to anon;

grant usage, select on all sequences in schema public to authenticated;
grant usage, select on public.applicant_reference_seq to anon;

-- Views inherit base-table RLS via security_invoker.
grant select on
  public.v_applicant_summary,
  public.v_active_deployments,
  public.v_branch_staffing,
  public.v_personnel_roster
to authenticated;

grant select on public.mv_recruitment_funnel to authenticated;

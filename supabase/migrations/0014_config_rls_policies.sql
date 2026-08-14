-- ===========================================================================
-- 0014 — RLS for configuration data, and the System Administrator role
-- ===========================================================================
-- Two jobs:
--   1. Protect the new `positions`, `ranks` and `position_ranks` tables.
--   2. Widen the existing policies so `system_administrator` can read
--      operational data and write configuration data.
--
-- The role deliberately CANNOT grant roles or move applicants through the
-- pipeline. "Configures the system" and "runs recruitment" are different jobs,
-- and an account that does both is an account whose compromise does both.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: may this caller change configuration?
-- ---------------------------------------------------------------------------
create or replace function public.is_config_admin()
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

comment on function public.is_config_admin is
  'True for roles allowed to edit reference and configuration data: owner, admin, system_administrator.';

-- ---------------------------------------------------------------------------
-- positions / ranks / position_ranks
-- ---------------------------------------------------------------------------
alter table public.positions      enable row level security;
alter table public.ranks          enable row level security;
alter table public.position_ranks enable row level security;

-- The public application form needs the list of open positions, so anonymous
-- visitors may read active + public rows. Nothing here is sensitive: it is the
-- same information printed on a recruitment poster.
drop policy if exists positions_select_public on public.positions;
create policy positions_select_public on public.positions
  for select to anon
  using (is_active and is_public);

drop policy if exists positions_select_staff on public.positions;
create policy positions_select_staff on public.positions
  for select to authenticated
  using ((is_active and is_public) or public.is_staff());

drop policy if exists positions_write_config on public.positions;
create policy positions_write_config on public.positions
  for all to authenticated
  using (public.is_config_admin())
  with check (public.is_config_admin());

drop policy if exists ranks_select_staff on public.ranks;
create policy ranks_select_staff on public.ranks
  for select to authenticated
  using (public.is_staff());

drop policy if exists ranks_write_config on public.ranks;
create policy ranks_write_config on public.ranks
  for all to authenticated
  using (public.is_config_admin())
  with check (public.is_config_admin());

drop policy if exists position_ranks_select_staff on public.position_ranks;
create policy position_ranks_select_staff on public.position_ranks
  for select to authenticated
  using (public.is_staff());

drop policy if exists position_ranks_write_config on public.position_ranks;
create policy position_ranks_write_config on public.position_ranks
  for all to authenticated
  using (public.is_config_admin())
  with check (public.is_config_admin());

grant select on public.positions to anon;
grant select, insert, update, delete
  on public.positions, public.ranks, public.position_ranks to authenticated;

-- ---------------------------------------------------------------------------
-- Widen existing policies for system_administrator
-- ---------------------------------------------------------------------------
-- Read access to operational data: an administrator diagnosing a configuration
-- problem needs to see the records that configuration produced.

drop policy if exists applicants_select_staff on public.applicants;
create policy applicants_select_staff on public.applicants
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'system_administrator'::public.app_role,
                    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
                    'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and preferred_branch_id = public.current_user_branch_id())
  );

drop policy if exists applicant_documents_select_staff on public.applicant_documents;
create policy applicant_documents_select_staff on public.applicant_documents
  for select to authenticated
  using (public.has_role(
    'owner'::public.app_role, 'admin'::public.app_role,
    'system_administrator'::public.app_role,
    'hr_staff'::public.app_role, 'recruitment_officer'::public.app_role,
    'deployment_officer'::public.app_role
  ));

drop policy if exists personnel_select on public.personnel;
create policy personnel_select on public.personnel
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'system_administrator'::public.app_role,
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

drop policy if exists deployments_select on public.deployments;
create policy deployments_select on public.deployments
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'system_administrator'::public.app_role,
                    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

drop policy if exists deployment_history_select on public.deployment_history;
create policy deployment_history_select on public.deployment_history
  for select to authenticated
  using (
    public.has_role('owner'::public.app_role, 'admin'::public.app_role,
                    'system_administrator'::public.app_role,
                    'hr_staff'::public.app_role, 'deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and branch_id = public.current_user_branch_id())
  );

-- Configuration data: full write.

drop policy if exists branches_insert on public.branches;
create policy branches_insert on public.branches
  for insert to authenticated
  with check (public.is_config_admin());

drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches
  for update to authenticated
  using (
    public.is_config_admin()
    or public.has_role('deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  )
  with check (
    public.is_config_admin()
    or public.has_role('deployment_officer'::public.app_role)
    or (public.has_role('branch_coordinator'::public.app_role)
        and id = public.current_user_branch_id())
  );

drop policy if exists branches_delete on public.branches;
create policy branches_delete on public.branches
  for delete to authenticated using (public.is_config_admin());

drop policy if exists settings_write_admin on public.settings;
create policy settings_write_admin on public.settings
  for all to authenticated
  using (public.is_config_admin()) with check (public.is_config_admin());

drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles
  for all to authenticated
  using (public.is_config_admin()) with check (public.is_config_admin());

drop policy if exists permissions_admin_write on public.permissions;
create policy permissions_admin_write on public.permissions
  for all to authenticated
  using (public.is_config_admin()) with check (public.is_config_admin());

drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions
  for all to authenticated
  using (public.is_config_admin()) with check (public.is_config_admin());

-- Oversight: the audit trail and mail log.

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_config_admin());

drop policy if exists email_logs_select_admin on public.email_logs;
create policy email_logs_select_admin on public.email_logs
  for select to authenticated using (public.is_config_admin());

-- NOTE: `user_roles_admin_write` is deliberately NOT widened. Granting roles
-- stays with owner and admin — a configuration role that can also mint an
-- owner is not a limited role at all.

-- ---------------------------------------------------------------------------
-- Reference data for the new role
-- ---------------------------------------------------------------------------

insert into public.roles (key, label, description, rank, is_assignable) values
  ('system_administrator', 'System Administrator',
   'Configures the system: positions, ranks, branches, settings and reference data. Read-only on recruitment and deployment records.',
   2, true)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    rank = excluded.rank;

insert into public.permissions (key, resource, action, description) values
  ('config.read',      'config', 'read',   'View system configuration data'),
  ('config.update',    'config', 'update', 'Change system configuration data'),
  ('positions.read',   'positions', 'read',   'View positions'),
  ('positions.create', 'positions', 'create', 'Create positions'),
  ('positions.update', 'positions', 'update', 'Edit positions'),
  ('positions.delete', 'positions', 'delete', 'Delete positions'),
  ('ranks.read',       'ranks', 'read',   'View ranks'),
  ('ranks.create',     'ranks', 'create', 'Create ranks'),
  ('ranks.update',     'ranks', 'update', 'Edit ranks'),
  ('ranks.delete',     'ranks', 'delete', 'Delete ranks')
on conflict (key) do update set description = excluded.description;

-- Owner and admin keep everything.
insert into public.role_permissions (role_key, permission_key)
select 'owner', key from public.permissions on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'admin', key from public.permissions on conflict do nothing;

-- System administrator: all configuration, read-only elsewhere.
insert into public.role_permissions (role_key, permission_key)
select 'system_administrator', key from public.permissions where key in (
  'config.read','config.update',
  'positions.read','positions.create','positions.update','positions.delete',
  'ranks.read','ranks.create','ranks.update','ranks.delete',
  'branches.read','branches.create','branches.update','branches.delete',
  'settings.read','settings.update',
  'applicants.read','personnel.read','deployments.read',
  'reports.read','audit.read','users.read'
) on conflict do nothing;

-- Everyone else can at least read the reference data they select from.
insert into public.role_permissions (role_key, permission_key)
select r.key, p.key
from public.roles r
cross join public.permissions p
where r.key in ('hr_staff','recruitment_officer','deployment_officer','branch_coordinator')
  and p.key in ('positions.read','ranks.read','config.read')
on conflict do nothing;

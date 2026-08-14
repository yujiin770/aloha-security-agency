-- ===========================================================================
-- 0020 — Roles become creatable; permissions become page access
-- ===========================================================================
-- Two problems, one shape.
--
-- 1. Roles could not be created from the UI, because `roles.key` and
--    `user_roles.role` are the `app_role` enum and every RLS policy in the
--    database keys off that enum. Adding a role meant a migration.
--
-- 2. The `permissions` table held ~36 granular `resource.action` rows that
--    nothing — not the app, not a single RLS policy — ever read to make an
--    authorization decision. The Roles screen said so itself. Ticking a box
--    changed a row and nothing else.
--
-- What this migration does:
--
--   Role keys become `text`, so a role is just a row. The `app_role` enum
--   stays in place: ~75 policies across 0009/0014/0015 are written as
--   `has_role('admin'::public.app_role, …)` and those literals must keep
--   parsing.
--
--   Each role declares `inherits_from` — the built-in role whose *database*
--   privileges it carries. `has_role()` keeps its exact signature and resolves
--   through that column, so every existing policy widens to cover custom roles
--   without a single one being rewritten. This is the deliberate choice: those
--   policies encode branch scoping, the owner-minting invariant and per-column
--   write rules that a flat page permission cannot express, and rewriting all
--   of them to read `role_permissions` would lose that nuance in exchange for
--   uniformity nobody asked for.
--
--   `permissions` is reseeded as one row per page of the admin app. That is
--   the thing an administrator actually wants to decide — "this role sees
--   Applicants and Personnel" — and it is now genuinely enforced: the sidebar
--   and the route guards read it live.
--
-- The split to keep in mind: page permissions govern navigation, RLS governs
-- data. Hiding a page does not hide the rows behind it, and it was never
-- supposed to.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop what depends on the enum-typed columns
-- ---------------------------------------------------------------------------
-- Only policies that reference `user_roles.role` *as a column* block the type
-- change. Policies elsewhere call has_role()/is_admin(), whose SQL bodies are
-- stored as text and carry no column dependency, so they are untouched.
drop policy if exists user_roles_admin_write on public.user_roles;
drop policy if exists user_roles_select on public.user_roles;

alter table public.role_permissions
  drop constraint if exists role_permissions_role_key_fkey;

-- ---------------------------------------------------------------------------
-- 2. Text keys
-- ---------------------------------------------------------------------------
alter table public.roles
  alter column key type text using key::text;

alter table public.user_roles
  alter column role type text using role::text;

alter table public.role_permissions
  alter column role_key type text using role_key::text;

alter table public.role_permissions
  add constraint role_permissions_role_key_fkey
  foreign key (role_key) references public.roles (key) on delete cascade;

-- The seven built-ins have to exist as rows from here on, because the foreign
-- key below makes `roles` the source of truth for what can be granted. They
-- were previously created only by seed.sql, which `supabase db push` does not
-- run — so a hosted project had an empty `roles` table, and adding the key
-- would either fail against existing grants or leave nobody able to grant
-- anything, bootstrapping the first owner included.
--
-- `do nothing` on conflict: an operator may have edited a label or a rank, and
-- that is theirs to keep. The two columns this migration owns are set below.
insert into public.roles (key, label, description, rank, is_assignable) values
  ('owner', 'Owner',
   'Full control of the system, including ownership transfer and permanent deletion.', 1, true),
  ('admin', 'Administrator',
   'Full operational control: users, settings, branches, recruitment and deployment.', 2, true),
  ('system_administrator', 'System Administrator',
   'Full access to the entire system, equivalent to an administrator. Cannot grant the owner role.', 2, true),
  ('hr_staff', 'HR Staff',
   'Manages applicants end to end, onboards hires and maintains the personnel roster.', 3, true),
  ('recruitment_officer', 'Recruitment Officer',
   'Screens and interviews applicants and moves them through the pipeline.', 4, true),
  ('deployment_officer', 'Deployment Officer',
   'Assigns personnel to posts, manages shifts, transfers and end of duty.', 4, true),
  ('branch_coordinator', 'Branch Coordinator',
   'Read-only view of their own branch: roster, deployments and staffing.', 5, true)
on conflict (key) do nothing;

-- A role must exist before it can be granted. This was implied by the enum and
-- is now an explicit constraint rather than a lost one.
alter table public.user_roles
  drop constraint if exists user_roles_role_fkey;
alter table public.user_roles
  add constraint user_roles_role_fkey
  foreign key (role) references public.roles (key) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Inheritance and system flags
-- ---------------------------------------------------------------------------
alter table public.roles
  add column if not exists inherits_from public.app_role,
  add column if not exists is_system boolean not null default false;

update public.roles
   set inherits_from = key::public.app_role,
       is_system     = true
 where key in (
   'owner', 'admin', 'system_administrator',
   'hr_staff', 'recruitment_officer', 'deployment_officer', 'branch_coordinator'
 );

alter table public.roles
  drop constraint if exists roles_inherits_chk;
alter table public.roles
  add constraint roles_inherits_chk
  check (is_system or inherits_from is not null);

comment on column public.roles.inherits_from is
  'The built-in role whose RLS privileges this role carries. Page access is configured separately via role_permissions; this column decides what the database will actually return.';
comment on column public.roles.is_system is
  'True for the seven roles that back the app_role enum. They cannot be deleted, and their key and inheritance are fixed.';

-- ---------------------------------------------------------------------------
-- 4. has_role() resolves through inheritance
-- ---------------------------------------------------------------------------
-- Same signature as 0007's, so no policy has to be dropped and recreated. The
-- coalesce covers a grant whose role row is somehow missing an inheritance:
-- fall back to the key itself, which is correct for the seven built-ins.
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
    join public.roles r on r.key = ur.role
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.is_active
      and coalesce(
        r.inherits_from,
        case when ur.role = any (
          array['owner','admin','system_administrator','hr_staff',
                'recruitment_officer','deployment_officer','branch_coordinator']
        ) then ur.role::public.app_role end
      ) = any (roles)
  );
$$;

comment on function public.has_role(variadic public.app_role[]) is
  'True when the signed-in user holds any of the given built-in roles, directly or through a custom role that inherits from one. Signature unchanged from 0007 so every existing policy widens automatically (0020).';

-- ---------------------------------------------------------------------------
-- 5. has_permission() — the page-access predicate
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(p_key text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and p.is_active
      and rp.permission_key = p_key
  );
$$;

comment on function public.has_permission(text) is
  'True when any role held by the signed-in user grants the given permission key. Drives page access; data access remains governed by RLS.';

grant execute on function public.has_permission(text) to authenticated;

-- Lets the client fetch its own effective page permissions in one round trip
-- rather than joining two tables it can only partly read.
create or replace function public.my_permissions()
returns setof text
language sql
security definer
stable
set search_path = ''
as $$
  select distinct rp.permission_key
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role
   where ur.user_id = (select auth.uid());
$$;

comment on function public.my_permissions is
  'Every permission key granted to the signed-in user, across all their roles.';

grant execute on function public.my_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Recreate the user_roles policies
-- ---------------------------------------------------------------------------
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    -- Only an owner may mint another owner — including through a custom role
    -- that inherits owner, which is why this tests the inheritance and not
    -- just the literal key.
    and (
      not exists (
        select 1 from public.roles r
        where r.key = user_roles.role
          and coalesce(r.inherits_from::text, r.key) = 'owner'
      )
      or public.has_role('owner'::public.app_role)
    )
    -- A role marked unassignable is not grantable from the UI or the API.
    and exists (
      select 1 from public.roles r
      where r.key = user_roles.role and r.is_assignable
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Roles are creatable and deletable, except the built-ins
-- ---------------------------------------------------------------------------
drop policy if exists roles_admin_write on public.roles;

create policy roles_admin_insert on public.roles
  for insert to authenticated
  with check (public.is_config_admin() and not is_system);

create policy roles_admin_update on public.roles
  for update to authenticated
  using (public.is_config_admin())
  with check (public.is_config_admin());

create policy roles_admin_delete on public.roles
  for delete to authenticated
  using (public.is_config_admin() and not is_system);

-- The FK from user_roles is `on delete restrict`, so a role still held by
-- someone cannot be deleted — the database refuses rather than silently
-- stripping a user's access.

-- ---------------------------------------------------------------------------
-- 8. Permissions become pages
-- ---------------------------------------------------------------------------
-- The old action rows are removed rather than kept alongside: they were never
-- read, and leaving two vocabularies in one table is how the next person comes
-- to believe the wrong one is load-bearing. `role_permissions` cascades.
delete from public.permissions where resource <> 'pages';

insert into public.permissions (key, resource, action, description) values
  ('pages.dashboard',  'pages', 'dashboard',  'Dashboard — agency-wide overview'),
  ('pages.applicants', 'pages', 'applicants', 'Applicants — recruitment pipeline'),
  ('pages.personnel',  'pages', 'personnel',  'Personnel Roster — employed guards'),
  ('pages.facilities', 'pages', 'facilities', 'Facilities — client sites and headcount'),
  ('pages.deployments','pages', 'deployments','Deployments — postings and transfers'),
  ('pages.reports',    'pages', 'reports',    'Reports — analytics and exports'),
  ('pages.audit',      'pages', 'audit',      'Audit Logs — record of every change'),
  ('pages.users',      'pages', 'users',      'Users — staff accounts and role grants'),
  ('pages.content',    'pages', 'content',    'Website Content — public site CMS'),
  ('pages.config',     'pages', 'config',     'Data Configuration — positions, ranks, roles'),
  ('pages.settings',   'pages', 'settings',   'Settings — own profile and preferences')
on conflict (key) do update
  set resource = excluded.resource,
      action = excluded.action,
      description = excluded.description;

-- Grants reproduce exactly the role lists the sidebar hard-coded, so nobody's
-- access changes on the day this ships.
insert into public.role_permissions (role_key, permission_key)
select r.key, p.key
  from public.roles r
 cross join public.permissions p
 where p.resource = 'pages'
   and (
     -- Everyone gets their own dashboard and settings. Revoking these would
     -- leave a signed-in user with nowhere to land.
     p.key in ('pages.dashboard', 'pages.settings')

     -- Read-anywhere pages, matching Sidebar's `ALL` list.
     or (p.key in ('pages.applicants', 'pages.personnel', 'pages.facilities', 'pages.reports'))

     -- Operations.
     or (p.key = 'pages.deployments' and r.key in (
           'owner', 'admin', 'system_administrator',
           'hr_staff', 'deployment_officer', 'branch_coordinator'))

     -- Administration.
     or (p.key in ('pages.audit', 'pages.users', 'pages.content', 'pages.config')
         and r.key in ('owner', 'admin', 'system_administrator'))
   )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. Page permissions are readable by their holder
-- ---------------------------------------------------------------------------
-- `role_permissions_select_staff` (0009) already allows any staff member to
-- read the whole matrix, which is what the Roles screen needs. Restated here
-- so the read path for the sidebar is visible in one place.
drop policy if exists role_permissions_select_staff on public.role_permissions;
create policy role_permissions_select_staff on public.role_permissions
  for select to authenticated using (public.is_staff());

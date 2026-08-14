-- ===========================================================================
-- Bootstrap the first owner account
-- ===========================================================================
-- Chicken-and-egg: only an owner/admin can grant roles, but a fresh database
-- has neither. Run this ONCE, in the Supabase SQL editor, after creating the
-- first user through Dashboard -> Authentication -> Users -> Add user.
--
-- The SQL editor runs as a superuser, so it bypasses RLS — which is exactly why
-- this file is not a migration and is never callable from the application.
-- ===========================================================================

-- 1. Edit the email on the marked line below to match the account you created.
do $$
declare
  v_user_id uuid;
  v_email   text := 'owner@alohasecurity.ph';  -- <<< EDIT ME
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);

  if v_user_id is null then
    raise exception
      'No auth user with email %. Create it first: Dashboard -> Authentication -> Users.', v_email;
  end if;

  -- handle_new_user() should already have made the profile; be defensive.
  insert into public.profiles (id, email, full_name, is_active)
  values (v_user_id, v_email, 'System Owner', true)
  on conflict (id) do update set is_active = true;

  -- Since 0020, `user_roles.role` is a foreign key into `roles`, so the role
  -- has to exist as a row before it can be granted. Migration 0020 creates the
  -- seven built-ins, but a project that ran `db push` before that migration
  -- landed — or one where the seed was never applied — may still have none.
  -- Creating just the owner row here keeps this script able to do its job on a
  -- bare database, which is the entire point of it.
  insert into public.roles (key, label, description, rank, is_assignable, inherits_from, is_system)
  values (
    'owner', 'Owner',
    'Full control of the system, including ownership transfer and permanent deletion.',
    1, true, 'owner', true
  )
  on conflict (key) do update set is_system = true, inherits_from = 'owner';

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'owner')
  on conflict (user_id, role) do nothing;

  -- Without at least these two pages the owner signs in to an empty sidebar.
  insert into public.permissions (key, resource, action, description) values
    ('pages.dashboard', 'pages', 'dashboard', 'Dashboard — agency-wide overview'),
    ('pages.settings',  'pages', 'settings',  'Settings — own profile and preferences')
  on conflict (key) do nothing;

  insert into public.role_permissions (role_key, permission_key)
  select 'owner', key from public.permissions where resource = 'pages'
  on conflict do nothing;

  raise notice 'Owner role granted to % (%)', v_email, v_user_id;
end
$$;

-- 2. Verify.
select p.email, p.full_name, array_agg(ur.role) as roles
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
group by p.email, p.full_name;

-- 3. Confirm the reference data is present. If `roles` shows fewer than 7 or
--    `page_permissions` fewer than 11, the seed has not been applied — run
--    `supabase/seed/seed.sql` in this editor. Everything except the owner will
--    otherwise be missing, and the Roles screen will look half-built.
select
  (select count(*) from public.roles)                               as roles,
  (select count(*) from public.permissions where resource = 'pages') as page_permissions,
  (select count(*) from public.role_permissions)                     as grants;

-- ===========================================================================
-- 0002 — Identity: profiles, roles, permissions
-- ===========================================================================
-- Supabase Auth owns `auth.users`. We never write to it directly from the
-- client; `public.profiles` is the application-facing mirror, created by a
-- trigger on signup. Roles live in a separate `user_roles` table rather than a
-- column on `profiles` so that a user can hold several roles and so that RLS
-- helper functions can read roles without recursing into `profiles` policies.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  first_name    text,
  last_name     text,
  phone         text,
  avatar_path   text,
  job_title     text,
  branch_id     uuid,                       -- FK added in 0003 (branches)
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_email_format_chk
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint profiles_phone_format_chk
    check (phone is null or phone ~ '^[0-9+()\s-]{7,20}$')
);

create index if not exists profiles_branch_id_idx on public.profiles (branch_id);
create index if not exists profiles_is_active_idx on public.profiles (is_active);
create index if not exists profiles_email_idx on public.profiles (lower(email));

comment on table public.profiles is
  'Application-facing user record, 1:1 with auth.users. Created by trigger on signup.';

-- --------------------------------------------------------------------------
-- roles / permissions / role_permissions
-- --------------------------------------------------------------------------
-- `roles` is a lookup table describing each app_role for the UI (labels,
-- ordering, descriptions). RLS itself keys off the enum, not this table.
create table if not exists public.roles (
  key          public.app_role primary key,
  label        text not null,
  description  text not null default '',
  rank         smallint not null,            -- 1 = highest authority
  is_assignable boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on column public.roles.rank is
  'Lower rank = more authority. A user may only assign roles of a strictly higher rank than their own.';

create table if not exists public.permissions (
  key          text primary key,             -- e.g. 'applicants.update'
  resource     text not null,
  action       text not null,
  description  text not null default '',
  created_at   timestamptz not null default now(),

  constraint permissions_key_shape_chk check (key = resource || '.' || action)
);

create table if not exists public.role_permissions (
  role_key       public.app_role not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create index if not exists role_permissions_permission_key_idx
  on public.role_permissions (permission_key);

-- --------------------------------------------------------------------------
-- user_roles
-- --------------------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),

  constraint user_roles_unique unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_role_idx on public.user_roles (role);

comment on table public.user_roles is
  'Role grants. Read by SECURITY DEFINER helpers in 0007; never queried directly from RLS predicates on other tables.';

-- --------------------------------------------------------------------------
-- Signup trigger — mirror auth.users into public.profiles
-- --------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do nothing;

  -- A role is never self-granted at signup. An owner/admin assigns one, or the
  -- admin-create-user Edge Function does it with the service-role key.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in sync when a user changes it through Supabase Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

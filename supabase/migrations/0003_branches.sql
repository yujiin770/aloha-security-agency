-- ===========================================================================
-- 0003 — Branches (client posts / detachments)
-- ===========================================================================
-- A "branch" is an operational post where personnel are deployed: a client
-- site, mall, subdivision, bank branch or office. `required_headcount` drives
-- the staffing gap reporting in v_branch_staffing (0008).
-- ===========================================================================

create table if not exists public.branches (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  name                text not null,
  description         text,

  -- Philippine address structure
  address_line        text,
  barangay            text,
  city_municipality   text not null,
  province            text,
  region              text,
  postal_code         text,

  contact_person      text,
  contact_phone       text,
  contact_email       text,

  coordinator_id      uuid references public.profiles (id) on delete set null,
  required_headcount  integer not null default 0,
  is_active           boolean not null default true,

  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint branches_code_unique unique (code),
  constraint branches_code_shape_chk check (code ~ '^[A-Z0-9-]{2,20}$'),
  constraint branches_headcount_chk check (required_headcount >= 0),
  constraint branches_contact_email_chk
    check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists branches_coordinator_id_idx on public.branches (coordinator_id);
create index if not exists branches_is_active_idx on public.branches (is_active);
create index if not exists branches_city_idx on public.branches (city_municipality);
create index if not exists branches_name_trgm_idx
  on public.branches using gin (name extensions.gin_trgm_ops);

comment on table public.branches is
  'Operational posts / detachments where personnel are deployed.';

-- Deferred FK from 0002: a profile belongs to a branch.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_branch_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_branch_id_fkey
      foreign key (branch_id) references public.branches (id) on delete set null;
  end if;
end
$$;

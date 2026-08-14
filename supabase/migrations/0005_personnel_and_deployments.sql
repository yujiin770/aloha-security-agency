-- ===========================================================================
-- 0005 — Personnel roster and deployments
-- ===========================================================================
-- A `personnel` row is created from a hired applicant by
-- promote_applicant_to_personnel() (0007). Deployments assign personnel to a
-- branch for a period; an exclusion constraint guarantees a guard is never
-- double-booked on overlapping active assignments.
-- ===========================================================================

create extension if not exists btree_gist with schema extensions;

create sequence if not exists public.personnel_employee_seq;

create table if not exists public.personnel (
  id                 uuid primary key default gen_random_uuid(),
  employee_no        text not null,
  applicant_id       uuid references public.applicants (id) on delete set null,
  profile_id         uuid references public.profiles (id) on delete set null,

  first_name         text not null,
  middle_name        text,
  last_name          text not null,
  suffix             text,
  email              text,
  phone              text,
  birth_date         date,
  sex                public.sex_type,

  position           public.position_type not null,
  rank_title         text,
  date_hired         date not null default current_date,
  date_separated     date,
  employment_status  public.employment_status not null default 'active',

  photo_path         text,
  emergency_contact_name  text,
  emergency_contact_phone text,

  sss_no             text,
  philhealth_no      text,
  pagibig_no         text,
  tin_no             text,
  security_license_no text,
  security_license_expiry date,

  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint personnel_employee_no_unique unique (employee_no),
  constraint personnel_applicant_unique unique (applicant_id),
  constraint personnel_separation_chk
    check (date_separated is null or date_separated >= date_hired),
  -- A separated employee must not be left flagged active.
  constraint personnel_status_consistency_chk
    check (
      (employment_status in ('resigned', 'terminated')) = (date_separated is not null)
    )
);

create index if not exists personnel_status_idx on public.personnel (employment_status);
create index if not exists personnel_position_idx on public.personnel (position);
create index if not exists personnel_applicant_idx on public.personnel (applicant_id);
create index if not exists personnel_license_expiry_idx
  on public.personnel (security_license_expiry)
  where employment_status = 'active';
create index if not exists personnel_name_trgm_idx
  on public.personnel using gin (
    ((first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name))
    extensions.gin_trgm_ops
  );

comment on table public.personnel is
  'Employed security personnel. Created from a hired applicant via promote_applicant_to_personnel().';

-- --------------------------------------------------------------------------
-- deployments
-- --------------------------------------------------------------------------
create table if not exists public.deployments (
  id              uuid primary key default gen_random_uuid(),
  personnel_id    uuid not null references public.personnel (id) on delete cascade,
  branch_id       uuid not null references public.branches (id) on delete restrict,

  shift           public.shift_type not null default 'day',
  post_assignment text,
  start_date      date not null,
  end_date        date,
  status          public.deployment_status not null default 'active',

  daily_rate      numeric(10, 2),
  remarks         text,
  ended_reason    text,

  assigned_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint deployments_date_order_chk
    check (end_date is null or end_date >= start_date),
  constraint deployments_rate_chk
    check (daily_rate is null or daily_rate >= 0),
  -- A closed deployment must have an end date; an open one must not.
  constraint deployments_closure_chk
    check (
      (status in ('ended', 'transferred', 'cancelled')) = (end_date is not null)
    ),

  -- One guard cannot hold two live assignments over the same dates. `daterange`
  -- with an unbounded upper end models an open-ended deployment correctly.
  constraint deployments_no_overlap
    exclude using gist (
      personnel_id with =,
      daterange(start_date, end_date, '[]') with &&
    ) where (status in ('pending', 'active'))
);

create index if not exists deployments_personnel_idx on public.deployments (personnel_id);
create index if not exists deployments_branch_idx on public.deployments (branch_id);
create index if not exists deployments_status_idx on public.deployments (status);
create index if not exists deployments_branch_status_idx
  on public.deployments (branch_id, status);
create index if not exists deployments_start_date_idx on public.deployments (start_date desc);

comment on constraint deployments_no_overlap on public.deployments is
  'Prevents double-booking: a guard may hold only one pending/active deployment per date range.';

-- --------------------------------------------------------------------------
-- deployment_history — append-only movement log
-- --------------------------------------------------------------------------
create table if not exists public.deployment_history (
  id             uuid primary key default gen_random_uuid(),
  deployment_id  uuid not null references public.deployments (id) on delete cascade,
  personnel_id   uuid not null references public.personnel (id) on delete cascade,
  branch_id      uuid references public.branches (id) on delete set null,
  from_status    public.deployment_status,
  to_status      public.deployment_status not null,
  changed_by     uuid references public.profiles (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists deployment_history_deployment_idx
  on public.deployment_history (deployment_id, created_at desc);
create index if not exists deployment_history_personnel_idx
  on public.deployment_history (personnel_id, created_at desc);

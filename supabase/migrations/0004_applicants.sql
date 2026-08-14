-- ===========================================================================
-- 0004 — Recruitment: applicants, documents, status history
-- ===========================================================================
-- `applicants` is the only table the anonymous role may INSERT into (see 0009).
-- It is never SELECT-able anonymously; the public status checker goes through
-- the check_application_status() RPC, which returns a narrow, PII-free row.
-- ===========================================================================

create sequence if not exists public.applicant_reference_seq;

create table if not exists public.applicants (
  id                     uuid primary key default gen_random_uuid(),
  reference_no           text not null,

  -- Identity ------------------------------------------------------------
  first_name             text not null,
  middle_name            text,
  last_name              text not null,
  suffix                 text,
  email                  text not null,
  phone                  text not null,
  birth_date             date not null,
  sex                    public.sex_type not null,
  civil_status           public.civil_status,
  height_cm              numeric(5, 2),
  weight_kg              numeric(5, 2),

  -- Address -------------------------------------------------------------
  address_line           text,
  barangay               text,
  city_municipality      text,
  province               text,
  region                 text,
  postal_code            text,

  -- Application ---------------------------------------------------------
  position_applied       public.position_type not null,
  preferred_branch_id    uuid references public.branches (id) on delete set null,
  years_experience       smallint not null default 0,
  highest_education      text,
  expected_salary        numeric(10, 2),
  availability_date      date,
  source                 text,             -- how they heard about us

  -- Philippine statutory identifiers (nullable: collected progressively) --
  sss_no                 text,
  philhealth_no          text,
  pagibig_no             text,
  tin_no                 text,

  -- Security-industry credentials ---------------------------------------
  nbi_clearance_no       text,
  nbi_clearance_expiry   date,
  police_clearance_no    text,
  security_license_no    text,             -- LESP / SOSIA licence
  security_license_expiry date,
  is_licensed            boolean not null default false,

  -- Pipeline ------------------------------------------------------------
  status                 public.applicant_status not null default 'pending',
  status_changed_at      timestamptz not null default now(),
  reviewed_by            uuid references public.profiles (id) on delete set null,
  interview_at           timestamptz,
  interview_notes        text,
  rating                 smallint,
  rejection_reason       text,
  internal_notes         text,

  -- Retention -----------------------------------------------------------
  archived_at            timestamptz,
  purge_after            date,             -- set by trigger from settings

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint applicants_reference_no_unique unique (reference_no),
  constraint applicants_email_format_chk
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint applicants_phone_format_chk
    check (phone ~ '^[0-9+()\s-]{7,20}$'),
  -- Philippine law: private security personnel must be at least 18.
  constraint applicants_age_chk
    check (birth_date <= (current_date - interval '18 years')),
  constraint applicants_birth_date_sane_chk
    check (birth_date > (current_date - interval '70 years')),
  constraint applicants_experience_chk
    check (years_experience between 0 and 60),
  constraint applicants_rating_chk
    check (rating is null or rating between 1 and 5),
  constraint applicants_height_chk
    check (height_cm is null or height_cm between 100 and 250),
  constraint applicants_weight_chk
    check (weight_kg is null or weight_kg between 30 and 250),
  -- A rejection must always carry a reason; enforced in the DB, not just the UI.
  constraint applicants_rejection_reason_chk
    check (status <> 'rejected' or rejection_reason is not null)
);

create index if not exists applicants_status_idx on public.applicants (status);
create index if not exists applicants_position_idx on public.applicants (position_applied);
create index if not exists applicants_preferred_branch_idx on public.applicants (preferred_branch_id);
create index if not exists applicants_reviewed_by_idx on public.applicants (reviewed_by);
create index if not exists applicants_created_at_idx on public.applicants (created_at desc);
create index if not exists applicants_status_created_idx
  on public.applicants (status, created_at desc);
create index if not exists applicants_reference_no_idx on public.applicants (upper(reference_no));
create index if not exists applicants_purge_after_idx
  on public.applicants (purge_after) where archived_at is not null;

-- Fuzzy name search backing the admin applicant table's search box.
create index if not exists applicants_name_trgm_idx
  on public.applicants using gin (
    ((first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name))
    extensions.gin_trgm_ops
  );

comment on table public.applicants is
  'Recruitment pipeline records. Anonymous INSERT only; reads are staff-only or via check_application_status().';

-- --------------------------------------------------------------------------
-- applicant_documents
-- --------------------------------------------------------------------------
-- `storage_path` is `{bucket}` + object key. Files live in private buckets and
-- are only ever served through short-lived signed URLs (see 0010).
create table if not exists public.applicant_documents (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.applicants (id) on delete cascade,
  document_type public.document_type not null,
  bucket_id     text not null,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  verified_by   uuid references public.profiles (id) on delete set null,
  verified_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint applicant_documents_path_unique unique (bucket_id, storage_path),
  constraint applicant_documents_size_chk
    check (size_bytes is null or size_bytes between 1 and 10485760)  -- 10 MB
);

create index if not exists applicant_documents_applicant_idx
  on public.applicant_documents (applicant_id);
create index if not exists applicant_documents_type_idx
  on public.applicant_documents (document_type);

-- --------------------------------------------------------------------------
-- applicant_status_history
-- --------------------------------------------------------------------------
-- Append-only audit of pipeline movement; also powers the public status
-- timeline (filtered down to non-sensitive columns by the RPC).
create table if not exists public.applicant_status_history (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.applicants (id) on delete cascade,
  from_status   public.applicant_status,
  to_status     public.applicant_status not null,
  changed_by    uuid references public.profiles (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists applicant_status_history_applicant_idx
  on public.applicant_status_history (applicant_id, created_at desc);

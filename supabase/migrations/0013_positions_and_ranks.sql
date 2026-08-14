-- ===========================================================================
-- 0013 — Configurable positions and ranks
-- ===========================================================================
-- Converts `position_type` from a hardcoded PostgreSQL enum into a `positions`
-- lookup table, and `personnel.rank_title` from free text into a `ranks`
-- lookup table. Adding a new post type or rank becomes a data change made by a
-- system administrator in the UI, not a migration written by a developer.
--
-- The conversion is non-lossy:
--   * every existing enum value becomes a row in `positions`
--   * every distinct existing `rank_title` becomes a row in `ranks`
--   * FK columns are backfilled before the old columns are dropped
--
-- Order matters. Views and functions that reference the old columns are
-- dropped first and rebuilt at the end, because PostgreSQL will not let a
-- column be dropped while a view depends on it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Reference tables
-- ---------------------------------------------------------------------------

create table if not exists public.positions (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null,
  name                  text not null,
  description           text,
  category              text,

  -- Eligibility. Enforced by the application at submission time; kept here so
  -- the rules are configurable rather than compiled into the form.
  min_age               smallint not null default 18,
  max_age               smallint,
  min_height_cm         numeric(5, 2),
  min_years_experience  smallint not null default 0,
  requires_license      boolean not null default false,

  default_daily_rate    numeric(10, 2),

  -- Badge colour, so a new position renders consistently without a code change.
  tone                  text not null default 'neutral',
  sort_order            smallint not null default 0,
  is_active             boolean not null default true,
  -- When false the position is hidden from the public application form but
  -- still usable internally (e.g. an internal-only post).
  is_public             boolean not null default true,

  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint positions_code_unique unique (code),
  constraint positions_code_shape_chk check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint positions_tone_chk check (
    tone in ('neutral', 'info', 'warning', 'success', 'danger', 'brand', 'laurel')
  ),
  -- Private security personnel must be at least 18 under Philippine law; a
  -- configured minimum may raise that floor but never lower it.
  constraint positions_min_age_chk check (min_age >= 18 and min_age <= 70),
  constraint positions_max_age_chk check (max_age is null or max_age >= min_age),
  constraint positions_height_chk
    check (min_height_cm is null or min_height_cm between 100 and 250),
  constraint positions_experience_chk
    check (min_years_experience between 0 and 60),
  constraint positions_rate_chk
    check (default_daily_rate is null or default_daily_rate >= 0)
);

create index if not exists positions_active_idx
  on public.positions (is_active, sort_order);
create index if not exists positions_public_idx
  on public.positions (is_public) where is_active;

comment on table public.positions is
  'Configurable job positions. Replaced the position_type enum in 0013.';
comment on column public.positions.tone is
  'Badge colour token, matching the tones in src/utils/constants.ts.';

create table if not exists public.ranks (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  name         text not null,
  description  text,
  -- Seniority: 1 is most senior. Used for ordering and future promotion rules.
  level        smallint not null default 100,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true,

  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint ranks_code_unique unique (code),
  constraint ranks_code_shape_chk check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint ranks_level_chk check (level between 1 and 999)
);

create index if not exists ranks_active_idx on public.ranks (is_active, level);

comment on table public.ranks is
  'Configurable personnel ranks. Replaced personnel.rank_title free text in 0013.';

-- Which ranks are offered for which positions. An empty set for a rank means
-- "applies to all positions" — see public.ranks_for_position().
create table if not exists public.position_ranks (
  position_id uuid not null references public.positions (id) on delete cascade,
  rank_id     uuid not null references public.ranks (id) on delete cascade,
  primary key (position_id, rank_id)
);

create index if not exists position_ranks_rank_idx on public.position_ranks (rank_id);

-- ---------------------------------------------------------------------------
-- 2. Seed from the existing enum
-- ---------------------------------------------------------------------------
-- Codes deliberately match the old enum labels, so the backfill below is a
-- straight text join and nothing has to be mapped by hand.

insert into public.positions
  (code, name, description, category, tone, sort_order,
   requires_license, min_years_experience, min_height_cm)
values
  ('security_guard', 'Security Guard',
   'Static and roving post duty at commercial, residential and industrial sites.',
   'Guarding', 'brand', 10, true, 0, 165),
  ('lady_guard', 'Lady Guard',
   'Frisking, access control and customer-facing duty at malls, banks and schools.',
   'Guarding', 'brand', 20, true, 0, 157),
  ('vip_escort', 'VIP Escort',
   'Close-in protection for executives and high-profile clients.',
   'Protective Services', 'laurel', 30, true, 2, 168),
  ('cctv_operator', 'CCTV Operator',
   'Command-centre monitoring, incident logging and coordination with ground units.',
   'Technical', 'info', 40, false, 0, null),
  ('driver', 'Driver',
   'Secure transport for personnel and clients. Professional licence required.',
   'Support', 'neutral', 50, false, 2, null)
on conflict (code) do nothing;

insert into public.ranks (code, name, description, level, sort_order) values
  ('detachment_commander', 'Detachment Commander',
   'Overall in charge of a detachment or client post.', 10, 10),
  ('shift_in_charge', 'Shift-in-Charge',
   'Supervises a single shift and reports to the detachment commander.', 20, 20),
  ('senior_officer', 'Senior Security Officer',
   'Experienced officer, may act as relief supervisor.', 30, 30),
  ('security_officer_ii', 'Security Officer II',
   'Officer with more than two years of continuous service.', 40, 40),
  ('security_officer_i', 'Security Officer I',
   'Entry-level officer following pre-deployment training.', 50, 50),
  ('probationary', 'Probationary',
   'Newly hired, still within the probationary period.', 60, 60)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Absorb any free-text ranks already in use
-- ---------------------------------------------------------------------------
-- Anything an operator typed into rank_title becomes a real rank rather than
-- being silently discarded. Slugged into the code shape the CHECK requires.

insert into public.ranks (code, name, description, level, sort_order, is_active)
select
  left(regexp_replace(lower(btrim(p.rank_title)), '[^a-z0-9]+', '_', 'g'), 40),
  btrim(p.rank_title),
  'Imported from free-text rank_title during migration 0013.',
  500,
  500,
  true
from (select distinct rank_title from public.personnel where rank_title is not null
        and btrim(rank_title) <> '') p
where regexp_replace(lower(btrim(p.rank_title)), '[^a-z0-9]+', '_', 'g') ~ '^[a-z0-9_]{2,40}$'
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Drop dependents before altering the columns
-- ---------------------------------------------------------------------------

drop materialized view if exists public.mv_recruitment_funnel;
drop view if exists public.v_applicant_summary;
drop view if exists public.v_active_deployments;
drop view if exists public.v_personnel_roster;
drop view if exists public.v_branch_staffing;

-- Return types change, so these cannot be replaced in place.
drop function if exists public.check_application_status(text, text);
drop function if exists public.promote_applicant_to_personnel(uuid, date, text);

-- ---------------------------------------------------------------------------
-- 5. Swap applicants.position_applied -> position_id
-- ---------------------------------------------------------------------------

alter table public.applicants
  add column if not exists position_id uuid references public.positions (id)
    on delete restrict;

update public.applicants a
   set position_id = p.id
  from public.positions p
 where p.code = a.position_applied::text
   and a.position_id is null;

alter table public.applicants alter column position_id set not null;

drop index if exists public.applicants_position_idx;
alter table public.applicants drop column if exists position_applied;
create index if not exists applicants_position_idx on public.applicants (position_id);

-- ---------------------------------------------------------------------------
-- 6. Swap personnel.position -> position_id and rank_title -> rank_id
-- ---------------------------------------------------------------------------

alter table public.personnel
  add column if not exists position_id uuid references public.positions (id)
    on delete restrict,
  add column if not exists rank_id uuid references public.ranks (id)
    on delete set null;

update public.personnel pe
   set position_id = po.id
  from public.positions po
 where po.code = pe.position::text
   and pe.position_id is null;

update public.personnel pe
   set rank_id = r.id
  from public.ranks r
 where r.name = btrim(pe.rank_title)
   and pe.rank_id is null;

alter table public.personnel alter column position_id set not null;

drop index if exists public.personnel_position_idx;
alter table public.personnel drop column if exists position;
alter table public.personnel drop column if exists rank_title;
create index if not exists personnel_position_idx on public.personnel (position_id);
create index if not exists personnel_rank_idx on public.personnel (rank_id);

-- ---------------------------------------------------------------------------
-- 7. Retire the enum
-- ---------------------------------------------------------------------------
-- DROP TYPE defaults to RESTRICT, so this fails loudly if anything still
-- references it. That is the intended safety check, not an inconvenience.

drop type if exists public.position_type;

-- `recruitment.open_positions` duplicated what positions.is_active now records.
-- Two sources of truth for the same fact is how they drift apart.
delete from public.settings where key = 'recruitment.open_positions';

-- ---------------------------------------------------------------------------
-- 8. Housekeeping triggers on the new tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['positions', 'ranks']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
    execute format('drop trigger if exists audit_changes on public.%I', t);
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Helper: which ranks apply to a position
-- ---------------------------------------------------------------------------

create or replace function public.ranks_for_position(p_position_id uuid)
returns setof public.ranks
language sql
stable
security invoker
set search_path = ''
as $$
  select r.*
  from public.ranks r
  where r.is_active
    and (
      -- A rank with no explicit mapping is offered for every position.
      not exists (select 1 from public.position_ranks pr where pr.rank_id = r.id)
      or exists (
        select 1 from public.position_ranks pr
        where pr.rank_id = r.id and pr.position_id = p_position_id
      )
    )
  order by r.level, r.sort_order, r.name;
$$;

grant execute on function public.ranks_for_position(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Rebuild the views against the new columns
-- ---------------------------------------------------------------------------

create or replace view public.v_applicant_summary
with (security_invoker = true) as
select
  a.id,
  a.reference_no,
  a.first_name,
  a.middle_name,
  a.last_name,
  (a.first_name || ' ' || coalesce(a.middle_name || ' ', '') || a.last_name) as full_name,
  a.email,
  a.phone,
  a.sex,
  a.birth_date,
  date_part('year', age(a.birth_date))::int as age,
  a.position_id,
  pos.code as position_code,
  pos.name as position_name,
  pos.tone as position_tone,
  a.status,
  a.is_licensed,
  a.years_experience,
  a.rating,
  a.interview_at,
  a.preferred_branch_id,
  b.name as preferred_branch_name,
  b.code as preferred_branch_code,
  a.reviewed_by,
  r.full_name as reviewed_by_name,
  a.created_at,
  a.status_changed_at,
  (select count(*) from public.applicant_documents d where d.applicant_id = a.id)
    as document_count,
  (select count(*) from public.applicant_documents d
    where d.applicant_id = a.id and d.verified_at is not null)
    as verified_document_count
from public.applicants a
join public.positions pos on pos.id = a.position_id
left join public.branches b on b.id = a.preferred_branch_id
left join public.profiles r on r.id = a.reviewed_by;

create or replace view public.v_active_deployments
with (security_invoker = true) as
select
  d.id,
  d.personnel_id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name)
    as personnel_name,
  p.position_id,
  pos.code as position_code,
  pos.name as position_name,
  pos.tone as position_tone,
  rk.name as rank_name,
  p.employment_status,
  p.photo_path,
  d.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  b.city_municipality,
  b.region,
  d.shift,
  d.post_assignment,
  d.start_date,
  d.end_date,
  d.status,
  d.daily_rate,
  (current_date - d.start_date) as days_deployed,
  d.assigned_by,
  d.created_at
from public.deployments d
join public.personnel p on p.id = d.personnel_id
join public.positions pos on pos.id = p.position_id
left join public.ranks rk on rk.id = p.rank_id
join public.branches b on b.id = d.branch_id;

create or replace view public.v_branch_staffing
with (security_invoker = true) as
select
  b.id as branch_id,
  b.code,
  b.name,
  b.city_municipality,
  b.region,
  b.is_active,
  b.required_headcount,
  b.coordinator_id,
  c.full_name as coordinator_name,
  count(d.id) filter (where d.status = 'active') as deployed_count,
  greatest(
    b.required_headcount - count(d.id) filter (where d.status = 'active'), 0
  ) as vacancy_count,
  case
    when b.required_headcount = 0 then null
    else round(
      100.0 * count(d.id) filter (where d.status = 'active') / b.required_headcount, 1
    )
  end as fill_rate_pct
from public.branches b
left join public.deployments d on d.branch_id = b.id
left join public.profiles c on c.id = b.coordinator_id
group by b.id, c.full_name;

create or replace view public.v_personnel_roster
with (security_invoker = true) as
select
  p.id,
  p.employee_no,
  (p.first_name || ' ' || coalesce(p.middle_name || ' ', '') || p.last_name) as full_name,
  p.first_name,
  p.last_name,
  p.position_id,
  pos.code as position_code,
  pos.name as position_name,
  pos.tone as position_tone,
  p.rank_id,
  rk.name as rank_name,
  rk.level as rank_level,
  p.employment_status,
  p.date_hired,
  p.phone,
  p.email,
  p.photo_path,
  p.security_license_no,
  p.security_license_expiry,
  (p.security_license_expiry is not null
    and p.security_license_expiry < current_date + 60) as license_expiring_soon,
  cur.id          as current_deployment_id,
  cur.branch_id   as current_branch_id,
  cb.name         as current_branch_name,
  cur.shift       as current_shift,
  cur.start_date  as current_start_date
from public.personnel p
join public.positions pos on pos.id = p.position_id
left join public.ranks rk on rk.id = p.rank_id
left join lateral (
  select d.* from public.deployments d
  where d.personnel_id = p.id and d.status = 'active'
  order by d.start_date desc limit 1
) cur on true
left join public.branches cb on cb.id = cur.branch_id;

create materialized view public.mv_recruitment_funnel as
select
  date_trunc('month', a.created_at)::date as period_month,
  a.position_id,
  pos.code as position_code,
  pos.name as position_name,
  a.preferred_branch_id,
  count(*)                                             as total,
  count(*) filter (where a.status = 'pending')         as pending,
  count(*) filter (where a.status = 'screening')       as screening,
  count(*) filter (where a.status = 'interview')       as interview,
  count(*) filter (where a.status = 'hired')           as hired,
  count(*) filter (where a.status = 'rejected')        as rejected,
  count(*) filter (where a.status = 'archived')        as archived,
  round(
    (avg(extract(epoch from (a.status_changed_at - a.created_at)) / 86400)
      filter (where a.status in ('hired', 'rejected')))::numeric,
    1
  )                                                    as avg_days_to_decision
from public.applicants a
join public.positions pos on pos.id = a.position_id
group by 1, 2, 3, 4, 5;

create unique index if not exists mv_recruitment_funnel_pk
  on public.mv_recruitment_funnel (
    period_month,
    position_id,
    coalesce(preferred_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- 11. Rebuild the functions
-- ---------------------------------------------------------------------------

create or replace function public.check_application_status(
  p_reference_no text,
  p_last_name    text
)
returns table (
  reference_no      text,
  first_name        text,
  last_name         text,
  position_name     text,
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
    left(a.first_name, 1) || repeat('*', greatest(length(a.first_name) - 1, 0)),
    a.last_name,
    pos.name,
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
  join public.positions pos on pos.id = a.position_id
  where upper(a.reference_no) = upper(btrim(p_reference_no))
    and lower(a.last_name) = lower(btrim(p_last_name))
    and a.status <> 'archived';
end;
$$;

revoke all on function public.check_application_status(text, text) from public;
grant execute on function public.check_application_status(text, text) to anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- 12. Analytics refresh (unchanged behaviour, recreated after the mv)
-- ---------------------------------------------------------------------------

create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_recruitment_funnel;
end;
$$;

revoke all on function public.refresh_analytics() from public, anon;
grant execute on function public.refresh_analytics() to authenticated;

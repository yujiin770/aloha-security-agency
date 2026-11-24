-- ===========================================================================
-- 0027 — Violations, suspension, termination, blocklist, re-hire
-- ===========================================================================
-- The client roster spreadsheets track, per guard: a list of violations and
-- offenses, status changes (suspended, terminated, removed from the company)
-- and the date each one took effect. None of that had a home.
--
--   * `personnel_actions` — one append-only log for every disciplinary and
--     status event. Each row carries a REQUIRED reason and an effectivity date.
--       violation          offense + reason, no status change
--       suspension         active/on_leave -> suspended (optional end date)
--       suspension_lifted  suspended -> active
--       resignation        -> resigned          (via separate_personnel)
--       termination        -> terminated        (via separate_personnel)
--       blocklist          removed from the company, can never be re-hired
--       rehire             resigned -> active
--   * `personnel.status_effective_date` — when the current status took effect.
--   * `personnel.is_blocklisted` (+ date, reason) — a blocklisted person cannot
--     be re-hired and cannot submit a new application with the same email.
--
-- Every write goes through a SECURITY DEFINER function gated to administrators
-- and HR, so a status change can never be recorded without its reason.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Types and columns
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'personnel_action_type') then
    create type public.personnel_action_type as enum (
      'violation',
      'suspension',
      'suspension_lifted',
      'resignation',
      'termination',
      'blocklist',
      'rehire'
    );
  end if;
end
$$;

alter table public.personnel
  add column if not exists status_effective_date date,
  add column if not exists is_blocklisted       boolean not null default false,
  add column if not exists blocklisted_on       date,
  add column if not exists blocklist_reason     text;

-- Backfill: the best we know is the separation date, else the hire date.
-- FORCE RLS (0009) would hide every row from the migration (auth.uid() is null),
-- so it is lifted for this statement only, exactly as 0022 does.
alter table public.personnel no force row level security;
update public.personnel
   set status_effective_date = coalesce(date_separated, date_hired)
 where status_effective_date is null;
alter table public.personnel force row level security;

alter table public.personnel
  drop constraint if exists personnel_blocklist_consistency_chk;
alter table public.personnel
  add constraint personnel_blocklist_consistency_chk
  check (
    is_blocklisted = (blocklisted_on is not null)
    and (not is_blocklisted or blocklist_reason is not null)
    -- Removed from the company means no longer employed.
    and (not is_blocklisted or employment_status in ('resigned', 'terminated'))
  );

-- New rows (promote_applicant_to_personnel, "Add existing personnel") start
-- their status on the hire date unless told otherwise.
create or replace function public.personnel_default_status_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status_effective_date := coalesce(new.status_effective_date, new.date_hired);
  return new;
end;
$$;

drop trigger if exists personnel_default_status_date on public.personnel;
create trigger personnel_default_status_date
  before insert on public.personnel
  for each row execute function public.personnel_default_status_date();

create index if not exists personnel_blocklisted_idx
  on public.personnel (is_blocklisted) where is_blocklisted;

comment on column public.personnel.status_effective_date is
  'Date the current employment_status took effect (0027).';
comment on column public.personnel.is_blocklisted is
  'Removed from the company. Blocks re-hire and new applications from the same email (0027).';

-- ---------------------------------------------------------------------------
-- 2. personnel_actions — the log
-- ---------------------------------------------------------------------------
create table if not exists public.personnel_actions (
  id              uuid primary key default gen_random_uuid(),
  personnel_id    uuid not null references public.personnel (id) on delete cascade,
  action_type     public.personnel_action_type not null,
  offense         text,
  reason          text not null,
  effective_date  date not null,
  end_date        date,
  from_status     public.employment_status,
  to_status       public.employment_status,
  details         text,
  recorded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint personnel_actions_reason_chk check (btrim(reason) <> ''),
  constraint personnel_actions_offense_chk
    check (action_type <> 'violation' or nullif(btrim(offense), '') is not null),
  constraint personnel_actions_end_date_chk
    check (end_date is null or end_date >= effective_date)
);

create index if not exists personnel_actions_personnel_idx
  on public.personnel_actions (personnel_id, effective_date desc, created_at desc);
create index if not exists personnel_actions_type_idx
  on public.personnel_actions (action_type);

comment on table public.personnel_actions is
  'Append-only log of violations and status events (suspension, termination, blocklist, re-hire), each with a reason and effectivity date (0027). Written only through the RPCs in 0027.';

alter table public.personnel_actions enable row level security;

-- Read: everyone who can read the full roster. No insert/update/delete
-- policies — writes happen only inside the SECURITY DEFINER functions below.
drop policy if exists personnel_actions_select on public.personnel_actions;
create policy personnel_actions_select on public.personnel_actions
  for select to authenticated
  using (
    public.is_admin()
    or public.has_role('hr_staff'::public.app_role,
                       'recruitment_officer'::public.app_role,
                       'deployment_officer'::public.app_role)
  );

grant select on public.personnel_actions to authenticated;

drop trigger if exists audit_changes on public.personnel_actions;
create trigger audit_changes after insert or update or delete on public.personnel_actions
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 3. Shared helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.assert_can_discipline_personnel()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_role('hr_staff'::public.app_role)) then
    raise exception 'Only administrators and HR can change a personnel record''s status.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  return btrim(p_reason);
end;
$$;

-- Ends employment and closes open deployments (the 0019 behaviour), from any
-- employed state. Returns the updated row. Caller checks privileges.
create or replace function public.close_personnel_employment(
  p_personnel_id uuid,
  p_status       public.employment_status,
  p_date         date,
  p_reason       text
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.personnel;
  v_closed integer;
begin
  update public.personnel
     set employment_status     = p_status,
         date_separated        = p_date,
         status_effective_date = p_date
   where id = p_personnel_id
     and employment_status in ('active', 'on_leave', 'suspended')
  returning * into v_row;

  if not found then
    raise exception 'This person is not currently employed.';
  end if;

  update public.deployments
     set status       = 'ended',
         end_date     = greatest(p_date, start_date),
         ended_reason = 'Personnel ' || p_status::text || ': ' || p_reason
   where personnel_id = p_personnel_id
     and status in ('pending', 'active');

  get diagnostics v_closed = row_count;

  if v_closed > 0 then
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary)
    values ((select auth.uid()), 'personnel.separated', 'personnel', p_personnel_id,
            v_closed || ' deployment(s) ended automatically on separation');
  end if;

  return v_row;
end;
$$;

revoke all on function public.assert_can_discipline_personnel() from public, anon, authenticated;
revoke all on function public.close_personnel_employment(uuid, public.employment_status, date, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Violation / offense
-- ---------------------------------------------------------------------------
create or replace function public.record_personnel_violation(
  p_personnel_id uuid,
  p_offense      text,
  p_reason       text,
  p_date         date default current_date
)
returns public.personnel_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.employment_status;
  v_row    public.personnel_actions;
begin
  perform public.assert_can_discipline_personnel();

  if p_offense is null or btrim(p_offense) = '' then
    raise exception 'Choose or type the offense.';
  end if;

  select employment_status into v_status
    from public.personnel where id = p_personnel_id;
  if not found then
    raise exception 'Personnel record not found.';
  end if;

  insert into public.personnel_actions (
    personnel_id, action_type, offense, reason, effective_date,
    from_status, to_status, recorded_by
  ) values (
    p_personnel_id, 'violation', btrim(p_offense), public.require_reason(p_reason),
    coalesce(p_date, current_date), v_status, v_status, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Suspension and lifting it
-- ---------------------------------------------------------------------------
-- Open deployments are left alone: a suspension is temporary, and the staffing
-- views (0019) already count only actively employed guards, so the post shows
-- as vacant until the suspension is lifted.
create or replace function public.suspend_personnel(
  p_personnel_id uuid,
  p_reason       text,
  p_date         date default current_date,
  p_until        date default null
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.employment_status;
  v_row public.personnel;
  v_reason text := public.require_reason(p_reason);
begin
  perform public.assert_can_discipline_personnel();

  if p_until is not null and p_until < p_date then
    raise exception 'The suspension cannot end before it starts.';
  end if;

  select employment_status into v_old
    from public.personnel where id = p_personnel_id for update;

  if v_old is null or v_old not in ('active', 'on_leave') then
    raise exception 'Only active personnel or personnel on leave can be suspended.';
  end if;

  update public.personnel
     set employment_status = 'suspended',
         status_effective_date = p_date
   where id = p_personnel_id
  returning * into v_row;

  insert into public.personnel_actions (
    personnel_id, action_type, reason, effective_date, end_date,
    from_status, to_status, recorded_by
  ) values (
    p_personnel_id, 'suspension', v_reason, p_date, p_until,
    v_old, 'suspended', (select auth.uid())
  );

  return v_row;
end;
$$;

create or replace function public.lift_personnel_suspension(
  p_personnel_id uuid,
  p_reason       text,
  p_date         date default current_date
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.personnel;
  v_reason text := public.require_reason(p_reason);
begin
  perform public.assert_can_discipline_personnel();

  update public.personnel
     set employment_status = 'active',
         status_effective_date = p_date
   where id = p_personnel_id
     and employment_status = 'suspended'
  returning * into v_row;

  if not found then
    raise exception 'This person is not suspended.';
  end if;

  insert into public.personnel_actions (
    personnel_id, action_type, reason, effective_date,
    from_status, to_status, recorded_by
  ) values (
    p_personnel_id, 'suspension_lifted', v_reason, p_date,
    'suspended', 'active', (select auth.uid())
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Resignation / termination — separate_personnel() now takes a reason
-- ---------------------------------------------------------------------------
-- Same signature as 0019 so the existing grant and client call keep working.
-- Changes: works from on_leave and suspended too, termination requires a
-- reason, and the event is logged in personnel_actions.
create or replace function public.separate_personnel(
  p_personnel_id uuid,
  p_status       text,
  p_date         date default current_date,
  p_note         text default null
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.employment_status;
  v_row    public.personnel;
  v_reason text;
begin
  if p_status not in ('resigned', 'terminated') then
    raise exception 'Separation status must be resigned or terminated, not %', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  perform public.assert_can_discipline_personnel();

  v_reason := case
    when p_status = 'terminated' then public.require_reason(p_note)
    else coalesce(nullif(btrim(p_note), ''), 'Resigned')
  end;

  select employment_status into v_old
    from public.personnel where id = p_personnel_id for update;

  v_row := public.close_personnel_employment(
    p_personnel_id, p_status::public.employment_status, coalesce(p_date, current_date), v_reason
  );

  insert into public.personnel_actions (
    personnel_id, action_type, reason, effective_date,
    from_status, to_status, recorded_by
  ) values (
    p_personnel_id,
    case when p_status = 'terminated' then 'termination' else 'resignation' end::public.personnel_action_type,
    v_reason, coalesce(p_date, current_date),
    v_old, p_status::public.employment_status, (select auth.uid())
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Blocklist — remove from the company for good
-- ---------------------------------------------------------------------------
-- If still employed, they are terminated as of p_date (deployments closed).
-- If they already left, their resigned/terminated status is kept and only the
-- blocklist flag is added.
create or replace function public.blocklist_personnel(
  p_personnel_id uuid,
  p_reason       text,
  p_date         date default current_date
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.personnel;
  v_row    public.personnel;
  v_reason text := public.require_reason(p_reason);
begin
  perform public.assert_can_discipline_personnel();

  select * into v_old from public.personnel where id = p_personnel_id for update;
  if not found then
    raise exception 'Personnel record not found.';
  end if;
  if v_old.is_blocklisted then
    raise exception 'This person is already blocklisted.';
  end if;

  if v_old.employment_status in ('active', 'on_leave', 'suspended') then
    perform public.close_personnel_employment(
      p_personnel_id, 'terminated', p_date, 'Blocklisted — ' || v_reason
    );
  end if;

  update public.personnel
     set is_blocklisted        = true,
         blocklisted_on        = p_date,
         blocklist_reason      = v_reason,
         status_effective_date = p_date
   where id = p_personnel_id
  returning * into v_row;

  insert into public.personnel_actions (
    personnel_id, action_type, reason, effective_date,
    from_status, to_status, recorded_by
  ) values (
    p_personnel_id, 'blocklist', v_reason, p_date,
    v_old.employment_status, v_row.employment_status, (select auth.uid())
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Re-hire a resigned person
-- ---------------------------------------------------------------------------
-- The record is reused, so the employee number, statutory IDs, violations and
-- deployment history all stay with the person. date_hired moves to the re-hire
-- date; the previous tenure is kept in the log row's `details`.
create or replace function public.rehire_personnel(
  p_personnel_id uuid,
  p_reason       text,
  p_date         date default current_date
)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.personnel;
  v_row    public.personnel;
  v_reason text := public.require_reason(p_reason);
begin
  perform public.assert_can_discipline_personnel();

  select * into v_old from public.personnel where id = p_personnel_id for update;
  if not found then
    raise exception 'Personnel record not found.';
  end if;
  if v_old.is_blocklisted then
    raise exception 'This person is blocklisted and cannot be re-hired.';
  end if;
  if v_old.employment_status <> 'resigned' then
    raise exception 'Only personnel who resigned can be re-hired.';
  end if;
  if p_date < v_old.date_separated then
    raise exception 'The re-hire date cannot be before the resignation date (%).',
      to_char(v_old.date_separated, 'FMMonth FMDD, YYYY');
  end if;

  update public.personnel
     set employment_status     = 'active',
         date_hired            = p_date,
         date_separated        = null,
         status_effective_date = p_date
   where id = p_personnel_id
  returning * into v_row;

  insert into public.personnel_actions (
    personnel_id, action_type, reason, effective_date,
    from_status, to_status, details, recorded_by
  ) values (
    p_personnel_id, 'rehire', v_reason, p_date,
    'resigned', 'active',
    'Previously employed ' || to_char(v_old.date_hired, 'DD Mon YYYY')
      || ' – ' || to_char(v_old.date_separated, 'DD Mon YYYY'),
    (select auth.uid())
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.record_personnel_violation(uuid, text, text, date) from public;
revoke all on function public.suspend_personnel(uuid, text, date, date) from public;
revoke all on function public.lift_personnel_suspension(uuid, text, date) from public;
revoke all on function public.separate_personnel(uuid, text, date, text) from public;
revoke all on function public.blocklist_personnel(uuid, text, date) from public;
revoke all on function public.rehire_personnel(uuid, text, date) from public;

grant execute on function public.record_personnel_violation(uuid, text, text, date) to authenticated;
grant execute on function public.suspend_personnel(uuid, text, date, date) to authenticated;
grant execute on function public.lift_personnel_suspension(uuid, text, date) to authenticated;
grant execute on function public.separate_personnel(uuid, text, date, text) to authenticated;
grant execute on function public.blocklist_personnel(uuid, text, date) to authenticated;
grant execute on function public.rehire_personnel(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Roster view — new columns appended (CREATE OR REPLACE keeps grants)
-- ---------------------------------------------------------------------------
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
  cur.start_date  as current_start_date,
  -- 0027
  p.status_effective_date,
  p.date_separated,
  p.is_blocklisted,
  (select count(*) from public.personnel_actions a
    where a.personnel_id = p.id and a.action_type = 'violation')::int as violation_count
from public.personnel p
join public.positions pos on pos.id = p.position_id
left join public.ranks rk on rk.id = p.rank_id
left join lateral (
  select d.* from public.deployments d
  where d.personnel_id = p.id and d.status = 'active'
  order by d.start_date desc limit 1
) cur on true
left join public.branches cb on cb.id = cur.branch_id;

grant select on public.v_personnel_roster to authenticated;

-- ---------------------------------------------------------------------------
-- 11. A blocklisted person cannot apply again with the same email
-- ---------------------------------------------------------------------------
-- 0024's body with one new first branch. The message deliberately does not say
-- "blocklisted" — the public form is not the place to disclose that.
create or replace function public.email_application_state(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'blocklisted'
       from public.personnel p
      where p.email is not null
        and lower(btrim(p.email)) = lower(btrim(p_email))
        and p.is_blocklisted
      limit 1),
    (select 'hired'
       from public.personnel p
      where p.email is not null
        and lower(btrim(p.email)) = lower(btrim(p_email))
        and p.employment_status = 'active'
      limit 1),
    (select a.status::text
       from public.applicants a
      where lower(btrim(a.email)) = lower(btrim(p_email))
        and a.status in ('pending', 'screening', 'interview', 'hired')
      order by a.created_at
      limit 1),
    (select 'archived'
       from public.applicants a
      where lower(btrim(a.email)) = lower(btrim(p_email))
        and a.status = 'archived'
        and not exists (
          select 1 from public.applicant_status_history h
           where h.applicant_id = a.id and h.to_status = 'rejected'
        )
      limit 1),
    (select 'rejected'
      where public.email_reapply_date(p_email) > current_date),
    'available'
  );
$$;

-- 0025's body plus the 'blocklisted' sentence.
create or replace function public.email_ineligible_message(p_state text, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_state = 'available' then null
    when p_state = 'blocklisted' then
      'We are unable to accept an application with this email address. Please contact HR.'
    when p_state = 'hired' then
      'This email address belongs to a current member of our personnel. Please contact HR instead of applying again.'
    when p_state = 'rejected' then
      'Your previous application was not successful. You may apply again with this email address from '
      || to_char(public.email_reapply_date(p_email), 'FMMonth FMDD, YYYY')
      || '. If you have questions about your application, please contact HR.'
    else
      'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'
  end;
$$;

revoke all on function public.email_ineligible_message(text, text) from public, anon, authenticated;

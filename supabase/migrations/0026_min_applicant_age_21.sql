-- ===========================================================================
-- 0026 — Applicants must be at least 21
-- ===========================================================================
-- The agency's hiring floor is 21, above the statutory 18 that 0004 and 0013
-- encoded. The application form (MIN_APPLICANT_AGE in applicationSchema.ts)
-- checks the same rule; this is the enforcement point, since a submitter can
-- call submit_application directly.
--
-- Existing applicants are grandfathered: the new constraint is added NOT VALID,
-- so it applies to every insert and update from now on, but rows already on
-- file (someone who applied at 19 last month) are not re-checked. Do not run
-- VALIDATE CONSTRAINT on it unless every such row has been dealt with.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Applicants
-- ---------------------------------------------------------------------------
alter table public.applicants
  drop constraint if exists applicants_age_chk;

alter table public.applicants
  add constraint applicants_age_chk
  check (birth_date <= (current_date - interval '21 years'))
  not valid;

-- ---------------------------------------------------------------------------
-- 2. Positions
-- ---------------------------------------------------------------------------
-- A position may raise the floor but never lower it. Positions configured
-- below 21 are lifted first, so the public careers page stops advertising an
-- age the form would reject.
update public.positions
   set min_age = 21
 where min_age < 21;

update public.positions
   set max_age = 21
 where max_age is not null
   and max_age < 21;

alter table public.positions
  alter column min_age set default 21;

alter table public.positions
  drop constraint if exists positions_min_age_chk;

alter table public.positions
  add constraint positions_min_age_chk
  check (min_age >= 21 and min_age <= 70);

-- ---------------------------------------------------------------------------
-- 3. Setting
-- ---------------------------------------------------------------------------
update public.settings
   set value = '21'::jsonb,
       description = 'Minimum applicant age. Also enforced by a CHECK constraint (0026).',
       updated_at = now()
 where key = 'recruitment.min_age';

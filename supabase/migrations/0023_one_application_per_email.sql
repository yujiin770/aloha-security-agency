-- ===========================================================================
-- 0023 — One application per email address
-- ===========================================================================
-- Nothing stopped the same person filing an application over and over. The
-- idempotency key added in 0019 only covers a retry of *one* filled-in form —
-- a fresh visit generates a new key, so the same applicant could re-submit
-- indefinitely and arrive in the pipeline as several unrelated records.
--
-- The email address is the identity the agency already treats as unique: it is
-- how status notifications are addressed and how staff recognise a returning
-- name. So it becomes the rule — an address may hold at most one application,
-- and an address already belonging to a hired guard may not apply at all.
--
-- Three layers, because each catches what the one above it cannot:
--
--   1. `applicants_email_unique_idx` — a unique index on lower(email). The last
--      word, and immune to races: two simultaneous submissions of the same
--      address cannot both win, however the application code is written.
--   2. `submit_application()` — checks first and raises a sentence the
--      applicant can read, rather than letting them hit a raw 23505.
--   3. `check_email_eligibility()` — lets the public form say so on the first
--      step, before ten minutes of typing have been spent.
--
-- "Already applied" is deliberately *any* prior application, including a
-- rejected or archived one. To let rejected applicants re-apply later, change
-- the `v_state` branch in submit_application and the matching one in
-- check_email_eligibility to ignore rows whose status is 'rejected', and
-- replace the unique index with a partial one excluding them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalise what is already stored
-- ---------------------------------------------------------------------------
-- Submissions have gone through `lower(btrim(...))` since 0017, but rows
-- created by staff before that, or edited since, may carry mixed case. The
-- index below is on lower(email), so unless the stored values are normalised
-- too, `Juan@x.com` and `juan@x.com` would collide at write time while still
-- reading back differently everywhere else.
update public.applicants
   set email = lower(btrim(email))
 where email <> lower(btrim(email));

update public.personnel
   set email = lower(btrim(email))
 where email is not null
   and email <> lower(btrim(email));

-- ---------------------------------------------------------------------------
-- 2. The constraint
-- ---------------------------------------------------------------------------
-- Guarded rather than unconditional: if the table already holds duplicates,
-- creating the index would abort the whole migration and block the deploy for
-- a data problem only a human can settle (which of the two applications is the
-- real one?). So the index is created when the data permits, and otherwise the
-- deploy proceeds with a loud warning — the checks in submit_application still
-- prevent *new* duplicates in the meantime.
do $$
declare
  v_dupes text;
begin
  select string_agg(email || ' (' || n || ')', ', ' order by email)
    into v_dupes
    from (
      select lower(btrim(email)) as email, count(*) as n
        from public.applicants
       group by 1
      having count(*) > 1
    ) d;

  if v_dupes is null then
    create unique index if not exists applicants_email_unique_idx
      on public.applicants (lower(btrim(email)));

    comment on index public.applicants_email_unique_idx is
      'One application per email address (0023). Case- and whitespace-insensitive.';
  else
    raise warning
      'applicants_email_unique_idx NOT created: duplicate emails already exist — %. Merge or archive the extra applications, then re-run this migration.',
      v_dupes;
  end if;
end;
$$;

-- Hired guards are matched by address too, so the lookup below is not a scan.
create index if not exists personnel_email_idx
  on public.personnel (lower(btrim(email)))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 3. Shared classifier
-- ---------------------------------------------------------------------------
-- Returns 'available', 'hired', or one of the applicant statuses. Both the RPC
-- and the submit path call it, so the public form's answer and the answer the
-- submit gives can never disagree.
--
-- `personnel` is checked first: someone hired long enough ago that their
-- applicant row was purged still must not re-apply, and an applicant who was
-- promoted is 'hired' regardless of what their applicant row now says.
create or replace function public.email_application_state(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'hired'
       from public.personnel p
      where p.email is not null
        and lower(btrim(p.email)) = lower(btrim(p_email))
        and p.employment_status = 'active'
      limit 1),
    (select case when a.status = 'hired' then 'hired' else a.status::text end
       from public.applicants a
      where lower(btrim(a.email)) = lower(btrim(p_email))
      order by a.created_at
      limit 1),
    'available'
  );
$$;

comment on function public.email_application_state(text) is
  'Classifies an email address for the one-application-per-email rule (0023): ''available'', ''hired'', or the existing application''s status.';

revoke all on function public.email_application_state(text) from public;
grant execute on function public.email_application_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public pre-flight check
-- ---------------------------------------------------------------------------
-- Returns only a state and a sentence — never a name, a reference number, or
-- anything else about the existing record. It does confirm that an address is
-- known to us, which the submit response would reveal anyway; the alternative
-- is making applicants fill in the whole form to be told they cannot use it.
create or replace function public.check_email_eligibility(p_email text)
returns table (eligible boolean, state text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  if p_email is null or btrim(p_email) = '' then
    return query select true, 'available'::text, null::text;
    return;
  end if;

  v_state := public.email_application_state(p_email);

  if v_state = 'available' then
    return query select true, v_state, null::text;
  elsif v_state = 'hired' then
    return query select false, v_state,
      'This email address belongs to a current member of our personnel. Please contact HR instead of applying again.'::text;
  else
    return query select false, v_state,
      'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'::text;
  end if;
end;
$$;

comment on function public.check_email_eligibility(text) is
  'Public pre-flight for the application form (0023). Returns whether an email may still be used to apply, and why not. Deliberately returns no details about the existing record.';

revoke all on function public.check_email_eligibility(text) from public;
grant execute on function public.check_email_eligibility(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Enforcement in the submit path
-- ---------------------------------------------------------------------------
-- Identical to 0019 apart from the eligibility gate, which sits after the
-- idempotency lookup: a retry of a submission that already landed must return
-- the original receipt, not be rejected as a duplicate of itself.
--
-- The messages are raised as P0001, which `toAppError` passes through verbatim
-- (see src/lib/errors.ts) — these are written for the applicant to read.
create or replace function public.submit_application(
  p_payload       jsonb,
  p_submission_id uuid default null
)
returns table (id uuid, reference_no text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id    uuid;
  v_ref   text;
  v_email text;
  v_state text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'submit_application expects a JSON object payload';
  end if;

  -- A retry of a submission that actually landed: hand back the same receipt.
  if p_submission_id is not null then
    select a.id, a.reference_no into v_id, v_ref
      from public.applicants a
     where a.submission_id = p_submission_id;

    if found then
      return query select v_id, v_ref;
      return;
    end if;
  end if;

  v_email := lower(btrim(p_payload ->> 'email'));

  if v_email is null or v_email = '' then
    raise exception 'An email address is required.'
      using errcode = 'P0001';
  end if;

  v_state := public.email_application_state(v_email);

  if v_state = 'hired' then
    raise exception 'This email address belongs to a current member of our personnel. Please contact HR instead of applying again.'
      using errcode = 'P0001';
  elsif v_state <> 'available' then
    raise exception 'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'
      using errcode = 'P0001';
  end if;

  insert into public.applicants (
    first_name, middle_name, last_name, suffix,
    email, phone, birth_date, sex, civil_status, height_cm, weight_kg,
    address_line, barangay, city_municipality, province, region, postal_code,
    position_id, preferred_branch_id, years_experience, highest_education,
    expected_salary, availability_date, source,
    sss_no, philhealth_no, pagibig_no, tin_no,
    nbi_clearance_no, nbi_clearance_expiry, police_clearance_no,
    security_license_no, security_license_expiry, is_licensed,
    submission_id,
    -- Pinned, never taken from the payload.
    status, reviewed_by, interview_at, interview_notes,
    rating, rejection_reason, internal_notes, archived_at
  )
  values (
    btrim(p_payload ->> 'first_name'),
    nullif(btrim(coalesce(p_payload ->> 'middle_name', '')), ''),
    btrim(p_payload ->> 'last_name'),
    nullif(btrim(coalesce(p_payload ->> 'suffix', '')), ''),
    v_email,
    btrim(p_payload ->> 'phone'),
    (p_payload ->> 'birth_date')::date,
    (p_payload ->> 'sex')::public.sex_type,
    nullif(btrim(coalesce(p_payload ->> 'civil_status', '')), '')::public.civil_status,
    nullif(btrim(coalesce(p_payload ->> 'height_cm', '')), '')::numeric,
    nullif(btrim(coalesce(p_payload ->> 'weight_kg', '')), '')::numeric,

    nullif(btrim(coalesce(p_payload ->> 'address_line', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'barangay', '')), ''),
    btrim(p_payload ->> 'city_municipality'),
    nullif(btrim(coalesce(p_payload ->> 'province', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'region', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'postal_code', '')), ''),

    (p_payload ->> 'position_id')::uuid,
    nullif(btrim(coalesce(p_payload ->> 'preferred_branch_id', '')), '')::uuid,
    coalesce(nullif(btrim(coalesce(p_payload ->> 'years_experience', '')), '')::smallint, 0),
    nullif(btrim(coalesce(p_payload ->> 'highest_education', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'expected_salary', '')), '')::numeric,
    nullif(btrim(coalesce(p_payload ->> 'availability_date', '')), '')::date,
    nullif(btrim(coalesce(p_payload ->> 'source', '')), ''),

    nullif(btrim(coalesce(p_payload ->> 'sss_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'philhealth_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'pagibig_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'tin_no', '')), ''),

    nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_expiry', '')), '')::date,
    nullif(btrim(coalesce(p_payload ->> 'police_clearance_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'security_license_no', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'security_license_expiry', '')), '')::date,
    coalesce((p_payload ->> 'is_licensed')::boolean, false),

    p_submission_id,

    'pending'::public.applicant_status, null, null, null,
    null, null, null, null
  )
  returning applicants.id, applicants.reference_no
  into v_id, v_ref;

  return query select v_id, v_ref;

exception
  -- Two submissions of the same address in the same instant: both pass the
  -- check above, one loses the unique index. Restate it as the sentence the
  -- applicant would have got had they been a moment later.
  when unique_violation then
    if sqlerrm like '%applicants_email_unique_idx%' then
      raise exception 'An application has already been submitted with this email address. Use the status page to follow its progress — check with your reference number and surname.'
        using errcode = 'P0001';
    end if;
    raise;
end;
$$;

comment on function public.submit_application(jsonb, uuid) is
  'Public application intake. SECURITY DEFINER because anon has no SELECT on applicants and therefore cannot use INSERT ... RETURNING. Idempotent on p_submission_id (0019); one application per email address (0023).';

revoke all on function public.submit_application(jsonb, uuid) from public;
grant execute on function public.submit_application(jsonb, uuid) to anon, authenticated;

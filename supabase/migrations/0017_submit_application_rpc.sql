-- ===========================================================================
-- 0017 — Public application submission RPC
-- ===========================================================================
-- The public form used to `insert ... select()` straight into `applicants`.
-- The insert itself was permitted by `applicants_insert_public` (0009), but
-- PostgreSQL applies a table's *SELECT* policies to the RETURNING clause of an
-- INSERT, and `anon` deliberately has no SELECT policy on `applicants`. The
-- result was a submission that failed with
--
--   42501  new row violates row-level security policy for table "applicants"
--
-- even though the row was legal — the row was rejected on the way back out,
-- not on the way in.
--
-- Dropping RETURNING is not an option: the applicant has to be told their
-- reference number, and the upload step needs the new row's id. So submission
-- moves behind a SECURITY DEFINER function, the same shape as
-- check_application_status() — it returns exactly the two values the
-- confirmation screen needs and nothing else, so no PII read path is opened.
--
-- Every column an anonymous submitter must not control (status, reviewed_by,
-- rating, notes, archived_at, …) is hardcoded here rather than read from the
-- payload, which reproduces the WITH CHECK predicate of the RLS policy by
-- construction. The BEFORE INSERT triggers from 0007 still run, so
-- reference_no and purge_after are generated as usual.
-- ===========================================================================

create or replace function public.submit_application(p_payload jsonb)
returns table (id uuid, reference_no text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id  uuid;
  v_ref text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'submit_application expects a JSON object payload';
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
    -- Pinned, never taken from the payload.
    status, reviewed_by, interview_at, interview_notes,
    rating, rejection_reason, internal_notes, archived_at
  )
  values (
    btrim(p_payload ->> 'first_name'),
    nullif(btrim(coalesce(p_payload ->> 'middle_name', '')), ''),
    btrim(p_payload ->> 'last_name'),
    nullif(btrim(coalesce(p_payload ->> 'suffix', '')), ''),
    lower(btrim(p_payload ->> 'email')),
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

    'pending'::public.applicant_status, null, null, null,
    null, null, null, null
  )
  returning applicants.id, applicants.reference_no
  into v_id, v_ref;

  return query select v_id, v_ref;
end;
$$;

comment on function public.submit_application(jsonb) is
  'Public application intake. SECURITY DEFINER because anon has no SELECT on applicants and therefore cannot use INSERT ... RETURNING; returns only the new id and reference number.';

revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;

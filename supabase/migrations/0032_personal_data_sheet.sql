-- ===========================================================================
-- 0032 — Personal Data Sheet: the rest of the agency's paper application
-- ===========================================================================
-- The agency's "Personal Data Sheet" (docs/APPLICATION (SECURITY).docx) asks
-- for much more than the system stored: place of birth, religion, parents,
-- spouse, emergency contact, education, security trainings, PNP/military
-- service, dependents, employment background, character references, badge and
-- licence control numbers, residence certificate, and the yes/no questions.
--
-- Every one of those is now a column on BOTH applicants and personnel:
--   * the public form (/apply) collects them, through submit_application;
--   * staff see and edit them on the applicant and personnel pages;
--   * a guard added straight to the roster (no application) has them too.
--
-- 0031 kept a hired applicant and their personnel record identical for a
-- handful of fields. That sync is rewritten here around ONE list of shared
-- columns (pds_shared_columns), so every field above — plus civil status,
-- height, weight and education, which the roster lacked — stays the same on
-- both sides. Hiring copies all of them across.
--
-- The four lists (trainings, dependents, employment, references) are jsonb
-- arrays of flat objects: they are always read and written with the person,
-- are short (the paper form has five lines each), and never queried alone.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Minimum age: checked on new applications, not on every later edit
-- ---------------------------------------------------------------------------
-- 0026 meant to grandfather applicants already on file who are under 21, and
-- added applicants_age_chk NOT VALID for it. But Postgres re-checks a NOT VALID
-- constraint on every UPDATE of a row, so any edit to such an applicant failed
-- — and with the roster sync, so did any edit to their personnel record (and
-- the backfill at the end of this migration).
--
-- Same rule, now as a trigger: enforced when an application is created and
-- whenever a date of birth is changed, and nowhere else.
alter table public.applicants drop constraint if exists applicants_age_chk;

create or replace function public.enforce_applicant_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date)
     and new.birth_date > (current_date - interval '21 years') then
    raise exception 'Applicants must be at least 21 years old.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_min_age on public.applicants;
create trigger enforce_min_age
  before insert or update of birth_date on public.applicants
  for each row execute function public.enforce_applicant_min_age();

comment on function public.enforce_applicant_min_age() is
  'Applicants must be 21 or older (0026), checked on insert and when birth_date changes, so applicants already on file stay editable (0032).';

update public.settings
   set description = 'Minimum applicant age. Also enforced by the enforce_min_age trigger on applicants (0032).',
       updated_at = now()
 where key = 'recruitment.min_age';

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
do $$
declare
  d text;
begin
  foreach d in array array[
    'place_of_birth text',
    'provincial_address text',
    'religion text',
    'father_name text',
    'father_occupation text',
    'mother_name text',
    'mother_occupation text',
    'parents_address text',
    'spouse_name text',
    'spouse_occupation text',
    'spouse_address text',
    'special_skills text',
    'has_loans boolean',
    'loan_details text',
    'badge_no text',
    'license_control_no text',
    'res_cert_no text',
    'res_cert_issued_on date',
    'res_cert_issued_at text',
    -- personnel already has name and phone (0005); applicants gain them.
    'emergency_contact_name text',
    'emergency_contact_phone text',
    'emergency_contact_relationship text',
    'emergency_contact_occupation text',
    'date_graduated text',
    'school_name text',
    'course text',
    'military_pnp boolean',
    'military_afp boolean',
    'military_rotc boolean',
    'military_branch text',
    'military_serial_no text',
    'military_rank text',
    'military_status text',
    'military_years_service smallint',
    'military_reason_leaving text',
    'recommended_by text',
    'has_criminal_record boolean',
    'criminal_record_details text',
    'drinks_alcohol boolean',
    'smokes boolean',
    'health_problems text',
    'willing_background_check boolean',
    'willing_any_assignment boolean',
    $c$trainings jsonb not null default '[]'::jsonb$c$,
    $c$dependents jsonb not null default '[]'::jsonb$c$,
    $c$employment_history jsonb not null default '[]'::jsonb$c$,
    $c$character_references jsonb not null default '[]'::jsonb$c$
  ]
  loop
    execute 'alter table public.applicants add column if not exists ' || d;
    execute 'alter table public.personnel add column if not exists ' || d;
  end loop;
end;
$$;

-- What the application already had and the roster did not.
alter table public.personnel
  add column if not exists civil_status      public.civil_status,
  add column if not exists height_cm         numeric(5, 2),
  add column if not exists weight_kg         numeric(5, 2),
  add column if not exists highest_education text;

-- Lists are arrays, no longer than the paper form allows.
do $$
declare
  t text;
begin
  foreach t in array array['applicants', 'personnel'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pds_chk');
    execute format($f$
      alter table public.%I add constraint %I check (
            jsonb_typeof(trainings) = 'array'            and jsonb_array_length(trainings) <= 5
        and jsonb_typeof(dependents) = 'array'           and jsonb_array_length(dependents) <= 10
        and jsonb_typeof(employment_history) = 'array'   and jsonb_array_length(employment_history) <= 5
        and jsonb_typeof(character_references) = 'array' and jsonb_array_length(character_references) <= 5
        and (military_years_service is null or military_years_service between 0 and 60)
      )$f$, t, t || '_pds_chk');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The fields an application and its personnel record share
-- ---------------------------------------------------------------------------
-- Address is not listed: it is stored differently on each side (0031) and
-- handled explicitly by the sync functions.
create or replace function public.pds_shared_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'middle_name', 'last_name', 'suffix',
    'email', 'phone', 'birth_date', 'sex',
    'civil_status', 'height_cm', 'weight_kg', 'highest_education',
    'sss_no', 'philhealth_no', 'pagibig_no', 'tin_no',
    'security_license_no', 'security_license_expiry',
    'place_of_birth', 'provincial_address', 'religion',
    'father_name', 'father_occupation', 'mother_name', 'mother_occupation', 'parents_address',
    'spouse_name', 'spouse_occupation', 'spouse_address',
    'special_skills', 'has_loans', 'loan_details',
    'badge_no', 'license_control_no',
    'res_cert_no', 'res_cert_issued_on', 'res_cert_issued_at',
    'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relationship', 'emergency_contact_occupation',
    'date_graduated', 'school_name', 'course',
    'military_pnp', 'military_afp', 'military_rotc', 'military_branch',
    'military_serial_no', 'military_rank', 'military_status',
    'military_years_service', 'military_reason_leaving',
    'recommended_by', 'has_criminal_record', 'criminal_record_details',
    'drinks_alcohol', 'smokes', 'health_problems',
    'willing_background_check', 'willing_any_assignment',
    'trainings', 'dependents', 'employment_history', 'character_references'
  ]::text[]
$$;

comment on function public.pds_shared_columns() is
  'Columns kept identical between an application and the personnel record it became (0031, 0032).';

-- Writes the keys of p_patch onto the row(s) of p_table where p_key_column =
-- p_key, and only when something actually differs — so a sync never writes
-- (or audits) a no-op.
create or replace function public.pds_apply(
  p_table      text,
  p_key_column text,
  p_key        uuid,
  p_patch      jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cols text;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    return;
  end if;

  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(p_patch) k;

  execute format(
    'update public.%1$I t
        set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1))
      where t.%3$I = $2
        and (select jsonb_object_agg(k, to_jsonb(t) -> k) from jsonb_object_keys($1) k)
            is distinct from $1',
    p_table, v_cols, p_key_column)
  using p_patch, p_key;
end;
$$;

revoke all on function public.pds_apply(text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sync, now covering every shared field (replaces 0031's bodies)
-- ---------------------------------------------------------------------------
-- Restated from 0031 so this migration stands on its own if 0031 was skipped.
create or replace function public.applicant_address_text(a public.applicants)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    concat_ws(', ',
      nullif(btrim(a.address_line), ''),
      nullif(btrim(a.barangay), ''),
      nullif(btrim(a.city_municipality), ''),
      nullif(btrim(a.province), '')),
    '')
$$;

create or replace function public.sync_applicant_to_personnel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new   jsonb := to_jsonb(new);
  v_patch jsonb;
begin
  -- Fired by the personnel -> application sync below: nothing to send back.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select jsonb_object_agg(c, v_new -> c) into v_patch
    from unnest(public.pds_shared_columns()) c;
  v_patch := v_patch || jsonb_build_object('address', public.applicant_address_text(new));

  perform public.pds_apply('personnel', 'applicant_id', new.id, v_patch);
  return null;
end;
$$;

create or replace function public.sync_personnel_to_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new   jsonb := to_jsonb(new);
  v_patch jsonb;
  v_app   public.applicants;
  v_blank text[];
begin
  if pg_trigger_depth() > 1 or new.applicant_id is null then
    return null;
  end if;

  select * into v_app from public.applicants where id = new.applicant_id;
  if not found then
    return null;
  end if;

  select jsonb_object_agg(c, v_new -> c) into v_patch
    from unnest(public.pds_shared_columns()) c;

  -- Required on an application. A blank on the roster keeps what the
  -- application has rather than failing the edit.
  select coalesce(array_agg(k), '{}') into v_blank
    from unnest(array['email', 'phone', 'birth_date', 'sex']) k
   where v_new -> k = 'null'::jsonb;
  v_patch := v_patch - v_blank;

  if new.security_license_no is distinct from old.security_license_no then
    v_patch := v_patch || jsonb_build_object('is_licensed', new.security_license_no is not null);
  end if;

  -- Only a real rewrite of the roster's address line replaces the
  -- application's parts; a value that already matches them leaves them alone.
  if new.address is distinct from old.address
     and new.address is distinct from public.applicant_address_text(v_app) then
    v_patch := v_patch || jsonb_build_object(
      'address_line', new.address, 'barangay', null, 'city_municipality', null,
      'province', null, 'region', null, 'postal_code', null);
  end if;

  perform public.pds_apply('applicants', 'id', new.applicant_id, v_patch);
  return null;
end;
$$;

drop trigger if exists sync_to_personnel on public.applicants;
create trigger sync_to_personnel
  after update on public.applicants
  for each row execute function public.sync_applicant_to_personnel();

drop trigger if exists sync_to_applicant on public.personnel;
create trigger sync_to_applicant
  after update on public.personnel
  for each row execute function public.sync_personnel_to_applicant();

revoke all on function public.sync_applicant_to_personnel() from public, anon, authenticated;
revoke all on function public.sync_personnel_to_applicant() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hiring copies every shared field (replaces 0031's address-only trigger)
-- ---------------------------------------------------------------------------
-- promote_applicant_to_personnel() writes the core fields itself; this fills
-- the rest from the application before the row is stored.
create or replace function public.personnel_copy_from_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app   public.applicants;
  v_a     jsonb;
  v_patch jsonb;
begin
  if new.applicant_id is null then
    return new;
  end if;

  select * into v_app from public.applicants where id = new.applicant_id;
  if not found then
    return new;
  end if;

  v_a := to_jsonb(v_app);
  select jsonb_object_agg(c, v_a -> c) into v_patch
    from unnest(public.pds_shared_columns()) c;

  new := jsonb_populate_record(new, jsonb_strip_nulls(v_patch));
  if new.address is null then
    new.address := public.applicant_address_text(v_app);
  end if;
  return new;
end;
$$;

drop trigger if exists address_from_applicant on public.personnel;
drop function if exists public.personnel_address_from_applicant();

drop trigger if exists copy_from_applicant on public.personnel;
create trigger copy_from_applicant
  before insert on public.personnel
  for each row execute function public.personnel_copy_from_applicant();

revoke all on function public.personnel_copy_from_applicant() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public intake: clean the Personal Data Sheet part of the payload
-- ---------------------------------------------------------------------------
-- Takes only known keys, trims text, turns blanks into nulls, drops empty list
-- rows, and caps lengths — the anonymous form is not trusted to have done so.
create or replace function public.pds_from_payload(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_text constant text[] := array[
    'place_of_birth', 'provincial_address', 'religion',
    'father_name', 'father_occupation', 'mother_name', 'mother_occupation', 'parents_address',
    'spouse_name', 'spouse_occupation', 'spouse_address',
    'special_skills', 'loan_details', 'badge_no', 'license_control_no',
    'res_cert_no', 'res_cert_issued_at',
    'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relationship', 'emergency_contact_occupation',
    'date_graduated', 'school_name', 'course',
    'military_branch', 'military_serial_no', 'military_rank', 'military_status',
    'military_reason_leaving', 'recommended_by', 'criminal_record_details', 'health_problems'
  ];
  c_bool constant text[] := array[
    'has_loans', 'military_pnp', 'military_afp', 'military_rotc', 'has_criminal_record',
    'drinks_alcohol', 'smokes', 'willing_background_check', 'willing_any_assignment'
  ];
  c_lists constant jsonb := $j${
    "trainings":            {"max": 5,  "label": "security trainings",    "fields": ["training", "school", "dates"]},
    "dependents":           {"max": 10, "label": "dependents",            "fields": ["name", "birth_date", "relationship", "address"]},
    "employment_history":   {"max": 5,  "label": "previous employers",    "fields": ["employer", "from", "to", "salary", "reason"]},
    "character_references": {"max": 5,  "label": "character references",  "fields": ["name", "company", "position", "contact"]}
  }$j$;
  v_out   jsonb := '{}';
  k       text;
  v_text  text;
  v_list  text;
  v_spec  jsonb;
  v_items jsonb;
  v_item  jsonb;
  v_clean jsonb;
  f       text;
begin
  foreach k in array c_text loop
    v_text := nullif(btrim(coalesce(p ->> k, '')), '');
    if length(v_text) > 300 then
      raise exception '% is too long (300 characters at most).', initcap(replace(k, '_', ' '))
        using errcode = 'P0001';
    end if;
    v_out := v_out || jsonb_build_object(k, v_text);
  end loop;

  foreach k in array c_bool loop
    v_out := v_out || jsonb_build_object(k,
      case lower(coalesce(p ->> k, '')) when 'true' then true when 'false' then false end);
  end loop;

  v_out := v_out || jsonb_build_object(
    'res_cert_issued_on', nullif(btrim(coalesce(p ->> 'res_cert_issued_on', '')), '')::date,
    'military_years_service', nullif(btrim(coalesce(p ->> 'military_years_service', '')), '')::smallint);

  for v_list, v_spec in select key, value from jsonb_each(c_lists) loop
    v_items := '[]';
    if jsonb_typeof(p -> v_list) = 'array' then
      for v_item in select value from jsonb_array_elements(p -> v_list) loop
        continue when jsonb_typeof(v_item) <> 'object';
        v_clean := '{}';
        for f in select jsonb_array_elements_text(v_spec -> 'fields') loop
          v_text := btrim(coalesce(v_item ->> f, ''));
          if length(v_text) > 300 then
            raise exception 'An entry in % is too long (300 characters at most).', v_spec ->> 'label'
              using errcode = 'P0001';
          end if;
          if f = 'birth_date' and v_text <> '' then
            v_text := (v_text::date)::text;
          end if;
          v_clean := v_clean || jsonb_build_object(f, v_text);
        end loop;
        -- A row left completely blank is not an entry.
        continue when not exists (
          select 1 from jsonb_each_text(v_clean) e where e.value <> '');
        v_items := v_items || jsonb_build_array(v_clean);
      end loop;
    end if;
    if jsonb_array_length(v_items) > (v_spec ->> 'max')::int then
      raise exception 'Please list at most % %.', v_spec ->> 'max', v_spec ->> 'label'
        using errcode = 'P0001';
    end if;
    v_out := v_out || jsonb_build_object(v_list, v_items);
  end loop;

  return v_out;
end;
$$;

-- submit_application (0024) with the Personal Data Sheet added. The row is
-- written in one INSERT, so the audit log records a single creation.
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
  v_pds   jsonb;
  v_row   jsonb;
  v_cols  text;
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

  if v_state <> 'available' then
    raise exception '%', public.email_ineligible_message(v_state, v_email)
      using errcode = 'P0001';
  end if;

  -- Personal Data Sheet (0032). The form requires these; so does intake.
  v_pds := public.pds_from_payload(p_payload);
  if v_pds ->> 'place_of_birth' is null then
    raise exception 'Place of birth is required.' using errcode = 'P0001';
  end if;
  if v_pds ->> 'emergency_contact_name' is null
     or v_pds ->> 'emergency_contact_relationship' is null
     or v_pds ->> 'emergency_contact_phone' is null then
    raise exception 'An emergency contact (name, relationship and number) is required.'
      using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_pds -> 'character_references') = 0 then
    raise exception 'At least one character reference is required.' using errcode = 'P0001';
  end if;

  -- jsonb_build_object takes at most 100 arguments, hence the pieces.
  v_row :=
    jsonb_build_object(
      'first_name',   btrim(p_payload ->> 'first_name'),
      'middle_name',  nullif(btrim(coalesce(p_payload ->> 'middle_name', '')), ''),
      'last_name',    btrim(p_payload ->> 'last_name'),
      'suffix',       nullif(btrim(coalesce(p_payload ->> 'suffix', '')), ''),
      'email',        v_email,
      'phone',        btrim(p_payload ->> 'phone'),
      'birth_date',   (p_payload ->> 'birth_date')::date,
      'sex',          (p_payload ->> 'sex')::public.sex_type,
      'civil_status', nullif(btrim(coalesce(p_payload ->> 'civil_status', '')), '')::public.civil_status,
      'height_cm',    nullif(btrim(coalesce(p_payload ->> 'height_cm', '')), '')::numeric,
      'weight_kg',    nullif(btrim(coalesce(p_payload ->> 'weight_kg', '')), '')::numeric)
    || jsonb_build_object(
      'address_line',      nullif(btrim(coalesce(p_payload ->> 'address_line', '')), ''),
      'barangay',          nullif(btrim(coalesce(p_payload ->> 'barangay', '')), ''),
      'city_municipality', btrim(p_payload ->> 'city_municipality'),
      'province',          nullif(btrim(coalesce(p_payload ->> 'province', '')), ''),
      'region',            nullif(btrim(coalesce(p_payload ->> 'region', '')), ''),
      'postal_code',       nullif(btrim(coalesce(p_payload ->> 'postal_code', '')), ''))
    || jsonb_build_object(
      'position_id',         (p_payload ->> 'position_id')::uuid,
      'preferred_branch_id', nullif(btrim(coalesce(p_payload ->> 'preferred_branch_id', '')), '')::uuid,
      'years_experience',    coalesce(nullif(btrim(coalesce(p_payload ->> 'years_experience', '')), '')::smallint, 0),
      'highest_education',   nullif(btrim(coalesce(p_payload ->> 'highest_education', '')), ''),
      'expected_salary',     nullif(btrim(coalesce(p_payload ->> 'expected_salary', '')), '')::numeric,
      'availability_date',   nullif(btrim(coalesce(p_payload ->> 'availability_date', '')), '')::date,
      'source',              nullif(btrim(coalesce(p_payload ->> 'source', '')), ''))
    || jsonb_build_object(
      'sss_no',                  nullif(btrim(coalesce(p_payload ->> 'sss_no', '')), ''),
      'philhealth_no',           nullif(btrim(coalesce(p_payload ->> 'philhealth_no', '')), ''),
      'pagibig_no',              nullif(btrim(coalesce(p_payload ->> 'pagibig_no', '')), ''),
      'tin_no',                  nullif(btrim(coalesce(p_payload ->> 'tin_no', '')), ''),
      'nbi_clearance_no',        nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_no', '')), ''),
      'nbi_clearance_expiry',    nullif(btrim(coalesce(p_payload ->> 'nbi_clearance_expiry', '')), '')::date,
      'police_clearance_no',     nullif(btrim(coalesce(p_payload ->> 'police_clearance_no', '')), ''),
      'security_license_no',     nullif(btrim(coalesce(p_payload ->> 'security_license_no', '')), ''),
      'security_license_expiry', nullif(btrim(coalesce(p_payload ->> 'security_license_expiry', '')), '')::date,
      'is_licensed',             coalesce((p_payload ->> 'is_licensed')::boolean, false),
      'submission_id',           p_submission_id,
      -- Pinned, never taken from the payload.
      'status',                  'pending')
    || v_pds;

  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_row) k;

  execute format(
    'insert into public.applicants (%1$s)
     select %1$s from jsonb_populate_record(null::public.applicants, $1)
     returning id, reference_no',
    v_cols)
  using v_row
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
  'Public application intake. SECURITY DEFINER because anon has no SELECT on applicants and therefore cannot use INSERT ... RETURNING. Idempotent on p_submission_id (0019); one open application per email address (0023), with a cool-down after rejection (0024); Personal Data Sheet with required place of birth, emergency contact and a character reference (0032).';

revoke all on function public.submit_application(jsonb, uuid) from public;
grant execute on function public.submit_application(jsonb, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Bring existing hires in line
-- ---------------------------------------------------------------------------
-- Emergency contacts were roster-only until now, so they go to the
-- application first. That update fires the application -> personnel sync for
-- every hire, which also gives the roster the civil status, height, weight and
-- education their application holds.
update public.applicants a
   set emergency_contact_name  = coalesce(a.emergency_contact_name, p.emergency_contact_name),
       emergency_contact_phone = coalesce(a.emergency_contact_phone, p.emergency_contact_phone)
  from public.personnel p
 where p.applicant_id = a.id;

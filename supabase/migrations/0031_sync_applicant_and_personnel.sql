-- ===========================================================================
-- 0031 — An application and the personnel record it became stay the same
-- ===========================================================================
-- Hiring (promote_applicant_to_personnel) copies the applicant's details into
-- a new personnel row once, and from then on the two drifted apart: a
-- correction made on the application never reached the roster, and the other
-- way round. The address was never copied at all, so every guard hired
-- through the pipeline had a blank roster address.
--
-- From here on, for a personnel row with applicant_id set:
--   * editing the application updates the personnel record, and
--   * editing the personnel record updates the application,
-- for the details both hold: name, contact, birth date, sex, address,
-- government numbers and security licence.
--
-- Triggers, not client code, so it holds whichever screen (or import, or SQL
-- console) does the writing, and in the same transaction as the edit.
-- pg_trigger_depth() stops the second table's trigger from bouncing the change
-- back. SECURITY DEFINER because the two tables admit different editors
-- (recruitment officers update applicants but not personnel); whoever may
-- edit one side keeps the other side consistent with it.
--
-- Address: the application stores it in parts, personnel as one line. The
-- application's parts are joined into the personnel line. When staff rewrite
-- the line on the personnel side, the application keeps that exact text in
-- address_line and its other parts are cleared, so both sides read the same.
--
-- Fields only one side has (employment, emergency contact on personnel;
-- position, clearances, measurements on the application) are not touched.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The application's address as one line, the way the roster shows it
-- ---------------------------------------------------------------------------
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

comment on function public.applicant_address_text(public.applicants) is
  'Street, barangay, city and province joined into the one-line address personnel stores (0031).';

-- ---------------------------------------------------------------------------
-- Application -> personnel
-- ---------------------------------------------------------------------------
create or replace function public.sync_applicant_to_personnel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text := public.applicant_address_text(new);
begin
  -- Fired by the personnel -> application sync below: nothing to send back.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  update public.personnel p
     set first_name              = new.first_name,
         middle_name             = new.middle_name,
         last_name               = new.last_name,
         suffix                  = new.suffix,
         email                   = new.email,
         phone                   = new.phone,
         birth_date              = new.birth_date,
         sex                     = new.sex,
         address                 = v_address,
         sss_no                  = new.sss_no,
         philhealth_no           = new.philhealth_no,
         pagibig_no              = new.pagibig_no,
         tin_no                  = new.tin_no,
         security_license_no     = new.security_license_no,
         security_license_expiry = new.security_license_expiry
   where p.applicant_id = new.id
     and (p.first_name, p.middle_name, p.last_name, p.suffix, p.email, p.phone,
          p.birth_date, p.sex, p.address, p.sss_no, p.philhealth_no,
          p.pagibig_no, p.tin_no, p.security_license_no, p.security_license_expiry)
         is distinct from
         (new.first_name, new.middle_name, new.last_name, new.suffix, new.email, new.phone,
          new.birth_date, new.sex, v_address, new.sss_no, new.philhealth_no,
          new.pagibig_no, new.tin_no, new.security_license_no, new.security_license_expiry);

  return null;
end;
$$;

drop trigger if exists sync_to_personnel on public.applicants;
create trigger sync_to_personnel
  after update on public.applicants
  for each row execute function public.sync_applicant_to_personnel();

-- ---------------------------------------------------------------------------
-- Personnel -> application
-- ---------------------------------------------------------------------------
create or replace function public.sync_personnel_to_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applicants;
  v_new_address boolean;
begin
  if pg_trigger_depth() > 1 or new.applicant_id is null then
    return null;
  end if;

  select * into v_app from public.applicants where id = new.applicant_id;
  if not found then
    return null;
  end if;

  -- Only a real rewrite of the line replaces the application's parts; a value
  -- that already matches them (e.g. one this sync wrote) leaves them alone.
  v_new_address := new.address is distinct from old.address
               and new.address is distinct from public.applicant_address_text(v_app);

  update public.applicants a
     set first_name              = new.first_name,
         middle_name             = new.middle_name,
         last_name               = new.last_name,
         suffix                  = new.suffix,
         -- Required on an application. A blank on the roster keeps what the
         -- application has rather than failing the edit.
         email                   = coalesce(new.email, a.email),
         phone                   = coalesce(new.phone, a.phone),
         birth_date              = coalesce(new.birth_date, a.birth_date),
         sex                     = coalesce(new.sex, a.sex),
         sss_no                  = new.sss_no,
         philhealth_no           = new.philhealth_no,
         pagibig_no              = new.pagibig_no,
         tin_no                  = new.tin_no,
         security_license_no     = new.security_license_no,
         security_license_expiry = new.security_license_expiry,
         is_licensed             = case
                                     when new.security_license_no is distinct from old.security_license_no
                                       then new.security_license_no is not null
                                     else a.is_licensed
                                   end,
         address_line            = case when v_new_address then new.address else a.address_line end,
         barangay                = case when v_new_address then null else a.barangay end,
         city_municipality       = case when v_new_address then null else a.city_municipality end,
         province                = case when v_new_address then null else a.province end,
         region                  = case when v_new_address then null else a.region end,
         postal_code             = case when v_new_address then null else a.postal_code end
   where a.id = new.applicant_id
     and (v_new_address
          or (a.first_name, a.middle_name, a.last_name, a.suffix, a.email, a.phone,
              a.birth_date, a.sex, a.sss_no, a.philhealth_no, a.pagibig_no, a.tin_no,
              a.security_license_no, a.security_license_expiry)
             is distinct from
             (new.first_name, new.middle_name, new.last_name, new.suffix,
              coalesce(new.email, a.email), coalesce(new.phone, a.phone),
              coalesce(new.birth_date, a.birth_date), coalesce(new.sex, a.sex),
              new.sss_no, new.philhealth_no, new.pagibig_no, new.tin_no,
              new.security_license_no, new.security_license_expiry));

  return null;
end;
$$;

drop trigger if exists sync_to_applicant on public.personnel;
create trigger sync_to_applicant
  after update on public.personnel
  for each row execute function public.sync_personnel_to_applicant();

-- ---------------------------------------------------------------------------
-- Hiring: carry the address across too
-- ---------------------------------------------------------------------------
-- promote_applicant_to_personnel() predates personnel.address (0029) and does
-- not set it. Filled here instead of redefining that function.
create or replace function public.personnel_address_from_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.applicant_id is not null and new.address is null then
    select public.applicant_address_text(a) into new.address
      from public.applicants a
     where a.id = new.applicant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists address_from_applicant on public.personnel;
create trigger address_from_applicant
  before insert on public.personnel
  for each row execute function public.personnel_address_from_applicant();

revoke all on function public.sync_applicant_to_personnel() from public, anon, authenticated;
revoke all on function public.sync_personnel_to_applicant() from public, anon, authenticated;
revoke all on function public.personnel_address_from_applicant() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bring existing hires in line
-- ---------------------------------------------------------------------------
-- Until now neither side's shared details could be edited from the console,
-- so the application is the record of truth: copy it onto each personnel row
-- it produced (this also fills the missing addresses). The personnel trigger
-- this fires finds the application already matching and writes nothing.
update public.personnel p
   set first_name              = a.first_name,
       middle_name             = a.middle_name,
       last_name               = a.last_name,
       suffix                  = a.suffix,
       email                   = a.email,
       phone                   = a.phone,
       birth_date              = a.birth_date,
       sex                     = a.sex,
       address                 = coalesce(public.applicant_address_text(a), p.address),
       sss_no                  = a.sss_no,
       philhealth_no           = a.philhealth_no,
       pagibig_no              = a.pagibig_no,
       tin_no                  = a.tin_no,
       security_license_no     = a.security_license_no,
       security_license_expiry = a.security_license_expiry
  from public.applicants a
 where a.id = p.applicant_id
   and (p.first_name, p.middle_name, p.last_name, p.suffix, p.email, p.phone,
        p.birth_date, p.sex, p.address, p.sss_no, p.philhealth_no,
        p.pagibig_no, p.tin_no, p.security_license_no, p.security_license_expiry)
       is distinct from
       (a.first_name, a.middle_name, a.last_name, a.suffix, a.email, a.phone,
        a.birth_date, a.sex, coalesce(public.applicant_address_text(a), p.address),
        a.sss_no, a.philhealth_no, a.pagibig_no, a.tin_no,
        a.security_license_no, a.security_license_expiry);

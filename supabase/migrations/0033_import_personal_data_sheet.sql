-- ===========================================================================
-- 0033 — Personnel import carries the whole Personal Data Sheet
-- ===========================================================================
-- The import template now has a column for every Personal Data Sheet field
-- (0032), laid out in the paper form's order, so an existing guard's full
-- sheet can be loaded in the same pass as their roster entry.
--
-- import_personnel_row (0029) is restated with one addition: after the person
-- is created, the Personal Data Sheet part of the row is cleaned by
-- pds_from_payload (0032 — the same rules as the public form: trimmed, blank
-- rows dropped, lengths and list sizes capped) and written in the same
-- transaction. A row that fails leaves nothing behind, as before.
-- ===========================================================================

create or replace function public.import_personnel_row(p_row jsonb)
returns public.personnel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       public.personnel;
  v_status    text := lower(coalesce(nullif(btrim(p_row ->> 'status'), ''), 'active'));
  v_date      date := coalesce(nullif(p_row ->> 'status_date', '')::date, current_date);
  v_reason    text := nullif(btrim(coalesce(p_row ->> 'status_reason', '')), '');
  v_offense   text := nullif(btrim(coalesce(p_row ->> 'violation', '')), '');
  v_pds       jsonb;
begin
  -- Checks the caller is an administrator or HR.
  v_row := public.add_existing_personnel(
    p_row,
    nullif(p_row ->> 'branch_id', '')::uuid,
    coalesce(nullif(p_row ->> 'shift', ''), 'day')::public.shift_type,
    p_row ->> 'post'
  );

  -- Personal Data Sheet (0032), plus what the roster gained with it.
  v_pds := public.pds_from_payload(p_row)
    || jsonb_build_object(
      'civil_status',      nullif(lower(btrim(coalesce(p_row ->> 'civil_status', ''))), '')::public.civil_status,
      'height_cm',         nullif(btrim(coalesce(p_row ->> 'height_cm', '')), '')::numeric,
      'weight_kg',         nullif(btrim(coalesce(p_row ->> 'weight_kg', '')), '')::numeric,
      'highest_education', nullif(btrim(coalesce(p_row ->> 'highest_education', '')), ''));
  -- add_existing_personnel already saved these two; keep its values.
  v_pds := v_pds - 'emergency_contact_name' - 'emergency_contact_phone';
  perform public.pds_apply('personnel', 'id', v_row.id, v_pds);

  if v_offense is not null then
    perform public.record_personnel_violation(
      v_row.id,
      v_offense,
      coalesce(nullif(btrim(coalesce(p_row ->> 'violation_details', '')), ''), v_offense),
      coalesce(nullif(p_row ->> 'violation_date', '')::date, v_date)
    );
  end if;

  case v_status
    when 'active' then
      null;
    when 'on_leave' then
      update public.personnel
         set employment_status = 'on_leave', status_effective_date = v_date
       where id = v_row.id;
    when 'suspended' then
      perform public.suspend_personnel(v_row.id, v_reason, v_date, null);
    when 'resigned', 'terminated' then
      perform public.separate_personnel(v_row.id, v_status, v_date, v_reason);
    when 'blocklisted' then
      perform public.blocklist_personnel(v_row.id, v_reason, v_date);
    else
      raise exception 'Unknown status "%". Use Active, On leave, Suspended, Resigned, Terminated or Blocklisted.',
        p_row ->> 'status';
  end case;

  select * into v_row from public.personnel where id = v_row.id;
  return v_row;
end;
$$;

comment on function public.import_personnel_row(jsonb) is
  'CSV/XLSX import (0029): creates one existing guard with facility, status, optional violation and the full Personal Data Sheet (0033) in a single transaction. Administrators and HR only (checked by add_existing_personnel).';

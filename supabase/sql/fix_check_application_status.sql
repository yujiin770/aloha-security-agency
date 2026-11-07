-- ===========================================================================
-- Repair: recreate public.check_application_status
-- ===========================================================================
-- For a database where migration 0013 ran its "drop function" step but the
-- function was never recreated (symptom on the public status page:
-- "Could not find the function public.check_application_status(p_last_name,
-- p_reference_no) in the schema cache").
--
-- Do NOT re-run 0013 instead: its columns are already migrated, so it fails on
-- personnel.rank_title — and if forced through, it would overwrite the newer
-- promote_applicant_to_personnel (0015/0022) and v_branch_staffing (0019).
--
-- Safe to run more than once. Paste into the Supabase SQL Editor.
-- ===========================================================================

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

-- Make the API see it immediately.
notify pgrst, 'reload schema';

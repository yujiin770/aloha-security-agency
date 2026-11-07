-- ===========================================================================
-- 0025 — Tell rejected applicants when they may apply again
-- ===========================================================================
-- 0024 introduced the re-apply cool-down (setting
-- `recruitment.reapply_after_months`, default 6). This makes it visible:
--
--   1. The application form's message for a rejected address now also points
--      the applicant to HR, matching the wording used for current personnel.
--   2. `applicant_reapply_date()` lets staff (and so the rejection email, which
--      is sent from the staff console) quote the exact date the database will
--      enforce — computed by the same email_reapply_date() the form uses, so the
--      email and the form can never name different days.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Form message
-- ---------------------------------------------------------------------------
-- Body is 0024's; only the 'rejected' sentence changed.
create or replace function public.email_ineligible_message(p_state text, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_state = 'available' then null
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

-- ---------------------------------------------------------------------------
-- 2. Re-apply date for one applicant (staff only)
-- ---------------------------------------------------------------------------
-- Keyed by applicant id, not email, so it cannot be used to probe addresses.
-- Returns null if the applicant does not exist, was never rejected, or the
-- caller is not staff.
create or replace function public.applicant_reapply_date(p_applicant_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select public.email_reapply_date(a.email)
    from public.applicants a
   where a.id = p_applicant_id
     and public.is_staff();
$$;

comment on function public.applicant_reapply_date(uuid) is
  'Date from which this applicant''s email may be used to apply again after a rejection (0025). Staff only; quoted in the rejection email.';

revoke all on function public.applicant_reapply_date(uuid) from public, anon;
grant execute on function public.applicant_reapply_date(uuid) to authenticated;

notify pgrst, 'reload schema';

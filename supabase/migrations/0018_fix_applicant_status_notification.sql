-- ===========================================================================
-- 0018 — Repair log_applicant_status_change() after the positions refactor
-- ===========================================================================
-- 0013 replaced the `position_applied` enum column on `applicants` with a
-- `position_id` FK into the new `positions` table, and dropped both the column
-- (0013:205) and the `position_type` enum (0013:244).
--
-- Every dependent object was recreated there except one: the AFTER trigger
-- function `log_applicant_status_change()`, defined in 0007 and never touched
-- since, still builds its notification body from `new.position_applied`.
--
-- plpgsql resolves record fields lazily, at execution rather than at creation,
-- so the breakage was invisible until the right branch ran. The INSERT branch
-- never touches the field, which is why public submissions through
-- `submit_application` kept working; but any UPDATE that changes `status`
-- reaches the notification INSERT and raises
--
--     record "new" has no field "position_applied"
--
-- That blocked the whole status pipeline: single moves from the applicant
-- detail page, `bulkUpdateStatus`, and `promote_applicant_to_personnel` (which
-- sets status = 'hired' as its last step).
--
-- The body below is 0007's, with the one expression replaced by a lookup
-- against `positions`. `position_id` is nullable, so the lookup is wrapped in
-- coalesce rather than joined — a notification is worth sending even when the
-- applicant did not name a position.
-- ===========================================================================

create or replace function public.log_applicant_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, (select auth.uid()), 'Application submitted');
  elsif new.status is distinct from old.status then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, (select auth.uid()), new.rejection_reason);

    -- Fan a notification out to every recruitment-facing staff member.
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    select
      ur.user_id,
      'applicant_status_changed'::public.notification_type,
      'Applicant ' || new.reference_no || ' moved to ' || new.status,
      new.first_name || ' ' || new.last_name || ' — ' ||
        coalesce(
          (select p.name from public.positions p where p.id = new.position_id),
          'Position unspecified'
        ),
      'applicant', new.id, '/admin/applicants/' || new.id
    from public.user_roles ur
    where ur.role in ('hr_staff', 'recruitment_officer', 'admin', 'owner')
      and ur.user_id is distinct from (select auth.uid());
  end if;

  return new;
end;
$$;

comment on function public.log_applicant_status_change is
  'Writes applicant_status_history and fans out notifications on status change. Repaired in 0018: reads positions.name via position_id instead of the position_applied column dropped in 0013.';

-- The trigger itself is unchanged and still bound to this function by name, so
-- `create or replace` above is enough. Recreated defensively in case an
-- environment lost it.
drop trigger if exists log_applicant_status_change on public.applicants;
create trigger log_applicant_status_change
  after insert or update of status on public.applicants
  for each row execute function public.log_applicant_status_change();

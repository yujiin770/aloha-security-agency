-- ===========================================================================
-- 0021 — Notifications actually reach the people who need them
-- ===========================================================================
-- Three defects, all of which show up as "the bell never rings for the owner".
--
-- 1. Nothing ever inserted an `applicant_submitted` notification. The enum
--    value has existed since 0001 and the INSERT branch of
--    log_applicant_status_change() writes only status history — so a brand new
--    application, the single event an agency most wants to know about, produced
--    no notification for anyone. An owner who is not also the person moving
--    applicants through the pipeline therefore saw an empty panel forever.
--
-- 2. The status-change fan-out matched `ur.role in ('hr_staff', …)` against the
--    raw grant. Since 0020 a role is a row and a custom role carries its
--    privileges through `roles.inherits_from`, so someone holding a custom role
--    that inherits `owner` was silently skipped. Resolving through inheritance
--    here matches how has_role() decides everything else.
--
-- 3. `v_personnel_roster` and `v_branch_staffing` were dropped and recreated in
--    0013 (0013:181-182). DROP takes the grants with it and 0013 never restored
--    them, unlike the functions it recreated alongside. Re-granted below; this
--    is idempotent and harmless where Supabase's default privileges already
--    covered it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Who should hear about recruitment activity
-- ---------------------------------------------------------------------------
-- One definition, used by both triggers below, resolving custom roles the same
-- way has_role() does. Excludes the actor: being told about your own click is
-- noise, not information.
create or replace function public.recruitment_audience(p_exclude uuid default null)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct ur.user_id
    from public.user_roles ur
    join public.roles r on r.key = ur.role
    join public.profiles p on p.id = ur.user_id
   where p.is_active
     and coalesce(r.inherits_from::text, r.key) in (
       'owner', 'admin', 'hr_staff', 'recruitment_officer'
     )
     and (p_exclude is null or ur.user_id <> p_exclude);
$$;

comment on function public.recruitment_audience(uuid) is
  'Active staff who should be notified about recruitment activity, resolved through roles.inherits_from so custom roles are included (0021).';

-- Called only from the trigger below, which is itself SECURITY DEFINER. No
-- client needs it, and it reads the full role table, so it is not exposed.
revoke all on function public.recruitment_audience(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A new application notifies the recruitment team
-- ---------------------------------------------------------------------------
-- Runs inside submit_application() (0017), which is SECURITY DEFINER, so the
-- anonymous submitter can write notification rows they will never be able to
-- read — notifications are select-scoped to their owner by 0009.
create or replace function public.log_applicant_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position text;
begin
  select p.name into v_position
    from public.positions p where p.id = new.position_id;
  v_position := coalesce(v_position, 'Position unspecified');

  if tg_op = 'INSERT' then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, (select auth.uid()), 'Application submitted');

    -- New in 0021. auth.uid() is null for a public submission, so the exclusion
    -- inside recruitment_audience() is a no-op here and everyone is notified.
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    select
      audience,
      'applicant_submitted'::public.notification_type,
      'New application ' || new.reference_no,
      new.first_name || ' ' || new.last_name || ' — ' || v_position,
      'applicant', new.id, '/admin/applicants/' || new.id
    from public.recruitment_audience((select auth.uid())) as t(audience);

  elsif new.status is distinct from old.status then
    insert into public.applicant_status_history (applicant_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, (select auth.uid()), new.rejection_reason);

    insert into public.notifications (user_id, type, title, body, entity_type, entity_id, link)
    select
      audience,
      'applicant_status_changed'::public.notification_type,
      'Applicant ' || new.reference_no || ' moved to ' || new.status,
      new.first_name || ' ' || new.last_name || ' — ' || v_position,
      'applicant', new.id, '/admin/applicants/' || new.id
    from public.recruitment_audience((select auth.uid())) as t(audience);
  end if;

  return new;
end;
$$;

comment on function public.log_applicant_status_change is
  'Writes applicant_status_history and fans notifications out to the recruitment audience. 0018 repaired the dropped position_applied column; 0021 added the applicant_submitted notification and resolved roles through inheritance.';

drop trigger if exists log_applicant_status_change on public.applicants;
create trigger log_applicant_status_change
  after insert or update of status on public.applicants
  for each row execute function public.log_applicant_status_change();

-- ---------------------------------------------------------------------------
-- 3. Restore the view grants lost in 0013
-- ---------------------------------------------------------------------------
-- Without these the personnel roster reads as empty rather than as an error in
-- any caller that does not surface one — the Assign Personnel dropdown on the
-- Deployments page being the visible symptom.
grant select on public.v_personnel_roster to authenticated;
grant select on public.v_branch_staffing  to authenticated;
grant select on public.v_active_deployments to authenticated;
grant select on public.v_applicant_summary to authenticated;

-- ===========================================================================
-- Repair: create the built-in role rows before running 0014
-- ===========================================================================
-- Symptom when running 0014:
--   ERROR 23503: insert or update on table "role_permissions" violates foreign
--   key constraint "role_permissions_role_key_fkey"
--   DETAIL: Key (role_key)=(owner) is not present in table "roles".
--
-- Cause: 0002 creates the `roles` table empty; its rows were only ever inserted
-- by seed.sql. 0014 grants permissions to 'owner' and 'admin', which the foreign
-- key refuses while those rows are missing. (0020 later inserts these rows
-- itself, for exactly this reason — but 0014 runs first.)
--
-- Same rows and wording as 0020. Safe to run more than once: existing rows are
-- left untouched. Run this, then run 0014 again.
-- ===========================================================================

insert into public.roles (key, label, description, rank, is_assignable) values
  ('owner', 'Owner',
   'Full control of the system, including ownership transfer and permanent deletion.', 1, true),
  ('admin', 'Administrator',
   'Full operational control: users, settings, branches, recruitment and deployment.', 2, true),
  ('system_administrator', 'System Administrator',
   'Full access to the entire system, equivalent to an administrator. Cannot grant the owner role.', 2, true),
  ('hr_staff', 'HR Staff',
   'Manages applicants end to end, onboards hires and maintains the personnel roster.', 3, true),
  ('recruitment_officer', 'Recruitment Officer',
   'Screens and interviews applicants and moves them through the pipeline.', 4, true),
  ('deployment_officer', 'Deployment Officer',
   'Assigns personnel to posts, manages shifts, transfers and end of duty.', 4, true),
  ('branch_coordinator', 'Branch Coordinator',
   'Read-only view of their own branch: roster, deployments and staffing.', 5, true)
on conflict (key) do nothing;

-- Should list all seven.
select key, label, rank from public.roles order by rank, key;

-- ===========================================================================
-- Seed — reference data required for the application to function
-- ===========================================================================
-- Idempotent. Safe to run against a fresh database or an existing one.
-- Contains NO personal data and no fabricated applicants; see
-- supabase/seed/dev_fixtures.sql for development sample rows.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into public.roles (key, label, description, rank, is_assignable, inherits_from, is_system) values
  ('owner', 'Owner',
   'Full control of the system, including ownership transfer and permanent deletion.', 1, true, 'owner', true),
  ('admin', 'Administrator',
   'Full operational control: users, settings, branches, recruitment and deployment.', 2, true, 'admin', true),
  ('hr_staff', 'HR Staff',
   'Manages applicants end to end, onboards hires and maintains the personnel roster.', 3, true, 'hr_staff', true),
  ('recruitment_officer', 'Recruitment Officer',
   'Screens and interviews applicants and moves them through the pipeline.', 4, true, 'recruitment_officer', true),
  ('deployment_officer', 'Deployment Officer',
   'Assigns personnel to posts, manages shifts, transfers and end of duty.', 4, true, 'deployment_officer', true),
  ('system_administrator', 'System Administrator',
   'Full access to the entire system, equivalent to an administrator. Cannot grant the owner role.', 2, true, 'system_administrator', true),
  ('branch_coordinator', 'Branch Coordinator',
   'Read-only view of their own branch: roster, deployments and staffing.', 5, true, 'branch_coordinator', true)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    rank = excluded.rank,
    inherits_from = excluded.inherits_from,
    is_system = excluded.is_system;

-- ---------------------------------------------------------------------------
-- Permissions — one row per page of the admin app.
-- ---------------------------------------------------------------------------
-- These decide which pages a role can open: the sidebar filters on them and
-- <PageGuard> enforces them on the URL. They are NOT the security boundary —
-- what a role can read or write inside a page is decided by RLS, which follows
-- `roles.inherits_from`.
--
-- Migration 0020 replaced the previous `resource.action` vocabulary, which
-- nothing ever read. Anything left over from that model is cleared here so a
-- reseed cannot resurrect it.
insert into public.permissions (key, resource, action, description) values
  ('pages.dashboard',   'pages', 'dashboard',   'Dashboard — agency-wide overview'),
  ('pages.applicants',  'pages', 'applicants',  'Applicants — recruitment pipeline'),
  ('pages.personnel',   'pages', 'personnel',   'Personnel Roster — employed guards'),
  ('pages.facilities',  'pages', 'facilities',  'Facilities — client sites and headcount'),
  ('pages.deployments', 'pages', 'deployments', 'Deployments — postings and transfers'),
  ('pages.reports',     'pages', 'reports',     'Reports — analytics and exports'),
  ('pages.audit',       'pages', 'audit',       'Audit Logs — record of every change'),
  ('pages.users',       'pages', 'users',       'Users — staff accounts and role grants'),
  ('pages.content',     'pages', 'content',     'Website Content — public site CMS'),
  ('pages.config',      'pages', 'config',      'Data Configuration — positions, ranks, roles'),
  ('pages.settings',    'pages', 'settings',    'Settings — own profile and preferences')
on conflict (key) do update
set resource = excluded.resource,
    action = excluded.action,
    description = excluded.description;

delete from public.permissions where resource <> 'pages';

-- Role -> page grants. These reproduce the access each role had when the
-- navigation hard-coded its own role lists, so a reseed changes nobody's view.
insert into public.role_permissions (role_key, permission_key)
select r.key, p.key
  from public.roles r
 cross join public.permissions p
 where p.resource = 'pages'
   and (
     -- Nobody can be left with no landing page and no access to their profile.
     p.key in ('pages.dashboard', 'pages.settings')
     or p.key in ('pages.applicants', 'pages.personnel', 'pages.facilities', 'pages.reports')
     or (p.key = 'pages.deployments' and r.key in (
           'owner', 'admin', 'system_administrator',
           'hr_staff', 'deployment_officer', 'branch_coordinator'))
     or (p.key in ('pages.audit', 'pages.users', 'pages.content', 'pages.config')
         and r.key in ('owner', 'admin', 'system_administrator'))
   )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, is_public) values
  ('company.name', '"Aloha Security Agency"'::jsonb,
   'Registered company name shown across the app.', true),
  ('company.tagline', '"Vigilance. Integrity. Service."'::jsonb,
   'Tagline shown on the public site.', true),
  ('company.email', '"recruitment@alohasecurity.ph"'::jsonb,
   'Public recruitment contact address.', true),
  ('company.phone', '"+63 900 000 0000"'::jsonb,
   'Public contact number.', true),
  ('company.address', '"Philippines"'::jsonb,
   'Head office address.', true),
  ('recruitment.is_open', 'true'::jsonb,
   'Master switch for the public application form.', true),
  -- Which positions accept applications is held on `positions.is_active` /
  -- `positions.is_public` (migration 0013), not duplicated here.
  ('recruitment.min_age', '18'::jsonb,
   'Minimum applicant age. Also enforced by a CHECK constraint.', true),
  ('retention.applicant_days', '1825'::jsonb,
   'Days an archived applicant is retained before permanent deletion (5 years).', false),
  ('retention.audit_days', '2555'::jsonb,
   'Days audit log entries are retained (7 years).', false),
  ('notifications.email_enabled', 'false'::jsonb,
   'Send transactional email on status changes.', false),
  ('storage.signed_url_ttl_seconds', '60'::jsonb,
   'Lifetime of signed URLs minted for private documents.', false),

  -- Landing page statistics. Seeded as null on purpose: these are factual
  -- claims about the business, and the site omits the whole band rather than
  -- publishing a number nobody verified. Set them to the agency's real figures.
  ('marketing.stat.personnel', 'null'::jsonb,
   'Landing page: security personnel deployed. Set to a number to show the statistics band.', true),
  ('marketing.stat.clients', 'null'::jsonb,
   'Landing page: client sites protected.', true),
  ('marketing.stat.posts', 'null'::jsonb,
   'Landing page: active posts nationwide.', true),
  ('marketing.stat.years', 'null'::jsonb,
   'Landing page: years in operation.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Branches — representative Philippine posts. Adjust or replace for production.
-- ---------------------------------------------------------------------------
insert into public.branches
  (code, name, city_municipality, province, region, required_headcount, is_active)
values
  ('HQ',        'Head Office',                'Quezon City', 'Metro Manila', 'NCR',       12, true),
  ('MKT-01',    'Makati Corporate Tower',     'Makati',      'Metro Manila', 'NCR',       24, true),
  ('BGC-01',    'BGC Retail Complex',         'Taguig',      'Metro Manila', 'NCR',       18, true),
  ('CEB-01',    'Cebu Business Park',         'Cebu City',   'Cebu',         'Region VII', 16, true),
  ('DVO-01',    'Davao Logistics Hub',        'Davao City',  'Davao del Sur','Region XI',  14, true),
  ('CLK-01',    'Clark Industrial Estate',    'Angeles',     'Pampanga',     'Region III', 20, true)
on conflict (code) do nothing;

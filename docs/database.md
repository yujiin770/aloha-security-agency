# Database reference

PostgreSQL schema for the Aloha Security Agency Recruitment & Deployment
Management System. Every object lives in `public` unless noted, and every table
has Row Level Security enabled.

Migrations are in [`supabase/migrations/`](../supabase/migrations/) and apply in
numeric order.

---

## ERD

```mermaid
erDiagram
    auth_users ||--|| profiles : "1:1 via trigger"
    profiles ||--o{ user_roles : holds
    profiles }o--|| branches : "assigned to"
    branches ||--o{ deployments : hosts
    branches }o--o| profiles : "coordinated by"

    applicants ||--o{ applicant_documents : has
    applicants ||--o{ applicant_status_history : logs
    applicants }o--o| branches : "prefers"
    applicants ||--o| personnel : "promoted to"
    applicants }o--|| positions : "applies for"

    personnel ||--o{ deployments : "assigned via"
    personnel }o--|| positions : holds
    personnel }o--o| ranks : "ranked as"
    deployments ||--o{ deployment_history : logs

    positions ||--o{ position_ranks : offers
    ranks ||--o{ position_ranks : "offered for"

    profiles ||--o{ notifications : receives
    profiles ||--o{ audit_logs : "acted in"

    profiles {
        uuid id PK "= auth.users.id"
        text email
        text full_name
        uuid branch_id FK
        boolean is_active "gates every RLS helper"
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        app_role role
    }

    branches {
        uuid id PK
        text code UK
        text name
        text city_municipality
        uuid coordinator_id FK
        int required_headcount
        boolean is_active
    }

    positions {
        uuid id PK
        text code UK
        text name
        smallint min_age
        numeric min_height_cm
        boolean requires_license
        text tone "badge colour"
        boolean is_active
        boolean is_public "shown on the apply form"
    }

    ranks {
        uuid id PK
        text code UK
        text name
        smallint level "1 = most senior"
        boolean is_active
    }

    position_ranks {
        uuid position_id PK
        uuid rank_id PK
    }

    applicants {
        uuid id PK
        text reference_no UK "ASA-YYYY-NNNNNN"
        text first_name
        text last_name
        date birth_date "CHECK >= 18 years"
        uuid position_id FK
        applicant_status status
        uuid preferred_branch_id FK
        text rejection_reason "required when rejected"
        date purge_after "retention policy"
    }

    applicant_documents {
        uuid id PK
        uuid applicant_id FK
        document_type document_type
        text bucket_id
        text storage_path UK
        timestamptz verified_at
    }

    personnel {
        uuid id PK
        text employee_no UK "ASA-EMP-NNNNN"
        uuid applicant_id FK UK
        uuid position_id FK
        uuid rank_id FK
        employment_status employment_status
        date date_separated
    }

    deployments {
        uuid id PK
        uuid personnel_id FK
        uuid branch_id FK
        shift_type shift
        date start_date
        date end_date
        deployment_status status
    }

    audit_logs {
        bigint id PK
        text table_name
        uuid record_id
        audit_action action
        jsonb old_data
        jsonb new_data
    }
```

---

## Enumerated types (`0001`)

| Type | Values |
|---|---|
| `app_role` | owner, admin, **system_administrator**, hr_staff, recruitment_officer, deployment_officer, branch_coordinator |
| `applicant_status` | pending, screening, interview, hired, rejected, archived |
| `employment_status` | active, on_leave, suspended, resigned, terminated |
| `deployment_status` | pending, active, ended, transferred, cancelled |
| `shift_type` | day, night, mid, rotating |
| `document_type` | resume, government_id, nbi_clearance, police_clearance, barangay_clearance, medical_certificate, training_certificate, security_license, diploma, photo, other |
| `notification_type` | applicant_submitted, applicant_status_changed, interview_scheduled, deployment_assigned, deployment_ended, document_uploaded, system |
| `civil_status` | single, married, widowed, separated, divorced |
| `sex_type` | male, female |
| `audit_action` | insert, update, delete |

---

> **`position_type` no longer exists.** Migration 0013 replaced it with the
> `positions` table so a post type can be added without a schema change. See
> [Configuration tables](#configuration-tables-0013) below.

---

## Configuration tables (`0013`)

Positions and ranks are **data, not enums**. A system administrator adds a post
type or a rank through the UI; no migration, no deployment.

**`positions`** — replaces the old `position_type` enum. Beyond code and name it
carries the eligibility rules the application form enforces (`min_age`,
`max_age`, `min_height_cm`, `min_years_experience`, `requires_license`), a
`default_daily_rate`, and a `tone` for its badge colour so a new position
renders consistently without a code change.

Two visibility flags, because they answer different questions:

| Flag | Meaning |
|---|---|
| `is_active` | Usable anywhere. Turning it off retires the position while keeping every applicant and personnel record attached to it. |
| `is_public` | Appears on the public application form. An active-but-private position is internal-only — staff assign it directly. |

**`ranks`** — replaces the free-text `personnel.rank_title`. `level` orders
seniority, 1 being most senior.

**`position_ranks`** — restricts a rank to particular positions. A rank with
**no** rows here is offered for *every* position; `ranks_for_position(uuid)`
implements that rule so the UI and the database cannot disagree about it.

### The conversion

Migration 0013 is non-lossy. Every enum label became a `positions` row with a
matching `code`, so the backfill was a straight text join; every distinct
`rank_title` already in use became a `ranks` row rather than being discarded.
FK columns were populated before the old columns were dropped, and
`DROP TYPE position_type` runs under the default `RESTRICT`, so it fails loudly
if anything still references it — the built-in check that the conversion was
complete.

`applicants.position_id` and `personnel.position_id` are `ON DELETE RESTRICT`:
a position that is in use cannot be deleted. Deactivate it instead.
`personnel.rank_id` is `ON DELETE SET NULL` — losing a rank should not delete
an employee.

The `recruitment.open_positions` setting was removed in the same migration.
`positions.is_active` now records that fact, and two sources of truth for one
fact is how they drift apart.

---

## Tables

### Identity (`0002`)

**`profiles`** — application-facing mirror of `auth.users`, created by the
`handle_new_user()` trigger on signup. `is_active` is checked by every RLS
helper, so clearing it revokes access instantly without deleting history.

**`roles`** — display metadata for the `app_role` enum (label, description,
`rank`). Not the security boundary; RLS keys off the enum directly.

**`permissions` / `role_permissions`** — a permission catalogue used for UI
affordances and reporting. Again, not the boundary.

**`user_roles`** — the actual grants. A user may hold several roles. Read only
through the `SECURITY DEFINER` helpers in `0007`; policies on other tables never
sub-query it directly, which is what avoids infinite policy recursion.

### Operations (`0003`, `0005`)

**`branches`** — a client post or detachment. `required_headcount` drives the
staffing-gap report. Philippine address structure (barangay, city, province,
region).

**`personnel`** — employed staff, created from a hired applicant by
`promote_applicant_to_personnel()`. A CHECK constraint keeps
`employment_status` and `date_separated` consistent: a resigned or terminated
person must have a separation date, and an active one must not.

**`deployments`** — assignment of a person to a branch for a shift and period.

> **`deployments_no_overlap`** is a GiST exclusion constraint over
> `(personnel_id, daterange(start_date, end_date, '[]'))` filtered to
> `pending`/`active`. It makes double-booking a guard impossible at the storage
> layer — not merely discouraged in the UI.

**`deployment_history`** — append-only movement log, written by trigger.

### Recruitment (`0004`)

**`applicants`** — the only table the anonymous role may INSERT into. Notable
constraints:

- `applicants_age_chk` — at least 18 years old (Philippine law for private
  security personnel)
- `applicants_rejection_reason_chk` — a rejected applicant must carry a reason
- `applicants_reference_no_unique` — the `ASA-YYYY-NNNNNN` reference
- trigram GIN index on the concatenated name, backing the admin search box

**`applicant_documents`** — file metadata. `storage_path` points into a private
bucket; the file itself is only ever served through a signed URL.

**`applicant_status_history`** — append-only pipeline log. Written by a
`SECURITY DEFINER` trigger, so it has no INSERT policy at all.

### Website content (`0016`)

The marketing site's editable content. All five tables are administered at
`/admin/content`.

| Table | Holds |
|---|---|
| `testimonials` | Client quotes — text, author, role, company, avatar, rating |
| `clients` | Client logos for the trust strip |
| `accreditations` | Licences and memberships, with reference number and expiry |
| `news_posts` | Announcements. Unique slug, excerpt, plain-text body, cover image |
| `site_media` | Named image slots (`hero`, `about`, `team`…) filled by upload |

**`is_published` is an access boundary, not a filter.** The anonymous SELECT
policy is `using (is_published or public.is_staff())`, so an unpublished draft is
unreadable to the public even by direct request. That is what makes "draft"
mean something.

`news_posts` carries a CHECK requiring `published_at` whenever `is_published` is
true — the public list orders by that column, and a published post without one
would silently sort last forever.

Images live in the existing **public** `company-assets` bucket, so marketing
photography renders without minting a signed URL per page load. Only brand
assets go there; applicant documents remain in their private buckets.

All five tables carry the `audit_changes` trigger, so content edits are as
traceable as operational ones.

### System (`0006`)

**`audit_logs`** — machine-generated row diffs. Read-only for owner/admin; no
role has an UPDATE or DELETE policy, and rows are written by a definer trigger,
so no client can forge or erase one.

**`activity_logs`** — human-readable events written by the application
("Juan Dela Cruz hired as security guard").

**`notifications`** — per-user, published over Realtime.

**`settings`** — key/value jsonb. Rows flagged `is_public` are readable by the
anonymous role and drive the public site's company details and open positions.

**`email_logs`** — outbound mail attempts recorded by the
`send-notification-email` Edge Function.

---

## Functions (`0007`)

Every function declares `SET search_path` and fully qualifies its references, so
none can be hijacked by a manipulated search path.

### Authorization helpers — `SECURITY DEFINER`, `STABLE`

| Function | Returns |
|---|---|
| `current_user_roles()` | `app_role[]` for the caller; empty for anon or deactivated accounts |
| `has_role(variadic app_role[])` | true if the caller holds any of them |
| `is_admin()` | owner, admin or system_administrator (widened in 0015) |
| `is_staff()` | true for any authenticated user with at least one active role |
| `current_user_branch_id()` | the caller's assigned branch |
| `can_access_branch(uuid)` | agency-wide roles see all; a coordinator sees only their own |
| `is_config_admin()` | Alias of `is_admin()` since 0015. Kept as a distinct name because configuration policies read more clearly with it, and the two may legitimately diverge again. |

RLS policies call these instead of sub-querying `user_roles`, because an inline
sub-query against an RLS-protected table recurses forever.

### Business logic

| Function | Purpose |
|---|---|
| `promote_applicant_to_personnel(uuid, date, uuid)` | Transactional hire. Re-checks the caller's role; requires the applicant to be at `interview`; allocates an employee number; carries position, statutory numbers and licence across; assigns the given rank. |
| `ranks_for_position(uuid)` | Ranks offered for a position — those mapped to it, plus every unmapped rank. |
| `end_deployment(uuid, date, text)` | Closes an open deployment. |
| `transfer_deployment(uuid, uuid, date, shift_type, text)` | Closes the old assignment the day *before* the new one starts, which is what keeps the no-overlap constraint satisfied across a handover. |
| `submit_application(jsonb)` | The public form's write path. `SECURITY DEFINER`, because `anon` has no SELECT policy on `applicants` and PostgreSQL applies SELECT policies to an `INSERT ... RETURNING` — a direct insert therefore could not return the reference number. Pins `status`, `reviewed_by`, `rating` and the notes columns itself, and returns only the new id and reference number. |
| `check_application_status(text, text)` | The public status checker. Requires reference number **and** surname; returns a masked first name and no PII beyond status. The anonymous role's only read path into `applicants`. |
| `purge_expired_applicants()` | Retention enforcement. Revoked from anon and authenticated — callable only by the scheduled Edge Function. |
| `get_dashboard_stats()` | All dashboard KPIs in one round trip. |
| `refresh_analytics()` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` on the funnel. |
| `mark_all_notifications_read()` | `SECURITY INVOKER` — RLS scopes it to the caller. |

### Triggers

| Trigger | On | Does |
|---|---|---|
| `set_updated_at` | 7 tables | maintains `updated_at` |
| `audit_changes` | 10 tables | writes old/new jsonb plus `changed_keys` to `audit_logs`; skips timestamp-only updates. Covers `positions` and `ranks`, so configuration changes are as traceable as operational ones. |
| `generate_reference_no` | applicants (before insert) | allocates `ASA-YYYY-NNNNNN` |
| `validate_applicant_transition` | applicants (before update of status) | rejects illegal pipeline moves; stamps `status_changed_at`; sets `purge_after` on archive |
| `log_applicant_status_change` | applicants (after) | writes history and fans notifications out to recruitment staff |
| `log_deployment_change` | deployments (after) | writes history and notifies the branch coordinator |
| `handle_new_user` | auth.users (after insert) | creates the profile row |

**Legal pipeline transitions**, enforced by `validate_applicant_transition`:

```
pending    -> screening | interview | rejected | archived
screening  -> interview | rejected | pending | archived
interview  -> hired | rejected | screening | archived
hired      -> archived
rejected   -> archived | pending
archived   -> (terminal)
```

The UI mirrors this table in `src/utils/constants.ts`, but the database is the
authority — a crafted request that skips the UI still hits this check.

---

## Views (`0008`)

All four regular views are declared `WITH (security_invoker = true)`, so they run
under the *querying* user's RLS rather than the view owner's. Without that flag a
view is a hole straight through Row Level Security.

| View | Purpose |
|---|---|
| `v_applicant_summary` | Admin applicant table read model: joined position, branch and reviewer names, document counts, computed age |
| `v_active_deployments` | Deployment board with personnel, position, rank and branch details, days deployed |
| `v_branch_staffing` | Deployed headcount vs. requirement, vacancy count, fill rate |
| `v_personnel_roster` | Roster with position and rank joined, each person's current deployment via `LATERAL`, plus a licence-expiring-soon flag |
| `mv_recruitment_funnel` | **Materialized.** Per month, position and branch: counts by status and average days to decision |

Each view joins `positions` and exposes `position_name`, `position_code` and
`position_tone`. That is deliberate: list screens render a badge straight from
the row with no client-side lookup, and a renamed position is reflected
everywhere at once.

> `mv_recruitment_funnel` is a materialized view, and materialized views do
> **not** enforce RLS. It is granted to `authenticated` because it contains only
> aggregate counts — no names, no contact details. Do not add a
> personally-identifying column to it.

Its unique index is what permits `REFRESH ... CONCURRENTLY`, so the dashboard
never reads an empty table mid-refresh.

---

## Storage (`0010`)

| Bucket | Public | Limit | Contents |
|---|---|---|---|
| `resumes` | no | 10 MB | PDF/Word résumés |
| `government-ids` | no | 10 MB | IDs, NBI/police/barangay clearances |
| `certificates` | no | 10 MB | Training, medical, licences, diplomas |
| `personnel-images` | no | 5 MB | Roster photos |
| `reports` | no | 25 MB | Generated exports |
| `company-assets` | **yes** | 10 MB | Logo and public site imagery |

Object keys are `{applicant_id}/{document_type}-{uuid}.{ext}`. The leading folder
is not cosmetic — the storage policies key on
`(storage.foldername(name))[1]` and check it against a real, still-pending
application.

Anonymous applicants get INSERT and nothing else: there is no anonymous SELECT
policy on any private bucket, so an uploader cannot read back even their own
file. Staff read through 60-second signed URLs.

---

## Realtime (`0011`)

Published tables: `notifications`, `applicants`, `deployments`, `activity_logs`.
`applicants` and `deployments` are set to `REPLICA IDENTITY FULL` so UPDATE
payloads carry the old row and the client can diff a status change.

Realtime respects RLS on the `authenticated` channel. The client additionally
passes a server-side filter (`user_id=eq.{id}`) so a subscriber isn't sent rows
its policies would only discard.

---

## Regenerating TypeScript types

`src/types/database.types.ts` is hand-authored to match these migrations. Once
your project is linked, regenerate it from the live schema instead:

```bash
supabase gen types typescript --linked > src/types/database.types.ts
```

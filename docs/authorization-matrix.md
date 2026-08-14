# Authorization matrix

Who can do what, and where each rule is actually enforced.

---

## The security boundary

There are three layers, and only one of them is the boundary:

| Layer | File | Is it the boundary? |
|---|---|---|
| Sidebar links, buttons, `<RoleGuard>` | `src/app/guards.tsx`, `src/components/Sidebar.tsx` | **No.** A usability affordance. Trivially bypassed in a debugger. |
| `GRANT` / `REVOKE` on tables | `supabase/migrations/0009_rls_policies.sql` | Coarse second net — decides whether a role may attempt a verb at all. |
| **Row Level Security policies** | `supabase/migrations/0009_rls_policies.sql` | **Yes.** Evaluated by PostgreSQL on every statement. |

The client only ever holds the `anon` or `authenticated` key. The `service_role`
key bypasses RLS entirely and exists only inside Edge Function secrets — it is
never present in the browser bundle.

If you find yourself reasoning "the UI won't let them do that", stop and check
the policy instead.

---

## Roles

| Role | Rank | Scope |
|---|---|---|
| `owner` | 1 | Everything, including granting the owner role |
| `admin` | 2 | Full operational control: users, settings, branches, recruitment, deployment |
| `system_administrator` | 2 | Full access, equivalent to `admin`. Cannot grant the `owner` role — neither can an admin. |
| `hr_staff` | 3 | Applicants end to end, hiring, personnel roster |
| `recruitment_officer` | 4 | Screening and interviewing applicants |
| `deployment_officer` | 4 | Assigning personnel, shifts, transfers, end of duty |
| `branch_coordinator` | 5 | Read-only view of **their own branch** |

A user may hold more than one role; `has_role()` returns true if any match.

---

## Matrix

`C` create · `R` read · `U` update · `D` delete · `—` no access

Column key: **O** owner · **A** admin · **SA** system administrator ·
**HR** hr staff · **RO** recruitment officer · **DO** deployment officer ·
**BC** branch coordinator

`owner`, `admin` and `system_administrator` are collectively **`is_admin()`**
(migration 0015) and share one column below. Any policy written in terms of
`is_admin()` admits all three; there is no capability one has that the others
lack, apart from the owner-only rule marked †.

| Resource | Admin set (O · A · SA) | HR | RO | DO | BC |
|---|---|---|---|---|---|
| `positions` | CRUD | R | R | R | R |
| `ranks` | CRUD | R | R | R | R |
| `position_ranks` | CRUD | R | R | R | R |
| `roles` / `permissions` | CRUD | R | R | R | R |
| `applicants` | CRUD | CRU | CRU | R | R *(own branch)* |
| `applicant_documents` | CRUD | CRUD | CRU | R | — |
| `applicant_status_history` | R | R | R | R | R |
| `personnel` | CRUD | CRU | R | RU | R *(own branch)* |
| `branches` | CRUD | R | R | RU | RU *(own)* |
| `deployments` | CRUD | R | — | CRU | R *(own branch)* |
| `deployment_history` | R | R | — | R | R *(own branch)* |
| `profiles` | CRUD | R | R | R | R |
| `user_roles` | CRUD† | R *(self)* | R *(self)* | R *(self)* | R *(self)* |
| `audit_logs` | R | — | — | — | — |
| `activity_logs` | CR | CR | CR | CR | CR |
| `notifications` | RUD *(own)* | RUD *(own)* | RUD *(own)* | RUD *(own)* | RUD *(own)* |
| `settings` | CRUD | R | R | R | R |
| `email_logs` | R | — | — | — | — |
| `testimonials` / `clients` | CRUD | R | R | R | R |
| `accreditations` / `news_posts` | CRUD | R | R | R | R |
| `site_media` | CRUD | R | R | R | R |

† Any member of the admin set may grant any role **except** `owner`. Only an
owner mints another owner — enforced in the `user_roles_admin_write` policy's
`WITH CHECK`, and again in the `admin-create-user` Edge Function.

### The one thing no administrator can do

Mint an `owner`. That invariant is what stops a compromised administrative
account from escalating into permanent, unrevokable control: an owner can always
strip a rogue admin, but an admin who could create owners could not be undone.

It applies uniformly to `admin` and `system_administrator`. Migration 0015 gave
`system_administrator` everything else an admin has, and this is the only
capability it withholds.

### One predicate, not thirty lists

`is_admin()` is the single definition of "administrator" in the database:

```sql
create or replace function public.is_admin() returns boolean as $$
  select public.has_role('owner', 'admin', 'system_administrator');
$$ language sql security definer stable set search_path = '';
```

Policies say `public.is_admin() or public.has_role('hr_staff')` rather than
enumerating roles inline. Widening the administrator set again is one function,
not thirty policies that can drift out of step. `src/utils/constants.ts` mirrors
it as `ADMIN_ROLES` for the client-side guards — and only for the guards; the
function is the boundary.

---

## Anonymous access

The anonymous role gets exactly five things. Everything else is denied by
default, because RLS denies anything without a matching policy.

| Capability | Mechanism |
|---|---|
| Read the open positions list | `SELECT` on `positions` restricted to `is_active AND is_public` — the same information a recruitment poster carries |
| Read **published** website content | `SELECT` on `testimonials`, `clients`, `accreditations`, `news_posts` restricted to `is_published`, plus `site_media`. Drafts are refused outright, not filtered client-side. |
| Submit an application | `INSERT` on `applicants`, with a `WITH CHECK` pinning `status = 'pending'` and forbidding `reviewed_by`, `rating`, `interview_at`, `rejection_reason`, `internal_notes`, `archived_at` |
| Attach documents to a pending application | `INSERT` on `applicant_documents` and on `storage.objects` in three buckets, both requiring an existing application still at `pending` |
| Check application status | `EXECUTE` on `check_application_status(reference_no, last_name)` |

There is **no anonymous `SELECT` on `applicants`**. The status checker is an RPC
that requires two matching facts, masks the first name, returns nothing beyond
pipeline state, and excludes archived records — so it cannot be used to
enumerate applicants or harvest contact details.

There is no anonymous `SELECT` on any private storage bucket either. An
applicant can upload a file and then cannot read it back.

---

## Branch scoping

`branch_coordinator` is the only row-scoped role. Scoping flows from
`profiles.branch_id` through `current_user_branch_id()`:

```sql
create policy deployments_select on public.deployments
  for select to authenticated
  using (
    public.has_role('owner', 'admin', 'hr_staff', 'deployment_officer')
    or (public.has_role('branch_coordinator')
        and branch_id = public.current_user_branch_id())
  );
```

For `personnel`, the same scoping is expressed through an active deployment at
the coordinator's branch — a coordinator sees the guards currently posted to
them, not the whole roster.

**A coordinator with no `branch_id` set sees nothing.** `current_user_branch_id()`
returns null and `= null` is never true. Assign the branch when inviting them.

---

## Why the helpers are `SECURITY DEFINER`

An RLS policy on `applicants` that sub-queried `user_roles` inline would trigger
RLS evaluation on `user_roles`, whose own policy would evaluate again, forever.
Routing through a `SECURITY DEFINER` function breaks the loop: the function runs
as its owner, so its internal query is not re-filtered.

They are also `STABLE`, so PostgreSQL evaluates them once per statement rather
than once per row — the difference between a fast scan and a slow one on a large
applicant table. For the same reason `auth.uid()` is always wrapped as
`(select auth.uid())`.

---

## Verifying a policy

Never trust the matrix above over the database. Check a specific claim like
this, in the SQL editor:

```sql
-- Impersonate a recruitment officer.
set local role authenticated;
set local request.jwt.claims to '{"sub": "<their-user-uuid>", "role": "authenticated"}';

-- Should return rows:
select count(*) from public.applicants;

-- Should return zero rows (audit is owner/admin only):
select count(*) from public.audit_logs;

reset role;
```

Repeat per role and per row of the matrix. A policy you have not tested against
a real session is a policy you have not verified.

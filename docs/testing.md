# Testing strategy

No test suite ships with this build. This document defines what to test and how,
so the gap is a known one rather than a discovered one.

Priority order reflects blast radius: an RLS mistake exposes applicant PII, a
component bug annoys someone.

---

## 1. RLS policies — highest priority

Every row of the [authorization matrix](./authorization-matrix.md) is a claim,
and an untested claim is a guess.

Test in SQL by impersonating a role, rather than through the app — the app can
only exercise paths its own UI offers, which is precisely not where the risk is.

```sql
begin;

-- A recruitment officer.
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- May read applicants.
select count(*) > 0 as can_read_applicants from public.applicants;

-- Must NOT read the audit trail.
select count(*) = 0 as audit_denied from public.audit_logs;

rollback;
```

### Cases that must be covered

| Claim | Why it matters |
|---|---|
| `anon` cannot `SELECT` from `applicants` | Would expose every applicant's PII |
| `anon` can `INSERT` only a `pending` application | Self-hiring, or forging a rating |
| `anon` cannot read any private storage object | Government IDs |
| A branch coordinator sees only their own branch | Cross-branch data leak |
| A coordinator with `branch_id = null` sees nothing | Null comparison must not open access |
| A deactivated user (`is_active = false`) can do nothing | Deactivation must actually revoke |
| Only an owner can grant `owner` | Privilege escalation |
| Nobody can `UPDATE` or `DELETE` `audit_logs` | Tamper-evidence |
| `recruitment_officer` cannot write `deployments` | Role separation |

Consider [pgTAP](https://pgtap.org/) so these run in CI:

```sql
select plan(4);
select is(current_setting('row_security'), 'on', 'RLS is on');
select throws_ok(
  'insert into applicants(status, ...) values (''hired'', ...)',
  '42501', null, 'anon cannot self-hire');
select finish();
```

---

## 2. Database business rules

The constraints and triggers are load-bearing — test them directly.

| Rule | Test |
|---|---|
| 18+ age check | Insert a 17-year-old → expect `23514` |
| Rejection needs a reason | Set `status='rejected'` with null reason → expect `23514` |
| Legal transitions only | `pending` → `hired` → expect a raised exception |
| No double-booking | Two overlapping active deployments for one guard → expect `23P01` |
| Hire only from `interview` | Call the RPC on a `pending` applicant → expect an exception |
| Hire is atomic | Force a failure mid-function; assert no orphan personnel row |
| Separation consistency | `resigned` with null `date_separated` → expect `23514` |
| Reference numbers | Insert 3 applicants; assert `ASA-YYYY-NNNNNN` and uniqueness |
| Audit trigger | Update an applicant; assert one `audit_logs` row with correct `changed_keys` |
| Timestamp-only update | Assert it does **not** create an audit row |

---

## 3. Unit tests

```bash
npm install -D vitest @testing-library/react @testing-library/user-event \
               @testing-library/jest-dom jsdom
```

```ts
// vite.config.ts
test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true }
```

Worth testing, because each has real logic and no dependencies:

| Module | What |
|---|---|
| `utils/format.ts` | Null handling (every function must yield `—`, never "Invalid Date"), `maskId` leaves only 4 characters, `initials` on one-word and empty names |
| `lib/errors.ts` | Each named constraint maps to its plain-language message; unknown codes fall through; `failed to fetch` becomes the network message |
| `features/reports/api` — `downloadCsv` | **CSV injection**: `=cmd\|'/c calc'!A1` is quote-prefixed; embedded quotes, commas and newlines are escaped; BOM is present |
| `lib/zodResolver.ts` | Nested paths preserved; one error per field |
| `features/applicants/schemas` | Rejects under-18, bad PH mobile numbers, licensed-without-number; `toApplicantInsert` maps blanks to null |
| `utils/cn.ts` | Arrays, objects, falsy values |

The CSV injection test is the one to write first — it is a path from
user-supplied text to code execution on a reviewer's machine.

---

## 4. Component tests

Render with a `QueryClientProvider` and a stub auth context.

| Component | Assertions |
|---|---|
| `Modal` | Focus moves in on open and returns on close; Tab is trapped; Escape closes; `aria-modal` present |
| `Field` | Label is associated; error gets `role="alert"`; `aria-describedby` links error and hint |
| `DataTable` | Loading, empty and error states; `aria-sort` reflects state; row `Enter`/`Space` activates |
| `Button` | `aria-busy` while loading; disabled while loading |
| `RoleGuard` | Renders children for an allowed role; denial screen otherwise; `silent` renders nothing |
| `EnvGate` | Renders setup instructions when unconfigured |

---

## 5. End-to-end

Playwright against a local Supabase stack (`supabase start`, `supabase db reset`).

**The critical path**, which crosses every layer:

1. Submit an application with a document upload
2. Capture the reference number
3. Check status anonymously with reference + surname
4. Sign in as a recruitment officer
5. Move the applicant to screening, then interview
6. Sign in as HR staff and hire
7. Confirm a personnel record with an employee number
8. Sign in as a deployment officer and assign to a branch
9. Attempt a second overlapping deployment — expect a readable refusal
10. Transfer to another branch; confirm the history shows both
11. Sign in as an owner and confirm the audit log recorded every transition

**Negative paths worth automating:**

- Navigate directly to `/admin/audit` as a recruitment officer → denial screen
- Check status with a mismatched surname → "no matching application"
- Upload an 11 MB file → rejected with a size message

---

## 6. Accessibility

Automated (`@axe-core/playwright`) on the application form, login, dashboard and
one data table. Then, manually — because axe cannot judge these:

- Complete the whole application form with the keyboard only
- Tab through a dashboard table; confirm sort buttons are reachable and
  `aria-sort` is announced
- Open a modal, confirm focus is trapped and returns to the trigger on Escape
- Check contrast on red-on-white (`#E23828` on `#FFFFFF`) and white-on-black
- Run through in both light and dark mode

---

## Suggested CI gate

```yaml
- run: npm run lint
- run: npx tsc -b
- run: npm run test              # unit + component
- run: supabase db reset         # migrations + seed apply cleanly
- run: npm run test:rls          # pgTAP
- run: npm run build
- run: npm run test:e2e          # main branch only
```

---

## Manual smoke test

Before any release, in under five minutes:

1. Unconfigured `.env` → setup screen, not a white screen
2. Public site loads; logo renders; dark mode toggles
3. Submit an application → reference number appears
4. Check that reference → correct status and timeline
5. Sign in → dashboard KPIs populate
6. Open an applicant → documents open through signed URLs
7. Advance a status → notification bell increments
8. Export a CSV → opens cleanly in Excel with accents intact

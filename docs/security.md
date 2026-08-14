# Security architecture

The system holds personal data on job applicants — names, addresses, birth
dates, SSS/PhilHealth/Pag-IBIG/TIN numbers, NBI and police clearances, scanned
government IDs. Under the Philippine Data Privacy Act of 2012 (RA 10173) that is
sensitive personal information, and most of it is exactly what identity theft
needs.

---

## Keys

| Key | Where it lives | Bypasses RLS |
|---|---|---|
| `anon` | Browser bundle. Public by design. | No |
| `authenticated` | Issued per session by Supabase Auth | No |
| `service_role` | **Edge Function secrets only** | **Yes** |

Anything prefixed `VITE_` is inlined into the browser bundle at build time and
is public. The `service_role` key must never appear in `.env`, in
`import.meta.env`, or in any file under `src/`. Putting it there would give every
visitor unrestricted read and write access to applicant PII, personnel records
and the audit log.

`.gitignore` excludes `.env` and `.env.*` while keeping `.env.example` tracked.
If a real key is ever committed, rotate it — removing the commit is not enough,
because it is already in the clone history.

---

## OWASP Top 10 (2021)

### A01 Broken Access Control

The whole authorization model. RLS on every table in `public`, plus
`FORCE ROW LEVEL SECURITY` on `applicants`, `applicant_documents` and
`personnel` so even a compromised table-owner connection is filtered.

Route guards and hidden sidebar links are usability, not security — see
[authorization-matrix.md](./authorization-matrix.md).

Direct object reference is handled by RLS rather than by obscurity: knowing an
applicant's UUID gains you nothing without a policy that admits you.

### A02 Cryptographic Failures

TLS end to end (Supabase is HTTPS-only). Passwords are hashed by Supabase Auth —
this codebase never sees one. Private buckets are served exclusively through
60-second signed URLs; there is no public URL for a government ID.

Statutory numbers are masked in the UI (`maskId` in `src/utils/format.ts`) so a
full SSS number is not left on screen in an open-plan office.

### A03 Injection

The Supabase client parameterises every value; no SQL is string-concatenated in
the frontend. Every SQL function declares `SET search_path` and fully qualifies
its references, which closes the search-path hijacking route into
`SECURITY DEFINER` code.

**CSV injection** is handled explicitly in `downloadCsv`: a field starting with
`=`, `+`, `-` or `@` is prefixed with a quote. Without that, an applicant who
types `=cmd|'/c calc'!A1` into a name field gets code execution on the machine
of whoever opens the export in Excel.

### A04 Insecure Design

Business rules live in the database, where they cannot be skipped: the 18+ age
check, the mandatory rejection reason, the legal-transitions trigger, the
no-double-booking exclusion constraint, and the requirement that hiring goes
through `promote_applicant_to_personnel()` rather than a raw insert.

### A05 Security Misconfiguration

Public signup is **off** (`enable_signup = false`); staff accounts are created
only by an owner or admin through an Edge Function. Password policy is 10+
characters with mixed case, digits and symbols. Sessions time out after 8 hours
idle and 24 hours absolute. A Content Security Policy ships in `index.html`.

### A06 Vulnerable Components

Dependencies are deliberately few. Run `npm audit` before each release and keep
`@supabase/supabase-js` current — it carries the auth and storage clients.

### A07 Identification and Authentication Failures

Supabase Auth handles sessions, PKCE flow, refresh-token rotation and reuse
detection. Sign-in errors are deliberately generic: distinguishing "no such
user" from "wrong password" hands an attacker a way to enumerate staff accounts.
The forgot-password screen shows the same confirmation whether or not the
address exists, for the same reason.

Magic links pass `shouldCreateUser: false`, so a link can never quietly create an
account on an internal system.

### A08 Software and Data Integrity Failures

The audit trigger is `SECURITY DEFINER` and writes as the table owner; no role
has an UPDATE or DELETE policy on `audit_logs`, so entries cannot be forged or
erased from the client. Append-only history tables (`applicant_status_history`,
`deployment_history`) have no write policies at all.

### A09 Logging and Monitoring Failures

`audit_logs` captures old/new jsonb plus changed keys for eight tables.
`activity_logs` records human-meaningful events. `email_logs` records delivery
attempts. Supabase provides auth and API logs alongside these.

### A10 Server-Side Request Forgery

No user-supplied URL is fetched anywhere. The single outbound call is to a
hard-coded mail provider endpoint inside an Edge Function.

---

## Content Security Policy

Shipped as a `<meta>` tag in `index.html` for development convenience. **Move it
to a response header at your CDN or host in production** — a meta CSP cannot
express `frame-ancestors` reliably and cannot be enforced before parsing begins.

```
default-src 'self'; base-uri 'self'; object-src 'none';
frame-ancestors 'none'; form-action 'self';
img-src 'self' data: blob: https://*.supabase.co;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
```

`style-src 'unsafe-inline'` is required by React's inline `style` attributes,
which the progress bars and chart columns use for computed widths. `script-src`
has no `unsafe-inline` or `unsafe-eval`.

Tighten `*.supabase.co` to your specific project host before going live.

Recommended additional response headers:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

## XSS

React escapes interpolated values by default, and this codebase uses
`dangerouslySetInnerHTML` nowhere — verify that stays true:

```bash
grep -rn "dangerouslySetInnerHTML" src/
```

The one place untrusted text is composed into a document is the CSV export,
handled above.

---

## File uploads

Defence is layered because client-side checks are advisory only:

| Layer | Control |
|---|---|
| Client | Extension and MIME allow-list, 10 MB cap (`FileUpload.tsx`) |
| Bucket | `allowed_mime_types` and `file_size_limit` per bucket |
| RLS | Path must start with a real applicant UUID whose application is still `pending` |
| Naming | Server-generated `{uuid}.{ext}` — the user's filename is stored as metadata, never used as the object key |
| Serving | Private buckets, 60-second signed URLs, no public path |

Uploads are **not** virus-scanned. If you accept files from the public internet
at volume, add a scanning step — a storage webhook into an Edge Function that
quarantines on detection.

---

## Data privacy and retention

| Control | Implementation |
|---|---|
| Consent | Two explicit, unticked checkboxes on the application form, referencing RA 10173 |
| Minimisation | Statutory numbers are optional at application; only the position, status and timeline are exposed publicly |
| Retention | `retention.applicant_days` (default 1825 = 5 years). Archiving stamps `purge_after`. |
| Deletion | `purge_expired_applicants()` hard-deletes past that date, skipping anyone who became personnel. Revoked from `anon` and `authenticated` — callable only by the scheduled Edge Function. |
| Access log | Every read-modify of an applicant lands in `audit_logs` |

---

## Known limitations

Stated plainly rather than left to be discovered:

1. **`mv_recruitment_funnel` does not enforce RLS.** Materialized views never do.
   It is granted to `authenticated` because it holds only aggregate counts. Do
   not add a personally-identifying column to it.
2. **CSP is a meta tag.** Move it to response headers in production.
3. **No rate limiting on the public application form** beyond Supabase's
   platform defaults. A determined submitter can create junk applications. Add a
   CAPTCHA (`[auth.captcha]` in `config.toml`, plus a check in the insert path)
   if this becomes a problem.
4. **No virus scanning on uploads.**
5. **`check_application_status` is unauthenticated by design.** It requires two
   matching facts and returns no contact details, but it is still an online
   oracle for "does this reference number exist". The masked first name limits
   the value of that.
6. **Edge Functions must be deployed** for user invitations and scheduled
   retention to work. Until then the app degrades with a clear message rather
   than failing silently.

---

## Pre-launch checklist

- [ ] `service_role` key absent from `.env` and from the built bundle
      (`grep -r "service_role" dist/` returns nothing)
- [ ] `.env` is gitignored and no key was ever committed
- [ ] Every table in `public` reports `rowsecurity = true`
- [ ] Each row of the authorization matrix verified against a real session
- [ ] Anonymous role cannot `SELECT` from `applicants`
- [ ] CSP moved to response headers; `*.supabase.co` narrowed to your project
- [ ] Supabase Auth redirect URLs restricted to your production origin
- [ ] `ALLOWED_ORIGINS` set on every Edge Function
- [ ] `CRON_SECRET` set and the retention job scheduled
- [ ] First owner bootstrapped, then `supabase/sql/bootstrap_owner.sql` access
      restricted
- [ ] `npm audit` clean
- [ ] Database backups enabled and a restore tested

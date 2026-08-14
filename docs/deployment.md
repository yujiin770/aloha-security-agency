# Deployment guide

From an empty Supabase project to a running system.

---

## 1. Create the Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project. Note the
region (pick one near your users — `Southeast Asia (Singapore)` for the
Philippines) and store the database password somewhere safe.

From **Project Settings → API**, copy:

- Project URL → `VITE_SUPABASE_URL`
- `anon` / publishable key → `VITE_SUPABASE_ANON_KEY`

Do **not** copy the `service_role` key into `.env`. See
[security.md](./security.md#keys).

---

## 2. Configure the app

```bash
cp .env.example .env
```

Fill in the two values. Until you do, the app boots into a setup screen naming
exactly what is missing — it will not crash or show a blank page.

---

## 3. Apply the schema

Install the CLI and link the project:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

The ref is the subdomain of your project URL
(`https://<ref>.supabase.co`).

```bash
supabase db push          # applies supabase/migrations/0001–0011 in order
```

Then load reference data (roles, permissions, settings, sample branches) by
pasting `supabase/seed/seed.sql` into the SQL editor, or:

```bash
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

The seed is idempotent — re-running it will not duplicate anything.

### Verify

```sql
-- Every table must report true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Should list the six buckets, with only company-assets public.
select id, public, file_size_limit from storage.buckets;
```

### Local alternative

With Docker running:

```bash
supabase start
supabase db reset   # migrations + seed against the local stack
```

Point `.env` at the local URL and key printed by `supabase start`.

---

## 4. Create the first owner

Chicken-and-egg: only an owner or admin can grant roles, and a fresh database
has neither.

1. **Dashboard → Authentication → Users → Add user.** Set an email and password,
   and tick *Auto Confirm User*.
2. Open `supabase/sql/bootstrap_owner.sql`, change the email on the marked line
   to match, and run it in the SQL editor.

It grants the `owner` role and prints the result. This file is not a migration
and is not callable from the application — it works only because the SQL editor
runs as a superuser.

You can now sign in at `/auth/login` and invite everyone else from
**Admin → Users & roles**.

---

## 5. Auth settings

**Dashboard → Authentication → URL Configuration:**

- Site URL: your production origin
- Redirect URLs: `https://your-domain/auth/callback`,
  `https://your-domain/auth/reset-password`

**Authentication → Providers → Email:** confirm signup is **disabled**. This is
an internal system; accounts are created by invitation only. `config.toml`
already sets this for local development, but the hosted project has its own
settings.

Configure SMTP under **Project Settings → Auth** — the built-in sender is rate
limited and not intended for production.

---

## 6. Deploy the Edge Functions

```bash
supabase functions deploy admin-create-user
supabase functions deploy send-notification-email
supabase functions deploy refresh-analytics --no-verify-jwt
```

`refresh-analytics` uses `--no-verify-jwt` because a scheduler has no user
session; it authenticates with a shared secret instead.

Set the secrets:

```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://your-domain" \
  SITE_URL="https://your-domain" \
  CRON_SECRET="$(openssl rand -hex 32)" \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="465" \
  SMTP_USER="the-account@gmail.com" \
  SMTP_PASS="the-16-character-app-password" \
  EMAIL_FROM="Aloha Security Agency <the-account@gmail.com>"
```

`send-notification-email` picks its transport from `SMTP_HOST`: set it and mail
goes over SMTP, leave it unset and it falls back to the Resend HTTP API via
`RESEND_API_KEY`. `EMAIL_FROM` is read by both (`MAIL_FROM` still works as an
alias).

Use port `465`. It is implicit TLS — the socket is encrypted from the first byte
via `connectTls`. Port `587` does **not** work from the Edge runtime: the TCP
connection opens and then the STARTTLS upgrade fails with

```
BadResource: Bad resource ID at Object.startTls (ext:deno_net/02_tls.js)
```

because Deno's socket-upgrade path is unavailable there. `25` is blocked
everywhere. `tls` is derived from the port automatically — do not set it by hand.

For Gmail, `SMTP_PASS` must be an **App Password** (Google Account → Security →
2-Step Verification, then App passwords), not the account password, and
`EMAIL_FROM` must be the same address as `SMTP_USER` or Gmail rejects the sender.

This is deliberately separate from the SMTP configured under **Project Settings →
Auth** in step 5. That setting only serves Supabase Auth's own mail — staff
invitations and password resets — and Edge Functions cannot read it, so the same
mailbox is configured twice. Set both, or applicant emails and invitation emails
will not both work.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — you do not set those by hand.

| Function | Purpose | If not deployed |
|---|---|---|
| `admin-create-user` | Invite staff (needs `service_role`) | Invitations fail with a message naming the deploy command |
| `send-notification-email` | Transactional email | In-app notifications still work |
| `refresh-analytics` | Refresh KPIs, run retention purge | Reports go stale; use the manual **Refresh data** button |

### Schedule the analytics job

**Dashboard → Integrations → Cron**, daily at 02:00:

```sql
select net.http_post(
  url     := 'https://<ref>.supabase.co/functions/v1/refresh-analytics',
  headers := jsonb_build_object('x-cron-secret', '<your CRON_SECRET>')
);
```

This both refreshes `mv_recruitment_funnel` and enforces the applicant retention
policy, so it is not optional if you have a legal retention obligation.

---

## 7. Build and host

```bash
npm ci
npm run build     # tsc -b && vite build  ->  dist/
```

Static output — any static host works.

**Vercel / Netlify / Cloudflare Pages:**

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 20+ |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`, `VITE_SUPPORT_EMAIL` |

Environment variables are read at **build** time, not runtime. Changing one
requires a redeploy.

### SPA routing

Client-side routing needs all paths rewritten to `index.html`, or a refresh on
`/admin/applicants` will 404.

`vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

`public/_redirects` (Netlify):

```
/*  /index.html  200
```

### Security headers

Move the CSP out of `index.html` into response headers, and narrow
`*.supabase.co` to your project. Add HSTS, `X-Content-Type-Options`,
`Referrer-Policy` and `Permissions-Policy` — see
[security.md](./security.md#content-security-policy).

---

## 8. Brand assets

Replace `public/logo.svg` with the official Aloha Security Agency logo, keeping
the filename. Every reference — public site, sidebar, auth screens, favicon —
points there, so one file swap rebrands the system.

---

## CI/CD

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm run build
        env:
          # Build-time only; the app validates these at boot.
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: placeholder-key-for-build-only
      - run: npm audit --audit-level=high
```

For migrations, run `supabase db push` from a deploy job holding
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as repository secrets. Gate it
on the `main` branch and require the verify job to pass first.

Consider `supabase db diff` in CI to catch a schema drifting away from the
migrations in version control.

---

## Regenerating types after a schema change

```bash
supabase gen types typescript --linked > src/types/database.types.ts
npx tsc -b
```

The typecheck will point at every call site the change affected — which is the
point of typing the client against the schema.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Setup screen instead of the app | `.env` missing or malformed; restart the dev server after editing |
| "Your account is not yet active" after signing in | No role granted, or `is_active` is false. Run the bootstrap script or have an admin grant a role. |
| Queries return empty for a branch coordinator | Their `profiles.branch_id` is null — `current_user_branch_id()` returns null and `= null` never matches |
| Invitations fail | `admin-create-user` not deployed, or `ALLOWED_ORIGINS` does not include your origin |
| Reports look stale | `mv_recruitment_funnel` needs a refresh — press **Refresh data** or check the cron job |
| Documents will not open | Signed URLs expire in 60 seconds; check the bucket policies applied in `0010` |
| `infinite recursion detected in policy` | A policy is sub-querying an RLS-protected table directly instead of going through a `SECURITY DEFINER` helper |

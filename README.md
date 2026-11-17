# jx-admin

The Jazaix admin console: a standalone Next.js app, deployed on Vercel at **admin.jazaix.com** (GitHub
`csanz/jx-admin`), decoupled from the portal (jx-portal at https://play.jazaix.com). It has its own data layer: it
reads and writes the platform database (MongoDB, the portal's `jx_portal`) directly. It shows the portal waitlist
(approve, move back), the users (search, set role) and the JBux ledger report. Only the two money actions (a JBux
refund, a wallet hold) are carried out by the portal's admin API, because those are the ledger's money rules and must
have one implementation.

## Architecture in a few lines
- **Sign-in**: Auth.js (next-auth v5) with Google only, JWT sessions, no adapter.
- **Who is an admin**: both must hold. The email is on `JX_DEVELOPER_EMAILS` (comma list, case-insensitive) AND the
  `users` row for that email (looked up lower-cased) holds role `admin`, read from MongoDB on every request (a
  demotion takes effect at once). Non-admins see "Not an admin" with Sign out; signed-out visitors land on `/sign-in`.
- **Data layer** (`src/lib/mongo.ts` + `src/lib/repo/*.ts`): the official `mongodb` driver (6.x, the portal's
  major), one cached client (serverless-safe, 5 s server selection timeout, never opened at import time), env
  `MONGODB_URI` and `MONGODB_DB` (default `jx_portal`). The repo modules take a `Db` and have no framework imports:
  - `repo/users.ts`: the role lookup behind the gate, search by email / username / name, set role.
  - `repo/waitlist.ts`: the portal's waitlist model, field for field (access, approvedAt, approvedBy, waitlistedAt,
    waitlistEmails), so the portal keeps working against the same rows.
  - `repo/jbux-report.ts`: the portal's JBux admin report (read side), test money apart from real money.
  - `repo/audit.ts`: every write appends `admin_actions { at, actor, action, target, via: "admin-console" }`.
- **Approval email**: on approve, the portal's "You're in" email goes through Resend (`src/lib/email.ts`) when
  `RESEND_API_KEY` is set (`JX_EMAIL_FROM`, `JX_EMAIL_REPLY_TO` optional) and the outcome is recorded on the user
  as `waitlistEmails.approved`, as the portal does. Without the key, approving works and the UI says no email was sent.
- **Money actions through the portal** (`src/lib/portal.ts`): `/api/jbox/refund` and `/api/jbox/hold` call
  `{JX_PORTAL_URL}/api/admin/jbox/...` with `Authorization: Bearer {JX_ADMIN_API_TOKEN}` and
  `X-Jx-Admin-Email: <the acting admin>`, 10 s timeout, never the browser's cookies. `adminRefund` and `setHold`
  (splits, pots, entitlement revocation) stay in the portal on purpose: one implementation of the money rules; this
  console never writes `wallets` or `credit_transactions`. The link is optional (both or neither): without it the
  two forms show "money actions need the portal link" and are disabled; everything else works on MongoDB alone.
- **Own API** (`src/app/api/`): `/api/waitlist` (GET, POST), `/api/users` (GET, POST), `/api/jbox/report` (GET),
  `/api/jbox/refund` (POST, portal), `/api/jbox/hold` (POST, portal), `/api/me` (GET), `/api/health` (GET, no auth:
  `{ ok, mongo, portal }`). Every handler except `/api/auth/*` and `/api/health` goes through the admin gate; every
  POST also passes the same-origin JSON check (CSRF). An unreachable database is a 504 `db-unavailable`.
- **Pages**: `/` dashboard, `/waitlist`, `/users`, `/jbux`, `/sign-in`. Pure black + green tokens from the portal,
  light theme mirrored (toggle in the top bar), mobile width with 16 px gutters, `noindex` everywhere, security
  headers on every response (frame-ancestors none, nosniff, strict-origin-when-cross-origin).

## What uses what
| Section | Reads | Writes |
| --- | --- | --- |
| Admin gate | MongoDB `users` (role) | nothing |
| Waitlist | MongoDB `users` | MongoDB `users` (+ `admin_actions`), Resend for the email |
| Users | MongoDB `users` | MongoDB `users.role` (+ `admin_actions`) |
| JBux report | MongoDB `credit_transactions`, `wallets`, `users` | nothing |
| JBux refund, wallet hold | portal `/api/admin/jbox/refund`, `/hold` (service token) | the portal does the money |

## Local run
```
export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PATH; unset CC
npm ci --no-audit --no-fund
cp .env.example .env.local      # fill the values; AUTH_URL=http://127.0.0.1:3400 locally
npm run dev                     # http://127.0.0.1:3400 (next dev --webpack)
```
Local database (the jx-db replica set on 27018):
```
MONGODB_URI=mongodb://localhost:27018/jx_portal?replicaSet=jx-db-local-rs&directConnection=true
MONGODB_DB=jx_portal
```
The users row for your Google email must hold `role: "admin"` in that database and the email must be on
`JX_DEVELOPER_EMAILS`. Google sign-in locally needs `http://127.0.0.1:3400/api/auth/callback/google` on the OAuth
client. `JX_PORTAL_URL` + `JX_ADMIN_API_TOKEN` are only needed to try a refund or a hold (the portal you point at
must accept the same token).

Checks (all must pass before a push):
```
npm test            # node:test: gate, repos with fakes, email, env, route source pins (integration tests skipped)
JX_TEST_MONGO_URI='mongodb://localhost:27018/?replicaSet=jx-db-local-rs&directConnection=true' npm test
                    # the same plus the integration tests, in their own jxadmin_test_<random> database (dropped after)
npm run typecheck   # tsc --noEmit
npm run build       # next build --webpack
```

## Vercel setup (owner checklist)
1. **Create the project**: Vercel > Add New > Project > import the GitHub repo `csanz/jx-admin`. Framework Next.js,
   build command `npm run build` (vercel.json already says so), production branch `main`.
2. **Environment variables** (Production, and Preview if you want preview deploys to work):
   - `AUTH_SECRET`: a long random string (for example `openssl rand -base64 32`).
   - `AUTH_URL`: `https://admin.jazaix.com`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the Google OAuth client (step 4).
   - `JX_DEVELOPER_EMAILS`: comma-separated admin emails (the same list the portal uses).
   - `MONGODB_URI`: the production platform database, reachable from Vercel (see "Production MongoDB" below).
   - `MONGODB_DB`: `jx_portal` (optional, this is the default).
   - Optional, both or neither: `JX_PORTAL_URL` = `https://play.jazaix.com` and `JX_ADMIN_API_TOKEN` = a long random
     string. The SAME token value goes into the portal (step 5). Without them, refund and hold are disabled.
   - Optional: `RESEND_API_KEY` (and `JX_EMAIL_FROM`, `JX_EMAIL_REPLY_TO`) for the approval email.
3. **Domain**: Project > Settings > Domains > add `admin.jazaix.com`; add the CNAME Vercel shows at the DNS provider.
4. **Google OAuth**: in the Google Cloud console, either create a new OAuth client (Web application) or add to the
   existing portal client the authorised redirect URI `https://admin.jazaix.com/api/auth/callback/google` (and the
   authorised JavaScript origin `https://admin.jazaix.com`). Put its id and secret in step 2.
5. **Portal side**, only if the money actions are wanted (jx-portal env on the box, `/etc/jx/portal.env`):
   `JX_ADMIN_API_TOKEN` with the same value as here (32 characters or more). No origin setting is needed: the calls
   are server to server. The portal verifies the bearer token and re-checks the `X-Jx-Admin-Email` role in its
   database on every call.
6. **Check**: `https://admin.jazaix.com/api/health` answers `{ "ok": true, "mongo": true, "portal": true | null }`;
   sign in with an admin email; the dashboard shows the waitlist counts, the account count and the JBux totals.

## Production MongoDB
Vercel functions run on the internet and must reach the database over it. The current production Mongo lives on the
EC2 box without public access, so the console cannot use it as it is. Production needs **MongoDB Atlas** (or an
equivalent cluster reachable from Vercel, with TLS and authentication): the `mongodb+srv://` URI, with a user whose
rights are limited to `jx_portal`, goes into `MONGODB_URI`. Until the portal's data lives in such a cluster (or the
box's Mongo is exposed behind TLS + auth + an IP allowlist, which is the weaker option), the console works locally and
against any reachable copy, and production shows "The platform database could not be reached".

Nothing secret is generated or stored in this repository.

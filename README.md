# jx-admin

The Jazaix admin console: a standalone Next.js app, deployed on Vercel at **admin.jazaix.com**, decoupled from the
portal (jx-portal at https://play.jazaix.com). It shows the portal waitlist (approve, move back) and the JBux ledger
report (refunds, wallet holds). It owns no data and has no database: every read and write is carried out by the
portal's admin API.

## Architecture in a few lines
- **Sign-in**: Auth.js (next-auth v5) with Google only, JWT sessions, no adapter.
- **Who is an admin**: both must hold. The email is on `JX_DEVELOPER_EMAILS` (comma list, case-insensitive) AND the
  portal confirms role `admin` for that email (`GET {JX_PORTAL_URL}/api/admin/me`). Non-admins see "Not an admin"
  with Sign out; signed-out visitors land on `/sign-in`.
- **Server-only portal client** (`src/lib/portal.ts`): calls `{JX_PORTAL_URL}/api/admin/...` with
  `Authorization: Bearer {JX_ADMIN_API_TOKEN}` and `X-Jx-Admin-Email: <the acting admin>`, 10 s timeout, never the
  browser's cookies. The token never reaches the browser.
- **Own API** (`src/app/api/`): `/api/waitlist` (GET, POST), `/api/jbox/report` (GET), `/api/jbox/refund` (POST),
  `/api/jbox/hold` (POST), `/api/me` (GET), `/api/health` (GET, no auth). Every handler except `/api/auth/*` and
  `/api/health` goes through the admin gate; every POST also passes the same-origin JSON check (CSRF).
  Portal 401/403 become a 502 (service token or role wrong on the server side), portal 5xx and timeouts a 504.
- **Pages**: `/` dashboard, `/waitlist`, `/jbux`, `/sign-in`. Pure black + green tokens from the portal, light theme
  mirrored (toggle in the top bar), mobile width with 16 px gutters, `noindex` everywhere, security headers on every
  response (frame-ancestors none, nosniff, strict-origin-when-cross-origin).

## Local run
```
export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PATH; unset CC
npm ci --no-audit --no-fund
cp .env.example .env.local      # fill the values; AUTH_URL=http://127.0.0.1:3400 locally
npm run dev                     # http://127.0.0.1:3400 (next dev --webpack)
```
Google sign-in locally needs `http://127.0.0.1:3400/api/auth/callback/google` on the OAuth client, and the portal
you point `JX_PORTAL_URL` at must accept the same `JX_ADMIN_API_TOKEN`.

Checks (all three must pass before a push):
```
npm test            # 33 node:test cases: gate, portal client, same-origin, env, route source pins
npm run typecheck   # tsc --noEmit
npm run build       # next build --webpack
```

## Vercel setup (owner checklist)
1. **Create the project**: Vercel > Add New > Project > import the GitHub repo `jazaix/jx-admin`. Framework Next.js,
   build command `npm run build` (vercel.json already says so), production branch `main`.
2. **Environment variables** (Production, and Preview if you want preview deploys to work):
   - `AUTH_SECRET`: a long random string (for example `openssl rand -base64 32`).
   - `AUTH_URL`: `https://admin.jazaix.com`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the Google OAuth client (step 4).
   - `JX_DEVELOPER_EMAILS`: comma-separated admin emails (the same list the portal uses).
   - `JX_PORTAL_URL`: `https://play.jazaix.com`
   - `JX_ADMIN_API_TOKEN`: a long random string. The SAME value goes into the portal (step 5).
3. **Domain**: Project > Settings > Domains > add `admin.jazaix.com`; add the CNAME Vercel shows at the DNS provider.
4. **Google OAuth**: in the Google Cloud console, either create a new OAuth client (Web application) or add to the
   existing portal client the authorised redirect URI `https://admin.jazaix.com/api/auth/callback/google` (and the
   authorised JavaScript origin `https://admin.jazaix.com`). Put its id and secret in step 2.
5. **Portal side** (jx-portal env on the box, `/etc/jx/portal.env`): `JX_ADMIN_API_TOKEN` with the same value as here
   (32 characters or more). No origin setting is needed: the calls are server to server. The portal verifies the bearer token and re-checks the
   `X-Jx-Admin-Email` role in its database on every call.
6. **Check**: `https://admin.jazaix.com/api/health` answers `{ "ok": true, "portal": true }`; sign in with an admin
   email; the dashboard shows the waitlist counts and the JBux totals.

Nothing secret is generated or stored in this repository.

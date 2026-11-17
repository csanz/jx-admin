# jx-admin

The Jazaix admin console: a standalone Next.js app, deployed on Vercel at **admin.jazaix.com** (GitHub
`csanz/jx-admin`), decoupled from the portal (jx-portal at https://play.jazaix.com). It has its own data layer: it
reads and writes the platform database (MongoDB, the portal's `jx_portal`) directly. It shows the users (search, set
role), the portal waitlist (approve, move back), the games (read only), the cosmetics catalog, the JBux ledger report
and the audit trail of admin actions. Only the two money actions (a JBux
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
  - `repo/audit.ts`: every write appends `admin_actions { at, actor, action, target, via: "admin-console" }`; the
    read side lists them (newest first, filter by actor and action).
  - `repo/games.ts`: games list (search slug / name / creator, sort by plays / rounds / updated) and one game with
    its keys (count, label, environment, status, created; never a key value), join requests and last 20 rooms.
    Read only.
  - `repo/catalog.ts`: the cosmetics catalog, every field the documents carry. Read only.
  - `repo/paging.ts`, `repo/values.ts`: 50-row pages with a "more" control (bounded), stored values as display text.
- **Approval email**: on approve, the portal's "You're in" email goes through Resend (`src/lib/email.ts`) when
  `RESEND_API_KEY` is set (`JX_EMAIL_FROM`, `JX_EMAIL_REPLY_TO` optional) and the outcome is recorded on the user
  as `waitlistEmails.approved`, as the portal does. Without the key, approving works and the UI says no email was sent.
- **Money actions through the portal** (`src/lib/portal.ts`): `/api/jbox/refund` and `/api/jbox/hold` call
  `{JX_PORTAL_URL}/api/admin/jbox/...` with `Authorization: Bearer {JX_ADMIN_API_TOKEN}` and
  `X-Jx-Admin-Email: <the acting admin>`, 10 s timeout, never the browser's cookies. `adminRefund` and `setHold`
  (splits, pots, entitlement revocation) stay in the portal on purpose: one implementation of the money rules; this
  console never writes `wallets` or `credit_transactions`. The link is optional (both or neither): without it the
  two forms show "money actions need the portal link" and are disabled; everything else works on MongoDB alone.
- **Own API** (`src/app/api/`, for the client components): `/api/waitlist` (GET, POST), `/api/users` (GET `?q=&skip=`, POST), `/api/jbox/report` (GET),
  `/api/jbox/refund` (POST, portal), `/api/jbox/hold` (POST, portal), `/api/me` (GET), `/api/health` (GET, no auth:
  `{ ok, mongo, portal }`). Every handler except `/api/auth/*` and `/api/health` goes through the admin gate; every
  POST also passes the same-origin JSON check (CSRF). An unreachable database is a 504 `db-unavailable`.
- **Pages**: every page sits inside the console shell (left sidebar + content pane, see "Navigation" below) except
  `/sign-in`. Server components read through the repos; client components only where a page needs interaction
  (users, waitlist, JBux forms). An unreachable database is a visible message on the page, never a blank 500.
  The product theme (see "Theme" below), light theme mirrored (toggle at the sidebar bottom), `noindex`
  everywhere, security headers on every response (frame-ancestors none, nosniff, strict-origin-when-cross-origin).
  The tab icon is the Jazaix mark in orange (`public/favicon.ico`, `public/apple-touch-icon.png`), so an admin tab
  never looks like the portal's black one.

## Navigation
A persistent left sidebar (240 px; under 900 px it is a drawer behind the Menu button) lists the top-level objects
with their items beneath, the active item highlighted. The content sits in the middle under a page header (section
crumb + title). The signed-in email, the theme toggle and Sign out are at the sidebar bottom. The tree is declared
once, in `src/lib/nav.ts`; every page lives in the `src/app/(console)` route group, whose layout renders the shell.

| Sidebar | Route | What it shows |
| --- | --- | --- |
| Overview | `/` | the four counts (waiting, approved, accounts, real JBux) and the 10 newest admin actions |
| Users > List | `/users` | search by email / username / name, role, waitlist state, set role; 50 a page, "more"; each row opens the user |
| (User detail) | `/users/[id]` | every field of the users row (token / secret / hash fields redacted), role (settable), waitlist state, wallet summary, sign-ins (first + latest: all the portal stores), play history and game sessions (50 a page each) |
| Users > Waitlist | `/users/waitlist` | waiting and approved, approve, move back (`/waitlist` redirects here) |
| Games > List | `/games` | search slug / name / creator, sort by plays / rounds / updated; 50 a page, "more" |
| (Games detail) | `/games/[slug]` | the game's fields and counters, keys (no key values), join requests, its rooms (25 a page, `?page=`) |
| Games > Rooms | `/games/rooms` | every room, newest updated first, filter by game and state, 25 a page with previous / next |
| (Room detail) | `/games/rooms/[roomId]` | every field of the room, its sessions, matches (with timeline), server event log (newest or oldest first), latest live snapshots (formatted JSON), client reports; each list capped and counted |
| Assets > Catalog | `/assets/catalog` | the `catalog` collection, every field; the asset registry (jxasset) is not built yet |
| JBux > Report | `/jbux` | the ledger report; refund and wallet hold (portal link) |
| Audit > Admin actions | `/audit` | `admin_actions`, newest first, 100 a page, filter by actor and action |

Games, rooms, catalog and audit are read only in this version. Every table fits the content pane (fixed layout,
long values wrap or truncate with the full value in a tooltip, short dates); there is no inner horizontal scroll
anywhere (`test/avatar-theme-layout.test.mjs` pins it). Avatars fall back to the portal's own fallback, the first
letter on the surface colour, when a user has no picture or it fails to load; a portal-stored photo
(`/api/images/...`) is loaded from `JX_PORTAL_URL` when that is set.

## Theme
The admin uses the product theme, the portal's `@theme` tokens copied verbatim from `jx-portal/src/app/globals.css`
(dark: bg `#000000`, surface `#0b0b0c`, text `#ededed`, accent green `#22c55e`, notice `#f25a1a`, ...; light: the
portal's light block, accent `#15803d`, notice `#c2410c`, ...), and the same fonts loaded the same way (Geist for
sans, JetBrains Mono for mono via `next/font/google`, body in `font-mono`). `test/avatar-theme-layout.test.mjs` reads
the portal's file and fails when a value drifts.

**The one admin difference**: the admin accent is the brand's secondary colour, the notice orange (`#f25a1a` dark,
`#c2410c` light), as the `--color-admin` token (`text-admin`, `bg-admin`, `bg-admin-hover`, `text-admin-ink`). It
colours the JX mark in the sidebar lockup, the active sidebar item, focus rings, links and primary buttons, so an
admin tab is unmistakable next to the green player portal. Green (`text-success`) stays for success and approved
states. No component uses the green `accent` classes (a test pins it).

**Lockup**: the portal's JX mark (`public/brand/jx-mark-v2.svg`, inlined in `src/components/Brand.tsx` with
`fill: currentColor`) in the admin colour, the Jazaix wordmark (cropped from the portal's horizontal logo into
`public/brand/jazaix-wordmark.png`, drawn as a mask so it takes the text colour) and the ADMIN tag. The sidebar, the
mobile strip and the sign-in page use it.

**Header band**: the sidebar's logo row and every page's crumb row are one band of the same height
(`--spacing-header`, class `h-header`), vertically centred with the same bottom border; the page title starts below.

## What uses what
| Section | Reads | Writes |
| --- | --- | --- |
| Admin gate | MongoDB `users` (role) | nothing |
| Waitlist | MongoDB `users` | MongoDB `users` (+ `admin_actions`), Resend for the email |
| Users | MongoDB `users` | MongoDB `users.role` (+ `admin_actions`) |
| Games | MongoDB `games`, `game_keys` (label, environment, status, created only), `game_join_requests`, `rooms`, `users` (emails) | nothing |
| Rooms | MongoDB `rooms`, `game_sessions`, `matches`, `server_events`, `live_snapshots`, `client_reports` (all by `room_id`) | nothing |
| User detail | MongoDB `users` (secrets redacted), `wallets`, `play_history` (+ `games` names), `game_sessions` (by `player_id`) | `users.role` through the same set-role control |
| Assets catalog | MongoDB `catalog` | nothing |
| Audit | MongoDB `admin_actions` | nothing (the other sections append to it) |
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
   sign in with an admin email; the overview shows the waitlist counts, the account count and the JBux totals.

## Production MongoDB
Vercel functions run on the internet and must reach the database over it. The current production Mongo lives on the
EC2 box without public access, so the console cannot use it as it is. Production needs **MongoDB Atlas** (or an
equivalent cluster reachable from Vercel, with TLS and authentication): the `mongodb+srv://` URI, with a user whose
rights are limited to `jx_portal`, goes into `MONGODB_URI`. Until the portal's data lives in such a cluster (or the
box's Mongo is exposed behind TLS + auth + an IP allowlist, which is the weaker option), the console works locally and
against any reachable copy, and production shows "The platform database could not be reached".

Nothing secret is generated or stored in this repository.

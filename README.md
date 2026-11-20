# jx-admin

The Jazaix admin console: a standalone Next.js app, deployed on Vercel at **admin.jazaix.com** (GitHub
`csanz/jx-admin`), decoupled from the portal (jx-portal at https://play.jazaix.com). It has its own data layer: it
reads and writes the platform database (MongoDB, the portal's `jx_portal`) directly. It shows the users (search, set
role, one page per user), the portal waitlist (approve, move back), the games and their rooms (read only), JBux
(purchases, the priced catalog with its sales, sellers, wallets, the ledger) and the audit trail of admin actions. Only the two money actions (a JBux
refund, a wallet hold) are carried out by the portal's admin API, because those are the ledger's money rules and must
have one implementation.

## Architecture in a few lines
- **Sign-in**: Auth.js (next-auth v5) with Google only, JWT sessions, no adapter.
- **Who is an admin**: both must hold. The email is on `JX_DEVELOPER_EMAILS` (comma list, case-insensitive) AND the
  `users` row for that email (looked up lower-cased) holds role `admin`, read from MongoDB on every request (a
  demotion takes effect at once). Non-admins see a plain "Access forbidden" page with a link back to jazaix.com and nothing else: no rail, no links into the console, no admin wording, no email (the shell decides before any page or menu renders); signed-out visitors land on `/sign-in`.
- **Data layer** (`src/lib/mongo.ts` + `src/lib/repo/*.ts`): the official `mongodb` driver (6.x, the portal's
  major), one cached client (serverless-safe, 5 s server selection timeout, never opened at import time), env
  `MONGODB_URI` and `MONGODB_DB` (default `jx_portal`). The repo modules take a `Db` and have no framework imports:
  - `repo/users.ts`: the role lookup behind the gate, search by email / username / name, the list's order and
    filters (the shared, browser-safe parts are `src/lib/user-order.ts` and `src/lib/user-filter.ts`), set role.
  - `repo/users-overview.ts`: the Users overview (accounts in numbers, new accounts and players per day, last seen).
  - `repo/waitlist.ts`: the portal's waitlist model, field for field (access, approvedAt, approvedBy, waitlistedAt,
    waitlistEmails), so the portal keeps working against the same rows.
  - `repo/jbux-report.ts`: the portal's JBux admin report (read side), test money apart from real money.
  - `repo/audit.ts`: every write appends `admin_actions { at, actor, action, target, via: "admin-console" }`; the
    read side lists them (newest first, filter by actor and action).
  - `repo/games.ts`: games list (search slug / name / creator, sort by plays / rounds / updated) and one game with
    its keys (count, label, environment, status, created; never a key value), join requests and last 20 rooms.
    Read only.
  - `repo/catalog.ts`: the cosmetics catalog, every field the documents carry. Read only.
  - `repo/rooms.ts`: rooms (25 a page, filters) and one room with everything that names its `room_id`. Read only.
  - `repo/user-detail.ts`: one user, secrets redacted, wallet, sign-ins, play history, game sessions. Read only.
  - `repo/games-overview.ts`: the games overview's series and ranking (game_sessions, matches, daily_stats; bots left out).
  - `repo/user-activity.ts`: one user's plays per UTC day over 1 week / 1 month / 1 year (`?activity=7|30|365`), for the activity line.
  - `repo/jbux-sales.ts`: purchases (receipts, KPIs, top lists), the catalog with its sales, sellers, wallets.
    Read only.
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
- **Own API** (`src/app/api/`, for the client components): `/api/waitlist` (GET, POST), `/api/users` (GET `?q=&skip=&sort=&dir=&active=&kind=&af=&at=&created=&cf=&ct=&role=&access=`, POST), `/api/jbox/report` (GET),
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
The left rail IS the portal's left rail (jx-portal `LeftRail.tsx` + `AppShell.tsx`, owner 2026-11-17: "same size,
same colour, same icon, same location; the only difference is that the logo is a different colour"): the surface
aside, 240 px (72 px collapsed with the panel toggle in the logo row or Ctrl/Cmd+B; a 260 px drawer behind the
hamburger bar under 768 px), the logo row (pt-6 pb-4, the mark at 32 px), the account chip (the admin's own user
page), 40 px rows with 20 px stroke icons (`src/components/rail-row.tsx`, the portal's `railRow` and `Icon`), the
portal's active (`bg-bg text-text`) and hover colours, the dividers, and the theme row in the footer. The admin's
additions inside that geometry: every section's items sit under it at all times, indented to the label (a stable
tree: nothing opens or closes as you move between pages, only the page's own row is lit; a one-page section is one
row), and a Sign out row sits under the theme row. The content sits beside the rail under a page header (section crumb + title). The tree is
declared once, in `src/lib/nav.ts` (labels, hrefs and icon paths); every page lives in the `src/app/(console)` route
group, whose layout renders the shell. `test/rail-parity.test.mjs` compares the geometry and colour strings with the
portal's source when jx-portal is checked out next to this repo.

| Sidebar | Route | What it shows |
| --- | --- | --- |
| Overview | `/` | analytics home: the four counts in one row, the 1 week / 1 month / 1 year switch (`?range=7|30|365`, the same switch as the Games and Users overviews), eight line charts (players, sessions seated vs watching, play hours, rounds, peak concurrent, new accounts, JBux spent by pot + purchases, client errors vs reports), the per-game table for the range, the 5 newest admin actions |
| Users > Overview | `/users/overview` | player traffic across the board for 1 week / 1 month / 1 year (`?activity=7|30|365`): accounts, new, active, returning, waitlist and never-active tiles; new accounts per day; players per day across every game split into accounts and guests (the games overview's source and rule); every account by when it was last seen (today / this week / this month / older / never), each a link into the filtered list. Bots left out |
| Users > List | `/users` | search by email / username / name, role, waitlist state, created, last active ("2 days ago": the later of the last sign-in and the last play), set role; sortable by name, created or last active; filters in the URL: an activity window (last 24 hours / 5 / 7 / 30 days or a range of UTC days) counting plays, sign-ins or either, a created window, role, waitlist state; "who played this week" = `/users?active=7d&kind=played`; 50 a page, "more"; each row opens the user |
| (User detail) | `/users/[id]` | every field of the users row (token / secret / hash fields redacted), role (settable), waitlist state, wallet summary, sign-ins (first + latest: all the portal stores), the activity line (plays per day, 1 week / 1 month / 1 year), play history and game sessions (50 a page each) |
| Users > Waitlist | `/users/waitlist` | waiting and approved, approve, move back (`/waitlist` redirects here) |
| Games > Overview | `/games/overview` | activity for 1 week / 1 month / 1 year (`?activity=7|30|365`): players and sessions per day across every game, the most active games ranked, and a players-per-day line for each of the top 10 |
| Games > List | `/games` | search slug / name / creator, sort by plays / rounds / updated; 50 a page, "more" |
| (Games detail) | `/games/[slug]` | the game's fields and counters, keys (no key values), join requests, its rooms (25 a page, `?page=`) |
| Games > Rooms | `/games/rooms` | every room, newest updated first, filter by game and state, 25 a page with previous / next |
| (Room detail) | `/games/rooms/[roomId]` | every field of the room, its sessions, matches (with timeline), server event log (newest or oldest first), latest live snapshots (formatted JSON), client reports; each list capped and counted |
| Content > Clips | `/content/clips` | every clip in the clips pipeline (jx-replays clips API, `JX_CLIPS_API_URL`), newest first, filter by game and featured, 25 a page with previous / next; read only; without the URL the page says clips are not connected |
| Assets > Registry | `/assets` | the asset registry (jxasset) is not built yet; links to JBux > Catalog (`/assets/catalog` redirects there) |
| JBux > Purchases | `/jbux` | KPI tiles (today, 7 and 30 days: purchases, JBux spent by pot, real revenue, refunds), top 5 items and games in the date range, every receipt newest first with filters (game, kind, funding, state, env, sku, buyer, dates), 50 a page |
| JBux > Catalog | `/jbux/catalog` | every priced item with its sales (count, JBux gross by pot, last sale), sort by gross / sales / sku; an item opens its receipts |
| JBux > Sellers | `/jbux/sellers` | one row per creator: games, items on sale, purchases, gross real / test / promo, last sale (gross figures, see below) |
| (Seller detail) | `/jbux/sellers/[key]` | that seller's sales by item (`key` = the creator's user id, or `jazaix`) |
| JBux > Wallets | `/jbux/wallets` | every wallet's pots, sort by real (default) / balance / promo / test / updated; promo and test outstanding |
| JBux > Ledger | `/jbux/ledger` | the ledger report; refund and wallet hold (portal link), unchanged |
| Audit > Admin actions | `/audit` | `admin_actions`, newest first, 100 a page, filter by actor and action |

Games, rooms, JBux purchases / catalog / sellers / wallets and audit are read only in this version. Every table fits the content pane (fixed layout,
long values wrap or truncate with the full value in a tooltip, short dates); there is no inner horizontal scroll
anywhere (`test/avatar-theme-layout.test.mjs` pins it). Avatars fall back to the portal's own fallback, the first
letter on the surface colour, when a user has no picture or it fails to load; a portal-stored photo
(`/api/images/...`) is loaded from `JX_PORTAL_URL` when that is set.

## Analytics (the overview)
- `src/lib/repo/analytics.ts` aggregates on the server, one pipeline per source, bucketed by UTC day
  (`$toDate` on the stored field, so a Date or an ISO string both work, then `$dateToString` in UTC); the code fills
  missing days with zeros. Players, sessions, play time and rounds fall back to `daily_stats` when the raw collection
  is empty for the range (the chart says "from daily_stats"). Bot sessions and bot accounts are left out.
- Charts: Recharts (pinned `recharts@3.10.1`) in one client component, `src/components/charts/LineChartPanel.tsx`,
  which receives the finished points from the server page (no API round trip; the range is the query string).
  Colours come only from the theme tokens through the `.jx-chart` rules in `globals.css` (series 1 = the admin accent,
  2 = text-muted, 3 = text-subtle dashed), so both themes follow.
- **To add a series**: add a pipeline (or a field to an existing one) in `getAnalytics` that returns
  `{ _id: "YYYY-MM-DD", <field>: n }` rows, `zeroFill(keys, rows, ["<field>"])` it into the result with its total, then
  add a `<LineChartPanel title=... total=... points=... series={[{ key: "<field>", label: ... }]} />` to
  `src/app/(console)/page.tsx`. Add a test for any new roll-up in `test/analytics.test.mjs`.

## JBux figures
- A **purchase** is a `jbox_receipts` row. Counts include every receipt; JBux sums (spent, gross, revenue) leave
  refunded receipts out. Refunds are counted from `credit_transactions` (kind `refund`). **Real revenue** is the real
  pot only; test and promo JBux are never money. Days are UTC.
- **Env**: on a production deployment (`NODE_ENV=production`) the pages default to env `prod`; elsewhere to every
  env. The env switch at the top picks another (`?env=all|prod|staging|dev|local`). Note: `next start` runs with
  `NODE_ENV=production`, so a local `next start` against the local database (env `local` receipts) shows nothing until
  you pick `all` or `local`.
- **Sellers** are derived, there is no seller ledger: the receipt's sku, the catalog item, its `gameId`, the game's
  `creator_id`. Platform-wide items (`gameId` null) and items whose game has no creator are attributed to **Jazaix**;
  a sold sku that left the catalog goes through the game it sold in. The figures are **gross**: the platform share and
  payouts are not defined yet (owner decision pending), so nothing on those pages is an amount owed.
- The database does the grouping (aggregation pipelines by UTC day and by sku in `src/lib/repo/jbux-sales.ts`); the
  roll-ups into windows, top lists and sellers are pure functions tested in `test/repo-jbux-sales.test.mjs`.

## Theme
The admin uses the product theme, the portal's `@theme` tokens copied verbatim from `jx-portal/src/app/globals.css`
(dark: bg `#000000`, surface `#0b0b0c`, text `#ededed`, accent green `#22c55e`, notice `#f25a1a`, ...; light: the
portal's light block, accent `#15803d`, notice `#c2410c`, ...), and the same fonts loaded the same way (Geist for
sans, JetBrains Mono for mono via `next/font/google`, body in `font-mono`). `test/avatar-theme-layout.test.mjs` reads
the portal's file and fails when a value drifts.

**The one admin difference**: the admin accent is the brand's secondary colour, the notice orange (`#f25a1a` dark,
`#c2410c` light), as the `--color-admin` token (`text-admin`, `bg-admin`, `bg-admin-hover`, `text-admin-ink`). It
colours the JX mark in the rail (the rail's one difference from the portal's), focus rings, links and primary
buttons, so an admin tab is unmistakable next to the green player portal. Green (`text-success`) stays for success and approved
states. No component uses the green `accent` classes (a test pins it).

**Lockup**: the portal's JX mark (`public/brand/jx-mark-v2.svg`, inlined in `src/components/Brand.tsx` with
`fill: currentColor`) in the admin colour, the Jazaix wordmark (cropped from the portal's horizontal logo into
`public/brand/jazaix-wordmark.png`, drawn as a mask so it takes the text colour) and the ADMIN tag, on the sign-in and
config pages. The rail draws the mark alone, where the portal draws its logo; the forbidden page draws the mark alone
too, with no wordmark and no tag.

**Header band**: the rail's logo row (the portal's 24 + 40 + 16 = 80 px) and every page's crumb row are one band of
the same height (`--spacing-header`, class `h-header`, pt-6 / pb-4, centred in the 40 px inside), no border, so the crumb sits on the
mark's centre line; the title row below is the rail's account row (40 px, centred), so the title sits on the account chip's line.

## What uses what
| Section | Reads | Writes |
| --- | --- | --- |
| Admin gate | MongoDB `users` (role) | nothing |
| Overview analytics | MongoDB `game_sessions`, `matches`, `daily_stats`, `users`, `credit_transactions`, `jbox_receipts`, `client_reports`, `games` | nothing |
| Waitlist | MongoDB `users` | MongoDB `users` (+ `admin_actions`), Resend for the email |
| Users | MongoDB `users` | MongoDB `users.role` (+ `admin_actions`) |
| Games | MongoDB `games`, `game_keys` (label, environment, status, created only), `game_join_requests`, `rooms`, `users` (emails, names) | MongoDB `games.contributors[]` (a game's admins and contributors, + `admin_actions`) |
| Rooms | MongoDB `rooms`, `game_sessions`, `matches`, `server_events`, `live_snapshots`, `client_reports` (all by `room_id`) | nothing |
| User detail | MongoDB `users` (secrets redacted), `wallets`, `play_history` (+ `games` names), `game_sessions` (by `player_id`) | `users.role` through the same set-role control |
| Content > Clips | clips API `GET /api/clips` (public list, no token), MongoDB `games` (slugs for the filter) | nothing |
| Audit | MongoDB `admin_actions` | nothing (the other sections append to it) |
| JBux report (ledger) | MongoDB `credit_transactions`, `wallets`, `users` | nothing |
| JBux purchases, catalog, sellers, wallets | MongoDB `jbox_receipts`, `credit_transactions` (refunds), `catalog`, `games` (creators), `wallets`, `users` | nothing |
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
   - Optional: `JX_JBUX_DEFAULT_ENV` = `all` or one env (`local`, `dev`, `staging`, `prod`): the JBux pages' default env filter (a production build defaults to `prod`; use `all` when reviewing a production build against local data).
   - Optional, both or neither: `JX_PORTAL_URL` = `https://play.jazaix.com` and `JX_ADMIN_API_TOKEN` = a long random
     string. The SAME token value goes into the portal (step 5). Without them, refund and hold are disabled.
   - Optional: `RESEND_API_KEY` (and `JX_EMAIL_FROM`, `JX_EMAIL_REPLY_TO`) for the approval email.
   - Optional: `JX_CLIPS_API_URL` = `https://clips-api.jazaix.com` for Content > Clips (its public list, no token). Unset, that page says clips are not connected.
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

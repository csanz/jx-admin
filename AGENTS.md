# jx-admin: rules for agents

The Jazaix admin console, a standalone Next.js app for admin.jazaix.com (Vercel, GitHub csanz/jx-admin). It has its
OWN data layer: it reads and writes the platform database (MongoDB, the portal's `jx_portal`) directly. Only the two
money actions (JBux refund, wallet hold) still go to the portal's admin API with a service token.

## Rules
- Never write an em dash anywhere (code, comments, UI copy, docs, commits). Use commas, colons or full stops.
  `npm test` fails on one.
- Every commit ends with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on main,
  small commits, no PRs unless the owner asks. The remote is `origin` = git@github.com:csanz/jx-admin.git.
- Node 26 from nvm (`export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PATH; unset CC`). Run every npm, node and
  next command memory-capped and bounded, one heavy job at a time:
  `timeout 900 systemd-run --user --scope -q -p MemoryMax=8G -p MemorySwapMax=0 npm run build`,
  `timeout 120 node --max-old-space-size=2048 --test "test/**/*.test.mjs"`.
  Never leave a dev server running; kill only your own pid in a trap. No headless browsers.
- No secrets in code, logs, tests or docs. `.env.example` holds names only.
- Match the portal's stack exactly (next 16.4.5, react 19.2.3, next-auth 5.0.0-beta.32, tailwind 4, mongodb 6.x,
  the portal's major).
- Never touch `jx_portal` from a test. Integration tests create their own `jxadmin_test_<random>` database and drop it.
- Never port the money mutations (the portal's adminRefund, setHold). The console never writes `wallets` or
  `credit_transactions`; a test pins it.

## Architecture (binding)
1. Sign-in: Auth.js with Google only, JWT sessions, no adapter (`src/lib/auth.ts`).
2. Admin = BOTH: the email is on `JX_DEVELOPER_EMAILS` AND the `users` row for that email (looked up lower-cased)
   holds role `admin`, read from MongoDB on EVERY request (never cached in the session). Pure decision in
   `src/lib/admin-gate.ts`; wiring in `src/lib/require-admin.ts` (the actor carries the row id). Every page renders
   through `gatedPage` (`src/components/AdminGate.tsx`); every route handler calls `requireAdminApi(req, { write })`.
   Exceptions, by name: `/api/auth/*` and `/api/health`. Non-admins see "Not an admin".
3. Data: the official `mongodb` driver, one cached client in `src/lib/mongo.ts` (globalThis, serverless-safe,
   `serverSelectionTimeoutMS` 5000, never created at import time), env `MONGODB_URI` + `MONGODB_DB` (default
   `jx_portal`). EVERY read and write lives in `src/lib/repo/*.ts` (users, waitlist, jbux-report, audit, games,
   catalog, plus the paging and values helpers): plain
   modules that take a `Db`, no framework imports, no `process.env`, so node tests them directly. The fields written
   are the portal's (access, approvedAt, approvedBy, waitlistedAt, waitlistEmails, role), so the portal keeps working
   against the same rows. Every write appends an `admin_actions` document
   `{ at, actor, action, target, via: "admin-console" }`.
4. The money actions: `/api/jbox/refund` and `/api/jbox/hold` proxy the portal through `portalAdminFetch`
   (`src/lib/portal.ts`: `Authorization: Bearer JX_ADMIN_API_TOKEN`, `X-Jx-Admin-Email`, 10 s timeout, no cookies;
   portal 401/403 -> 502, 5xx/timeout -> 504). The link is optional: without `JX_PORTAL_URL` + `JX_ADMIN_API_TOKEN`
   (both or neither) those two routes answer 503 `portal-not-linked` and the forms are disabled. Everything else
   works on MongoDB alone. The browser never calls the portal or the database.
5. Email: the approval email goes through Resend (`src/lib/email.ts`, the portal's template and transport) when
   `RESEND_API_KEY` is set; otherwise approving still works and the UI says no email was sent.
6. All env is read in `src/lib/env.ts` (missing names listed, never values). Nothing reads env at import time, so
   `next build` works with no env set.
7. Logic that is tested lives in plain `.ts` modules under `src/lib` with no JSX and explicit `.ts` import extensions,
   so node 26 runs them directly (`erasableSyntaxOnly` is on: no enums, no parameter properties). Route handlers keep
   the same-origin JSON check on writes (`src/lib/same-origin.ts`); pages read the session server-side.

8. Navigation: the sidebar tree is declared in ONE place, `src/lib/nav.ts` (sections and their items). A new section
   or item is added there, with its page under `src/app/(console)/`; the sidebar, the active highlight and the page
   header crumb follow from it. EVERY page lives inside the shell: under the `(console)` route group (its layout
   renders `<Shell>`), renders through `gatedPage`, and starts with `<PageHeader path=... title=... />`. Only
   `/sign-in` sits outside. Pages are server components that read through the repos (`loadForPage` turns an
   unreachable database into a visible message); a client component only where interaction needs it. Lists page at
   50 (`src/lib/repo/paging.ts`) with a "more" control. `test/shell-layout.test.mjs` pins the tree, the group, the
   gate, the README routes and the `/waitlist` redirect. Add the route to the README "Navigation" table.
9. Games, catalog and audit are read only. `game_keys` is read with a projection of label, environment, status and
   createdAt only: a key value (or its prefix) never leaves the database (`test/repo-games.test.mjs`).

## Checks before a push
```
npm test          # node:test, test/**/*.test.mjs (gate, repos with fakes, email, env, route source pins)
JX_TEST_MONGO_URI='mongodb://localhost:27018/?replicaSet=jx-db-local-rs&directConnection=true' npm test
                  # the same plus the integration tests (own throwaway database)
npm run typecheck # tsc --noEmit
npm run build     # next build --webpack
```

# jx-admin: rules for agents

The Jazaix admin console, a standalone Next.js app for admin.jazaix.com (Vercel). It owns no data: every read and
write goes to the portal's admin API (jx-portal, https://play.jazaix.com) with a service token.

## Rules
- Never write an em dash anywhere (code, comments, UI copy, docs, commits). Use commas, colons or full stops.
  `npm test` fails on one.
- Every commit ends with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on main,
  small commits, no PRs unless the owner asks.
- Node 26 from nvm (`export PATH=$HOME/.nvm/versions/node/v26.12.1/bin:$PATH; unset CC`). Run every npm, node and
  next command memory-capped and bounded, one heavy job at a time:
  `timeout 900 systemd-run --user --scope -q -p MemoryMax=8G -p MemorySwapMax=0 npm run build`,
  `timeout 120 node --max-old-space-size=2048 --test "test/**/*.test.mjs"`.
  Never leave a dev server running; kill only your own pid in a trap. No headless browsers.
- No secrets in code, logs, tests or docs. `.env.example` holds names only.
- Match the portal's stack exactly (next 16.4.5, react 19.2.3, next-auth 5.0.0-beta.32, tailwind 4). No database
  driver here, ever.

## Architecture (binding)
1. Sign-in: Auth.js with Google only, JWT sessions, no adapter (`src/lib/auth.ts`).
2. Admin = BOTH: the email is on `JX_DEVELOPER_EMAILS` AND the portal answers role `admin` for it on
   `GET {JX_PORTAL_URL}/api/admin/me`. Pure decision in `src/lib/admin-gate.ts`; wiring in `src/lib/require-admin.ts`.
   Every page renders through `gatedPage` (`src/components/AdminGate.tsx`); every route handler calls
   `requireAdminApi(req, { write })`. Exceptions, by name: `/api/auth/*` and `/api/health`.
3. The browser never calls the portal. Route handlers under `src/app/api/` gate, check same-origin JSON on POST
   (`src/lib/same-origin.ts`), and proxy through `portalAdminFetch` (`src/lib/portal.ts`): headers
   `Authorization: Bearer JX_ADMIN_API_TOKEN` and `X-Jx-Admin-Email: <session email>`, 10 s timeout, no cookies.
   Portal 401/403 -> 502, portal 5xx/timeout -> 504, everything else passes through.
4. All env is read in `src/lib/env.ts` (missing names listed, never values). Nothing reads env at import time, so
   `next build` works with no env set.
5. Logic that is tested lives in plain `.ts` modules under `src/lib` with no JSX and explicit `.ts` import extensions,
   so node 26 runs them directly (`erasableSyntaxOnly` is on: no enums, no parameter properties).

## Checks before a push
```
npm test          # node:test, test/**/*.test.mjs (gate, portal client, same-origin, env, route source pins)
npm run typecheck # tsc --noEmit
npm run build     # next build --webpack
```

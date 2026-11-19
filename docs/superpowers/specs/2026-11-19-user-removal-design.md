# User removal from the admin console

Owner, 2026-11-19: "you need to have the ability to remove users from the admin. I'm going to use this for testing
as well. And then there's two types. One, it removes if it sets it to remove in a few days, and then one that
basically brute force deletes it in removes all the data all the information from everything else."

Decisions taken with the owner the same day: during the grace period the person is **locked out at once and an
admin can undo**; the immediate delete is a **complete wipe** (nothing survives in anonymised form).

## 1. Scope

Two actions on a user, from the console:

| Action | What happens | Reversible |
| --- | --- | --- |
| **Remove in 3 days** (scheduled) | The account is locked at once (signed out within five minutes, cannot sign in, tokens revoked, gone from presence and search). Data stays. On the due day the purge below runs. | Yes, **Cancel removal** until the purge runs. |
| **Delete now, everything** (purge) | The purge runs immediately. | No. |

Both are refused for the acting admin's own account and for any other admin (demote first). Both need the username
typed back in the confirmation. Each action, and the cancel, writes an `admin_actions` row.

The grace period is one constant, `REMOVAL_GRACE_DAYS = 3`.

## 2. Where the work runs

The console on Vercel reaches only Mongo. Redis (boards, presence, rate limits, clips queues), the S3 photo bucket
and the clips API are reachable only from the box, where the portal runs. So:

- **The portal owns the removal** (one implementation of "what is a user's data", next to the code that writes
  it), exposed through the existing admin API (`Authorization: Bearer JX_ADMIN_API_TOKEN` +
  `X-Jx-Admin-Email`, the channel the console already uses for JBux refunds and holds).
- **The console drives it**: buttons, confirmation, status, audit, the daily trigger.
- **The data worker purges the boards** on a job the portal enqueues (it already has the rebuild code).

## 3. Data model

On the user row (jx_portal.users):

```
removal: {
  state: "scheduled" | "purging" | "done",
  scheduledAt: Date, dueAt: Date,           // dueAt = scheduledAt + 3 days (scheduled) or = scheduledAt (purge now)
  by: { id, email },                          // the admin
  reason?: string
}
banned: true, bannedAt: Date                  // the existing lock the DB-reading paths honour
cliTokensRevokedAt: Date                      // the existing CLI token revocation
```

Cancel unsets `removal`, `banned`, `bannedAt` (only when `removal.state === "scheduled"`).

A `user_removals` collection keeps the record after the row is gone, one document per removal:

```
{ _id, userId (hex), username, email, kind: "scheduled" | "now", by, scheduledAt, dueAt, startedAt?, finishedAt?,
  steps: { [system]: { state: "pending" | "done" | "failed", at, detail? } } }
```

`steps` is the per-system checklist the console shows (section 5). It is also what makes a retry safe: a step that
is `done` is skipped. The audit row's `target` is the user id, so the trail still reads after the row is gone.

## 4. Lockout (scheduling)

1. `users.updateOne`: set `removal` (state scheduled), `banned: true`, `bannedAt`, `cliTokensRevokedAt`.
2. **Sessions.** jx-portal `src/lib/auth.ts` jwt callback: the token is re-read from the DB at most every five
   minutes; today a missing row keeps the old token. Change: when the row is **missing, banned or has `removal`**,
   return `null`, which ends the session (Auth.js v5). Force the re-read while `removal` is set, as the waitlist
   flag already does. This is the one portal change that touches every request; it only acts on those three states
   and gets its own tests (a scheduled user's next request is signed out; an ordinary user's token is untouched).
3. **Game tokens** expire within the hour; **CLI tokens** are revoked by the stamp; the bearer paths read the DB
   each call and already refuse banned accounts.
4. **Presence and search.** `friend-presence` and the username search filter out `removal`-flagged users. Board
   entries stay visible until the purge (the owner has not asked for hiding them during the grace period).

Cancel reverses step 1; the next token refresh restores the session claims and the person signs in as before.

## 5. The purge

One portal module, `src/lib/account-removal.ts`, with a **declared list** of every place a user's data lives (from
the 2026-11-19 inventory), each entry a step with a name, so the checklist and the tests are driven by the same list:

| Step | What goes |
| --- | --- |
| `profile` | the `users` row (last, after everything else) and `avatars._id = userId` |
| `plays` | `play_history`, `game_interactions`, `player_wardrobe`, `player_equipped`, `game_join_requests` (as requester), `swag_requests`, `cli_tokens.approvedUserId`, `profile_clip_pins` |
| `social` | `friendships` where `users` contains the id (both sides), `user_blocks` as blocker or blocked, `notifications.userId`, and other people's notifications whose `data.from` / `data.userId` is the id |
| `money` | `wallets`, `credit_transactions` (as userId), `entitlements`, `jbox_receipts`, `stripe_checkout_sessions` for the user; Stripe's own customer and session records stay (not deletable from here; noted in the checklist) |
| `studio` | `studio_acl`, `studio_agent_sessions`, `piece_locks`, `playtest_sessions` for the user; `studio_audit` / `studio_changes` keep their rows (an audit trail) with the actor replaced by the removal id |
| `games` | `games.contributors[]` entry removed; a game whose `creator_id` is the user is **not** deleted: the purge refuses with the list of games until they are reassigned (the console shows this before the confirm) |
| `tracking` | `game_sessions` (as player and in `co_players`), `matches.players[]`, `client_reports` for the id in jx_portal |
| `boards` | a `purge-player` job on the `jx-player-data` queue: the data worker deletes `player_game_stats`, `player_aliases`, the player's entries in `rounds`, removes the id from every `jxlb:*` set and rebuilds those boards (its existing `purge.ts` path). The worker reports back by writing `steps.boards` |
| `redis` | `jx:fr:rate:<id>:*`, `jxjoin:rate:<id>:*`, `jx:photo:changes:<id>`, `place:rl:user:<id>`, `jxpd:claim-budget:<id>:*`, the id's entry in `jx:live:sessions` |
| `photos` | every object under `users/<id>/` in the photo bucket |
| `clips` | the clips API's removal path for every clip the user saved (`jx:replay:meta:*` with `savedBy[].pid` = id), which also purges the CDN |

Order: `boards`, `clips`, `photos`, `redis` first (they need the row's ids), then the Mongo steps, `profile` last.
Each step is idempotent (deleting what is already gone is `done`). A failed step leaves the record `purging` with the
failure's detail; **Run again** in the console repeats only the failed steps. The user row is removed only when every
other step is `done`, so a half-purged account is never invisible to the console.

What the purge cannot reach, stated in the checklist and the README: Stripe's records, and the database backups
(daily copies kept 30 days, monthly 180 days).

## 6. API

Portal (new, behind the service token and the admin role check, each writing `admin_actions`):

| Route | Body | Does |
| --- | --- | --- |
| `POST /api/admin/users/:id/removal` | `{ action: "schedule" \| "cancel" \| "purge", confirm: "<username>" }` | the three actions; 409 for self, another admin, a wrong confirm, a creator with games |
| `GET /api/admin/users/:id/removal` | | the `user_removals` record (checklist) |
| `POST /api/admin/removals/run-due` | | purges every `scheduled` removal whose `dueAt` has passed, and retries `purging` records; returns what it did |

Console (own API, proxied with `proxyToPortal`): `POST /api/users/:id/removal`, `GET /api/users/:id/removal`, and
`GET /api/cron/removals` (Vercel cron, daily, `CRON_SECRET` header) calling `run-due`. Without the portal link the
section says "removal needs the portal link" and is disabled, like the money forms.

## 7. Console UI

- **User page**: a **Remove** section at the bottom. Two buttons, each opening the same confirm box (type the
  username, a sentence saying exactly what will happen, the creator-games warning when it applies). A scheduled
  user shows a notice at the top of the page ("Scheduled for removal on <date> by <admin>, Cancel"), the checklist
  while purging, and "Removed on <date>" (from `user_removals`) when the row is gone.
- **Users list**: a "removal <in 2 days>" badge in the Last active cell for scheduled accounts; a filter value
  `access=removal` to list them.
- **Overview tile**: "scheduled for removal: n" when n > 0.
- **Run now**: on a scheduled user past due, or a purging one, a button that calls `run-due` for that id.

## 8. Tests

- Pure: the state machine (schedule / cancel / purge transitions and refusals), the step list is complete against a
  fixture listing every collection and key pattern of the inventory (a new collection that references `userId`
  without a step fails the test), the checklist rendering.
- Mongo integration (portal): seed one user across **every** collection in section 5, run the purge, assert zero
  documents reference the id in any collection and the `user_removals` record is `done`; run it twice (idempotent);
  fail one step and assert the row survives and a rerun finishes.
- Portal auth: a scheduled user's token refresh returns null; a banned user's too; an ordinary user's token is
  unchanged.
- Console: the route and UI pins, the proxy mapping, the cron route's secret check.
- Negative controls copied onto the previous commit.
- The flow on :3400 against the local portal and stack, screenshots shown to the owner before anything ships.

## 9. Repos, order of work, release

1. jx-portal (worktree off `origin/dev`; the local checkout is 84 commits behind and is not touched): the module,
   the routes, the auth change, presence/search filters, tests. Pushed to dev, FINISHED to deploy.
2. jx-data-worker: the `purge-player` job handler (reusing `purge.ts`), reporting into `user_removals`.
3. jx-admin: UI, proxies, cron, tests. Built on :3400, shown, then main.

The portal and worker parts ship in a platform release through deploy; the console part needs them live first (the
section stays disabled until the portal answers the removal routes).

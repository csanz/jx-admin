/**
 * Users > Overview (owner 2026-11-19: "the same thing in overview with player traffic across the board on the users
 * section"): the pure account summary (tiles and last-seen buckets), the latest-play join, and the page wired with the
 * range switch, the tiles, the two charts and the last-seen rows that link into the filtered list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import {
  HUMAN_USER, LAST_SEEN_BUCKETS, accountRow, lastSeenAt, lastSeenBucket, latestPlayByUser, summarizeAccounts,
} from "../src/lib/repo/users-overview.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const NOW = new Date("2026-11-19T12:00:00Z");
const FROM = new Date("2026-10-21T00:00:00Z"); // a 30-day range at NOW

test("lastSeenBucket: today is the UTC day, a week 7 days, a month 30, then older; nothing is never", () => {
  assert.equal(lastSeenBucket(null, NOW), "never");
  assert.equal(lastSeenBucket(new Date("2026-11-19T00:00:00Z"), NOW), "today");
  assert.equal(lastSeenBucket(new Date("2026-11-18T23:59:59Z"), NOW), "week");
  assert.equal(lastSeenBucket(new Date("2026-11-12T12:00:00Z"), NOW), "week");
  assert.equal(lastSeenBucket(new Date("2026-11-12T11:59:59Z"), NOW), "month");
  assert.equal(lastSeenBucket(new Date("2026-10-20T12:00:00Z"), NOW), "month");
  assert.equal(lastSeenBucket(new Date("2026-10-20T11:59:59Z"), NOW), "older");
  assert.deepEqual(LAST_SEEN_BUCKETS, ["today", "week", "month", "older", "never"]);
});

test("lastSeenAt: the later of the sign-in and the play, either alone, or null", () => {
  const row = (lastLoginAt) => ({ id: "x", createdAt: null, lastLoginAt, waitlist: false });
  assert.equal(lastSeenAt(row(new Date("2026-11-01T00:00:00Z")), new Date("2026-11-02T00:00:00Z")).toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(lastSeenAt(row(new Date("2026-11-03T00:00:00Z")), new Date("2026-11-02T00:00:00Z")).toISOString(), "2026-11-03T00:00:00.000Z");
  assert.equal(lastSeenAt(row(null), new Date("2026-11-02T00:00:00Z")).toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(lastSeenAt(row(new Date("2026-11-03T00:00:00Z")), null).toISOString(), "2026-11-03T00:00:00.000Z");
  assert.equal(lastSeenAt(row(null), null), null);
});

test("accountRow and latestPlayByUser: both id forms join; junk dates are null", () => {
  const id = new ObjectId();
  assert.deepEqual(accountRow({ _id: id, createdAt: new Date("2026-11-01T00:00:00Z"), lastLoginAt: "2026-11-02T00:00:00.000Z", access: "waitlist" }), {
    id: id.toHexString(), createdAt: new Date("2026-11-01T00:00:00Z"), lastLoginAt: new Date("2026-11-02T00:00:00Z"), waitlist: true,
  });
  assert.deepEqual(accountRow({ _id: id, createdAt: "nope" }), { id: id.toHexString(), createdAt: null, lastLoginAt: null, waitlist: false });
  const m = latestPlayByUser([
    { _id: id.toHexString(), at: new Date("2026-11-05T00:00:00Z") },
    { _id: id, at: new Date("2026-11-07T00:00:00Z") },
    { _id: "anon_1", at: new Date("2026-11-07T00:00:00Z") },
    { _id: new ObjectId(), at: null },
  ]);
  assert.equal(m.size, 1);
  assert.equal(m.get(id.toHexString()).toISOString(), "2026-11-07T00:00:00.000Z");
});

test("summarizeAccounts: the tiles and the last-seen rows", () => {
  const ids = Array.from({ length: 6 }, () => new ObjectId().toHexString());
  const rows = [
    // signed in today, created long ago: active + returning
    { id: ids[0], createdAt: new Date("2026-09-01T00:00:00Z"), lastLoginAt: new Date("2026-11-19T08:00:00Z"), waitlist: false },
    // played 3 days ago (no sign-in stamp), created inside the range: active, not returning
    { id: ids[1], createdAt: new Date("2026-11-10T00:00:00Z"), lastLoginAt: null, waitlist: false },
    // signed in 20 days ago, created before: active + returning, bucket month
    { id: ids[2], createdAt: new Date("2026-10-01T00:00:00Z"), lastLoginAt: new Date("2026-10-30T00:00:00Z"), waitlist: false },
    // last seen before the range: not active, older
    { id: ids[3], createdAt: new Date("2026-09-01T00:00:00Z"), lastLoginAt: new Date("2026-10-01T00:00:00Z"), waitlist: false },
    // never seen, waiting
    { id: ids[4], createdAt: new Date("2026-11-18T00:00:00Z"), lastLoginAt: null, waitlist: true },
    // never seen, waiting, no created date at all
    { id: ids[5], createdAt: null, lastLoginAt: null, waitlist: true },
  ];
  const plays = new Map([[ids[1], new Date("2026-11-16T10:00:00Z")], [ids[0], new Date("2026-11-01T00:00:00Z")]]);
  const s = summarizeAccounts(rows, plays, FROM, NOW);
  assert.equal(s.accounts, 6);
  assert.equal(s.active, 3);
  assert.equal(s.returning, 2);
  assert.equal(s.waitlist, 2);
  assert.equal(s.neverActive, 2);
  assert.deepEqual(s.lastSeen, [
    { bucket: "today", count: 1, share: 1 / 6 },
    { bucket: "week", count: 1, share: 1 / 6 },
    { bucket: "month", count: 1, share: 1 / 6 },
    { bucket: "older", count: 1, share: 1 / 6 },
    { bucket: "never", count: 2, share: 2 / 6 },
  ]);
  const empty = summarizeAccounts([], new Map(), FROM, NOW);
  assert.equal(empty.accounts, 0);
  assert.ok(empty.lastSeen.every((r) => r.count === 0 && r.share === 0), "no division by zero");
  assert.deepEqual(HUMAN_USER, { role: { $ne: "bot" } });
});

test("the page: gated, the range switch, six tiles, the two charts, the last-seen rows linking into the filtered list; the nav and README know it", () => {
  const page = read("src/app/(console)/users/overview/page.tsx");
  assert.match(page, /gatedPage\(/);
  assert.match(page, /<RangeSwitch days=\{days\} hrefFor=\{hrefFor\}/);
  assert.match(page, /getUsersOverview\(await mongoDb\(\), \{ range: one\(sp\.activity\) \}\)/);
  for (const label of ['label="accounts"', "label={`new, ${range}`}", "label={`active, ${range}`}", 'label="returning"', 'label="on the waitlist"', 'label="never active"']) {
    assert.ok(page.includes(label), `tile ${label}`);
  }
  assert.match(page, /title="New accounts per day"[^>]*series=\{\[\{ key: "accounts"/);
  assert.match(page, /title="Players per day, every game"/);
  assert.match(page, /series=\{\[\{ key: "accounts", label: "accounts" \}, \{ key: "guests", label: "guests" \}\]\}/);
  assert.match(page, /data-testid=\{`last-seen-\$\{row\.bucket\}`\}/);
  assert.match(page, /week: "\/users\?active=7d&sort=active&dir=desc"/);
  assert.match(page, /never: "\/users\?sort=active&dir=asc"/);
  assert.match(page, /<LoadError what="the users overview"/);
  const nav = read("src/lib/nav.ts");
  assert.match(nav, /\{ label: "Overview", href: "\/users\/overview" \},\n\s*\{ label: "List", href: "\/users" \}/);
  assert.match(read("README.md"), /\| Users > Overview \| `\/users\/overview` \|/);
});

test("the list's filter row: the shared module behind the selects, the URL as the state, the kind select only with a window, Clear", () => {
  const ui = read("src/app/(console)/users/UsersConsole.tsx");
  assert.match(ui, /from "@\/lib\/user-filter"/);
  assert.doesNotMatch(ui, /lib\/repo/);
  assert.match(ui, /useSearchParams\(\)/);
  assert.match(ui, /router\.replace\(/);
  for (const id of ["filter-active", "filter-created", "filter-role", "filter-access", "filter-kind", "filters-clear", "users-count", "users-filters"]) {
    assert.ok(ui.includes(`"${id}"`) || ui.includes(`\`filter-\${name}\``), `testid ${id}`);
  }
  assert.match(ui, /\{filter\.active && \(\s*<label[^]*?data-testid="filter-kind"/);
  assert.match(ui, /<option value="range">custom dates<\/option>/);
  assert.match(ui, /type="date"[^>]*data-testid=\{`filter-\$\{name\}-from`\}/);
  assert.match(ui, /userFilterSummary\(filter\)/);
  const route = read("src/app/api/users/route.ts");
  assert.match(route, /const filter = parseUserFilter\(sp\);/);
  assert.match(route, /searchUsers\(await mongoDb\(\), q, skip, order, filter\)/);
  // the page wraps the console in Suspense (useSearchParams)
  assert.match(read("src/app/(console)/users/page.tsx"), /<Suspense fallback=\{null\}>\s*<UsersConsole/);
});

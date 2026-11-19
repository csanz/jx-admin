import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_USER_ORDER, LAST_ACTIVE_STAGES, SETTABLE_ROLES, USER_SORTS, accessOf, decideRoleChange, defaultDir, findUserRoleByEmail, lastActiveOf,
  parseRoleChange, parseUserOrder, regexEscape, roleOf, signupAsOf, userListPipeline, userSearchFilter, userSortSpec, userView,
} from "../src/lib/repo/users.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const ADMIN_ID = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");

/** A fake users collection: findOne by exact field equality on the filter's keys. */
function fakeUsers(docs) {
  return {
    async findOne(filter) {
      return docs.find((d) => Object.entries(filter).every(([k, v]) => (v instanceof ObjectId ? v.equals(d[k]) : d[k] === v))) ?? null;
    },
  };
}

test("findUserRoleByEmail looks the email up lower-cased and answers { id, email, role } (role player when absent)", async () => {
  const users = fakeUsers([
    { _id: ADMIN_ID, email: "owner@jazaix.com", role: "admin" },
    { _id: new ObjectId(), email: "plain@jazaix.com" },
  ]);
  assert.deepEqual(await findUserRoleByEmail(users, "  Owner@Jazaix.COM "), { id: ADMIN_ID.toString(), email: "owner@jazaix.com", role: "admin" });
  assert.equal((await findUserRoleByEmail(users, "plain@jazaix.com")).role, "player");
  assert.equal(await findUserRoleByEmail(users, "nobody@jazaix.com"), null);
  assert.equal(await findUserRoleByEmail(users, "not-an-email"), null);
});

test("decideRoleChange: the signed-in admin cannot demote themselves (by id or by email)", () => {
  const actor = { id: ADMIN_ID.toString(), email: "owner@jazaix.com" };
  const byId = decideRoleChange({ actor, target: { id: ADMIN_ID.toString(), email: "other@x.io", role: "admin" }, role: "player" });
  assert.equal(byId.ok, false);
  assert.equal(byId.error, "self-demotion");
  assert.equal(byId.status, 409);
  assert.match(byId.message, /own admin role/);
  const byEmail = decideRoleChange({ actor, target: { id: new ObjectId().toString(), email: "Owner@Jazaix.com", role: "admin" }, role: "developer" });
  assert.equal(byEmail.ok, false);
  assert.equal(byEmail.error, "self-demotion");
  // setting yourself to admin again is a no-op, not a demotion
  assert.deepEqual(decideRoleChange({ actor, target: { id: ADMIN_ID.toString(), email: actor.email, role: "admin" }, role: "admin" }), { ok: true, changed: false });
});

test("decideRoleChange: other people's roles change; bots never do", () => {
  const actor = { id: ADMIN_ID.toString(), email: "owner@jazaix.com" };
  assert.deepEqual(decideRoleChange({ actor, target: { id: new ObjectId().toString(), email: "p@x.io", role: "player" }, role: "developer" }), { ok: true, changed: true });
  assert.deepEqual(decideRoleChange({ actor, target: { id: new ObjectId().toString(), email: "a@x.io", role: "admin" }, role: "player" }), { ok: true, changed: true });
  const bot = decideRoleChange({ actor, target: { id: new ObjectId().toString(), email: "", role: "bot" }, role: "admin" });
  assert.equal(bot.ok, false);
  assert.equal(bot.error, "bot-account");
});

test("parseRoleChange accepts admin / developer / player, and 'user' as the UI's word for player", () => {
  assert.deepEqual(SETTABLE_ROLES, ["admin", "developer", "player"]);
  const id = "ABCDEFABCDEFABCDEFABCDEF";
  assert.deepEqual(parseRoleChange({ userId: id, role: "user" }), { ok: true, userId: id.toLowerCase(), role: "player" });
  assert.deepEqual(parseRoleChange({ userId: id, role: "admin" }), { ok: true, userId: id.toLowerCase(), role: "admin" });
  assert.equal(parseRoleChange({ userId: id, role: "bot" }).error, "invalid-role");
  assert.equal(parseRoleChange({ userId: "short", role: "admin" }).error, "invalid-user");
  assert.equal(parseRoleChange(null).error, "invalid-user");
});

test("userSearchFilter: nothing = everyone; text = escaped case-insensitive regex on email, username, name", () => {
  assert.deepEqual(userSearchFilter(""), {});
  assert.deepEqual(userSearchFilter(undefined), {});
  const f = userSearchFilter(" a.b+c@x.io ");
  assert.deepEqual(f, { $or: [{ email: { $regex: "a\\.b\\+c@x\\.io", $options: "i" } }, { username: { $regex: "a\\.b\\+c@x\\.io", $options: "i" } }, { name: { $regex: "a\\.b\\+c@x\\.io", $options: "i" } }] });
  assert.equal(regexEscape("(x|y)*"), "\\(x\\|y\\)\\*");
  assert.equal(userSearchFilter("x".repeat(200)).$or[0].email.$regex.length, 80);
});

test("userView maps the portal's row the portal's way", () => {
  const _id = new ObjectId();
  const at = new Date("2026-11-13T10:00:00Z");
  const v = userView({
    _id, email: "p@x.io", name: "Pat Example", username: "pat", image: "https://img", role: "player", access: "waitlist", createdAt: at, waitlistedAt: at,
    waitlistEmails: { joined: { at, status: "sent", id: "e1" } }, signupAs: "both",
  });
  assert.deepEqual(v, {
    id: _id.toString(), email: "p@x.io", name: "Pat Example", username: "pat", image: "https://img", imageSmall: "", role: "player", access: "waitlist",
    createdAt: at.toISOString(), lastLoginAt: null, lastPlayedAt: null, lastActive: null, waitlistedAt: at.toISOString(), approvedAt: null, approvedBy: null,
    emails: { joined: "sent", approved: null }, signupAs: "both",
  });
  const later = new Date("2026-11-14T10:00:00Z");
  const played = userView({ _id, lastLoginAt: at, lastPlayedAt: later });
  assert.deepEqual(played.lastActive, { at: later.toISOString(), kind: "played" });
  assert.equal(played.lastPlayedAt, later.toISOString());
  assert.deepEqual(userView({ _id, lastLoginAt: later, lastPlayedAt: at }).lastActive, { at: later.toISOString(), kind: "signed-in" });
  const old = userView({ _id, email: "o@x.io", approvedBy: { id: "x", email: "owner@jazaix.com" }, approvedAt: at });
  assert.equal(old.access, "approved");
  assert.equal(old.role, "player");
  assert.equal(old.approvedBy, "owner@jazaix.com");
  assert.equal(accessOf({}), "approved");
  assert.equal(accessOf({ access: "waitlist" }), "waitlist");
  assert.equal(roleOf({ role: "" }), "player");
  assert.equal(signupAsOf({ signupAs: "nope" }), null);
});

test("lastActiveOf: the later of the sign-in and the play, a tie is the play; null when there is neither", () => {
  assert.deepEqual(lastActiveOf("2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z"), { at: "2026-11-02T00:00:00.000Z", kind: "played" });
  assert.deepEqual(lastActiveOf("2026-11-03T00:00:00.000Z", "2026-11-02T00:00:00.000Z"), { at: "2026-11-03T00:00:00.000Z", kind: "signed-in" });
  assert.deepEqual(lastActiveOf("2026-11-02T00:00:00.000Z", "2026-11-02T00:00:00.000Z"), { at: "2026-11-02T00:00:00.000Z", kind: "played" });
  assert.deepEqual(lastActiveOf(null, "2026-11-02T00:00:00.000Z"), { at: "2026-11-02T00:00:00.000Z", kind: "played" });
  assert.deepEqual(lastActiveOf("2026-11-02T00:00:00.000Z", null), { at: "2026-11-02T00:00:00.000Z", kind: "signed-in" });
  assert.equal(lastActiveOf(null, null), null);
});

test("parseUserOrder: created newest first by default, names A to Z, anything unknown falls back; the sort spec breaks ties by _id", () => {
  assert.deepEqual(USER_SORTS, ["created", "active", "name"]);
  assert.deepEqual(DEFAULT_USER_ORDER, { sort: "created", dir: "desc" });
  assert.deepEqual(parseUserOrder(undefined, undefined), { sort: "created", dir: "desc" });
  assert.deepEqual(parseUserOrder("active", null), { sort: "active", dir: "desc" });
  assert.deepEqual(parseUserOrder("name", ""), { sort: "name", dir: "asc" });
  assert.deepEqual(parseUserOrder("name", "desc"), { sort: "name", dir: "desc" });
  assert.deepEqual(parseUserOrder("active", "asc"), { sort: "active", dir: "asc" });
  assert.deepEqual(parseUserOrder("email", "sideways"), { sort: "created", dir: "desc" });
  assert.deepEqual(parseUserOrder({ $gt: "" }, ["asc"]), { sort: "created", dir: "desc" });
  assert.equal(defaultDir("created"), "desc");
  assert.equal(defaultDir("active"), "desc");
  assert.equal(defaultDir("name"), "asc");
  assert.deepEqual(userSortSpec({ sort: "created", dir: "desc" }), { createdAt: -1, _id: -1 });
  assert.deepEqual(userSortSpec({ sort: "active", dir: "desc" }), { lastActiveAt: -1, _id: -1 });
  assert.deepEqual(userSortSpec({ sort: "name", dir: "asc" }), { name: 1, _id: 1 });
});

test("userListPipeline: the last-play lookups come after the page unless the page is ordered by last active", () => {
  const filter = { $or: [{ email: /x/ }] };
  const stage = (p) => p.map((s) => Object.keys(s)[0]);
  const created = userListPipeline(filter, { sort: "created", dir: "desc" }, 50, 50);
  assert.deepEqual(created[0], { $match: filter });
  assert.deepEqual(stage(created), ["$match", "$sort", "$skip", "$limit", ...stage(LAST_ACTIVE_STAGES), "$project"]);
  assert.deepEqual(created[1], { $sort: { createdAt: -1, _id: -1 } });
  assert.deepEqual(created[2], { $skip: 50 });
  assert.deepEqual(created[3], { $limit: 50 });
  const active = userListPipeline(filter, { sort: "active", dir: "desc" }, 0, 50);
  assert.deepEqual(stage(active), ["$match", ...stage(LAST_ACTIVE_STAGES), "$sort", "$skip", "$limit", "$project"]);
  const project = active[active.length - 1].$project;
  assert.equal(project.lastActiveAt, 1);
  assert.equal(project.lastPlayedAt, 1);
  assert.equal(project.email, 1);
  // both id forms of play_history.user_id are looked up, latest play only, then the later of login and play
  const lookups = LAST_ACTIVE_STAGES.filter((s) => s.$lookup).map((s) => s.$lookup);
  assert.deepEqual(lookups.map((l) => [l.from, l.localField, l.foreignField]), [["play_history", "_id", "user_id"], ["play_history", "idHex", "user_id"]]);
  for (const l of lookups) assert.deepEqual(l.pipeline.slice(0, 2), [{ $sort: { played_at: -1 } }, { $limit: 1 }]);
  assert.deepEqual(LAST_ACTIVE_STAGES[LAST_ACTIVE_STAGES.length - 1], { $addFields: { lastActiveAt: { $max: ["$lastLoginAt", "$lastPlayedAt"] } } });
});

test("the Users screen: a Last active column in words, sortable headers for name, created and last active; the API reads sort and dir", () => {
  const ui = read("src/app/(console)/users/UsersConsole.tsx");
  assert.match(ui, /<SortHeader col="name" label="Person"/);
  assert.match(ui, /<SortHeader col="created" label="Created"/);
  assert.match(ui, /<SortHeader col="active" label="Last active"/);
  assert.match(ui, /aria-sort=\{active \? \(order\.dir === "asc" \? "ascending" : "descending"\) : undefined\}/);
  assert.match(ui, /data-testid="last-active"/);
  assert.match(ui, /\{ago\(u\.lastActive\?\.at\)\}/);
  // the order travels in the URL and in every list request (the first page and "more")
  assert.match(ui, /sort: order\.sort, dir: order\.dir/);
  assert.match(ui, /fetch\(`\/api\/users\?\$\{listQuery\}`/);
  assert.match(ui, /fetch\(`\/api\/users\?\$\{listQuery\}&skip=\$\{data\.users\.length\}`/);
  assert.match(ui, /colSpan=\{6\}/);
  assert.doesNotMatch(ui, /colSpan=\{5\}/);
  assert.doesNotMatch(ui, /\u2014/, "no em dashes");
  const route = read("src/app/api/users/route.ts");
  assert.match(route, /parseUserOrder\(sp\.get\("sort"\), sp\.get\("dir"\)\)/);
  assert.match(route, /searchUsers\(await mongoDb\(\), q, skip, order, filter\)/);
});

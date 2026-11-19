/**
 * Integration tests against a real MongoDB. They run only when JX_TEST_MONGO_URI is set, for example
 *   JX_TEST_MONGO_URI='mongodb://localhost:27018/?replicaSet=jx-db-local-rs&directConnection=true' npm test
 * They create their OWN database, jxadmin_test_<random>, and drop it at the end. They never touch jx_portal.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { mongoClientFor } from "../src/lib/mongo.ts";
import { parseAllowlist, decideAdmin } from "../src/lib/admin-gate.ts";
import { AUDIT_COLLECTION } from "../src/lib/repo/audit.ts";
import { findUserRoleByEmail, searchUsers, setUserRole } from "../src/lib/repo/users.ts";
import { applyWaitlistAction, listWaitlist, waitlistCounts } from "../src/lib/repo/waitlist.ts";
import { getJbuxReport } from "../src/lib/repo/jbux-report.ts";
import { getGameDetail, listGames } from "../src/lib/repo/games.ts";
import { applyGameMemberChange } from "../src/lib/repo/game-members.ts";
import { listCatalog } from "../src/lib/repo/catalog.ts";
import { getRoomDetail, listRooms } from "../src/lib/repo/rooms.ts";
import { listAuditActions } from "../src/lib/repo/audit.ts";

const URI = process.env.JX_TEST_MONGO_URI || "";
const skip = URI ? false : "JX_TEST_MONGO_URI is not set";
const DB_NAME = `jxadmin_test_${Math.random().toString(36).slice(2, 10)}`;
assert.notEqual(DB_NAME, "jx_portal");

const NOW = new Date("2026-11-17T12:00:00Z");
const ADMIN_ID = new ObjectId();
const DEV_ID = new ObjectId();
const WAIT_A = new ObjectId();
const WAIT_B = new ObjectId();
const OLD_ID = new ObjectId();
const BOT_ID = new ObjectId();

let client;
let db;

before(async () => {
  if (skip) return;
  client = await mongoClientFor(URI);
  db = client.db(DB_NAME);
  await db.collection("users").insertMany([
    { _id: ADMIN_ID, email: "owner@jazaix.com", name: "Owner", username: "owner", role: "admin", createdAt: new Date("2026-10-01T00:00:00Z") },
    { _id: DEV_ID, email: "dev@jazaix.com", name: "Dev", username: "dev", role: "developer", createdAt: new Date("2026-10-02T00:00:00Z") },
    { _id: WAIT_A, email: "a@example.com", name: "Alice Waiting", username: "alice", role: "player", access: "waitlist", createdAt: new Date("2026-11-10T00:00:00Z"), waitlistedAt: new Date("2026-11-10T00:00:00Z"), signupAs: "developer" },
    { _id: WAIT_B, email: "b@example.com", name: "Bob Waiting", username: "bob", role: "player", access: "waitlist", createdAt: new Date("2026-11-12T00:00:00Z"), waitlistedAt: new Date("2026-11-12T00:00:00Z") },
    { _id: OLD_ID, email: "old@example.com", name: "Old Account", username: "old", role: "player", createdAt: new Date("2026-09-01T00:00:00Z") },
    { _id: BOT_ID, email: "bot-1@crew.jazaix.com", name: "Crew 1", role: "bot", access: "waitlist", createdAt: new Date("2026-11-01T00:00:00Z") },
  ]);
  await db.collection("wallets").insertMany([
    { userId: OLD_ID.toString(), balance: 150, funds: { real: 100, test: 0, promo: 50 }, hold: "admin" },
    { userId: WAIT_A.toString(), balance: 30, funds: { real: 0, test: 30, promo: 0 } },
    { userId: DEV_ID.toString(), balance: 20 }, // legacy wallet without funds: its balance counts as test money
  ]);
  await db.collection("credit_transactions").insertMany([
    { kind: "purchase", source: "stripe", funding: "real", amount: 100, userId: OLD_ID.toString(), at: new Date("2026-11-01T10:00:00Z") },
    { kind: "grant", source: "test-buy", funding: "test", amount: 30, userId: WAIT_A.toString(), at: new Date("2026-11-02T10:00:00Z"), env: "local", packId: "pack-s" },
    { kind: "grant", source: "test-buy", funding: "test", amount: 20, userId: DEV_ID.toString(), at: new Date("2026-11-03T10:00:00Z"), env: "local", packId: "pack-s" },
    { kind: "grant", source: "promo", funding: "promo", amount: 50, userId: OLD_ID.toString(), at: new Date("2026-11-04T10:00:00Z") },
    { kind: "spend", source: "last-minute", split: { real: 10, test: 0, promo: 5 }, amount: -15, userId: OLD_ID.toString(), at: new Date("2026-11-05T10:00:00Z") },
  ]);
}, { skip });

after(async () => {
  if (skip) return;
  if (db) await db.dropDatabase();
  if (client) await client.close();
}, { skip });

test("gate: admin = allowlisted AND role admin in Mongo (looked up lower-cased); developer or missing row is refused", { skip }, async () => {
  const users = db.collection("users");
  const lookup = (e) => findUserRoleByEmail(users, e);
  const allow = parseAllowlist("owner@jazaix.com, dev@jazaix.com, ghost@jazaix.com");
  const ok = await decideAdmin("Owner@Jazaix.com", allow, lookup);
  assert.deepEqual(ok, { admin: true, email: "owner@jazaix.com", role: "admin", id: ADMIN_ID.toString() });
  assert.equal((await decideAdmin("dev@jazaix.com", allow, lookup)).reason, "not-admin-role");
  assert.equal((await decideAdmin("ghost@jazaix.com", allow, lookup)).reason, "not-admin-role");
  assert.equal((await decideAdmin("a@example.com", allow, lookup)).reason, "not-allowlisted");
});

test("waitlist: counts and lists match the portal's filters and order; bots never appear", { skip }, async () => {
  assert.deepEqual(await waitlistCounts(db), { waiting: 2, approved: 3 });
  const waiting = await listWaitlist(db, "waitlist", "");
  assert.deepEqual(waiting.users.map((u) => u.email), ["b@example.com", "a@example.com"]);
  assert.equal(waiting.users[1].signupAs, "developer");
  assert.equal(waiting.users[1].access, "waitlist");
  const approved = await listWaitlist(db, "approved", "");
  assert.deepEqual(approved.users.map((u) => u.email).sort(), ["dev@jazaix.com", "old@example.com", "owner@jazaix.com"]);
  assert.deepEqual((await listWaitlist(db, "waitlist", "ALICE")).users.map((u) => u.email), ["a@example.com"]);
});

test("waitlist: approve writes access/approvedAt/approvedBy, sends and records the email, audits; a second approve is 409", { skip }, async () => {
  const sent = [];
  const sendEmail = async (msg) => { sent.push(msg); return { status: "sent", id: "em_test" }; };
  const r = await applyWaitlistAction(db, { userId: WAIT_A.toString(), action: "approve", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.email, "sent");
  assert.equal(r.user.access, "approved");
  assert.equal(r.user.approvedBy, "owner@jazaix.com");
  assert.equal(r.user.emails.approved, "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "a@example.com");
  assert.equal(sent[0].idempotencyKey, `waitlist-approved-${WAIT_A.toString()}-${NOW.getTime()}`);
  const row = await db.collection("users").findOne({ _id: WAIT_A });
  assert.equal(row.access, "approved");
  assert.equal(row.approvedAt.getTime(), NOW.getTime());
  assert.deepEqual(row.approvedBy, { id: ADMIN_ID.toString(), email: "owner@jazaix.com" });
  assert.equal(row.waitlistEmails.approved.status, "sent");
  assert.equal(row.waitlistEmails.approved.id, "em_test");
  assert.deepEqual(await waitlistCounts(db), { waiting: 1, approved: 4 });
  const again = await applyWaitlistAction(db, { userId: WAIT_A.toString(), action: "approve", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail, now: NOW });
  assert.deepEqual(again, { ok: false, status: 409, error: "already-approved", message: "Already approved." });
  assert.equal(sent.length, 1);
  const audit = await db.collection(AUDIT_COLLECTION).find({ action: "waitlist-approve" }).toArray();
  assert.equal(audit.length, 1);
  assert.deepEqual({ ...audit[0], _id: undefined }, { _id: undefined, at: NOW, actor: "owner@jazaix.com", action: "waitlist-approve", target: WAIT_A.toString(), via: "admin-console", details: { email: "sent" } });
});

test("waitlist: approve without email config still approves and says not-configured", { skip }, async () => {
  const r = await applyWaitlistAction(db, { userId: WAIT_B.toString(), action: "approve", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail: null, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.email, "not-configured");
  assert.equal((await db.collection("users").findOne({ _id: WAIT_B })).waitlistEmails.approved.status, "not-configured");
  assert.deepEqual(await waitlistCounts(db), { waiting: 0, approved: 5 });
});

test("waitlist: move back unsets approvedAt/approvedBy and restarts the wait; admins and developers are never moved back; unknown id is 404", { skip }, async () => {
  const later = new Date("2026-11-18T12:00:00Z");
  const r = await applyWaitlistAction(db, { userId: WAIT_B.toString(), action: "waitlist", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail: null, now: later });
  assert.equal(r.ok, true);
  assert.equal(r.email, null);
  const row = await db.collection("users").findOne({ _id: WAIT_B });
  assert.equal(row.access, "waitlist");
  assert.equal(row.waitlistedAt.getTime(), later.getTime());
  assert.equal("approvedAt" in row, false);
  assert.equal("approvedBy" in row, false);
  assert.deepEqual(await waitlistCounts(db), { waiting: 1, approved: 4 });
  const dev = await applyWaitlistAction(db, { userId: DEV_ID.toString(), action: "waitlist", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail: null });
  assert.equal(dev.ok, false);
  assert.equal(dev.error, "always-has-access");
  const none = await applyWaitlistAction(db, { userId: new ObjectId().toString(), action: "approve", admin: { id: ADMIN_ID.toString(), email: "owner@jazaix.com" }, sendEmail: null });
  assert.equal(none.status, 404);
  const audit = await db.collection(AUDIT_COLLECTION).findOne({ action: "waitlist-move-back" });
  assert.equal(audit.target, WAIT_B.toString());
  assert.equal("details" in audit, false);
});

test("users: search by email or username; set role writes users.role and audits; self-demotion is refused and leaves no trace", { skip }, async () => {
  const byEmail = await searchUsers(db, "old@example");
  assert.deepEqual(byEmail.users.map((u) => u.username), ["old"]);
  assert.equal(byEmail.total, 1);
  const byUsername = await searchUsers(db, "ali");
  assert.deepEqual(byUsername.users.map((u) => u.email), ["a@example.com"]);
  const all = await searchUsers(db, "");
  assert.equal(all.total, 6);
  assert.equal(all.users[0].email, "b@example.com"); // newest first

  const actor = { id: ADMIN_ID.toString(), email: "owner@jazaix.com" };
  const up = await setUserRole(db, { userId: OLD_ID.toString(), role: "developer", actor, now: NOW });
  assert.equal(up.ok, true);
  assert.equal(up.changed, true);
  assert.equal(up.user.role, "developer");
  assert.equal((await db.collection("users").findOne({ _id: OLD_ID })).role, "developer");
  const audit = await db.collection(AUDIT_COLLECTION).findOne({ action: "set-role", target: OLD_ID.toString() });
  assert.deepEqual({ ...audit, _id: undefined }, { _id: undefined, at: NOW, actor: "owner@jazaix.com", action: "set-role", target: OLD_ID.toString(), via: "admin-console", details: { from: "player", to: "developer" } });

  const before = await db.collection(AUDIT_COLLECTION).countDocuments();
  const self = await setUserRole(db, { userId: ADMIN_ID.toString(), role: "player", actor, now: NOW });
  assert.equal(self.ok, false);
  assert.equal(self.error, "self-demotion");
  assert.equal((await db.collection("users").findOne({ _id: ADMIN_ID })).role, "admin");
  assert.equal(await db.collection(AUDIT_COLLECTION).countDocuments(), before);

  const bot = await setUserRole(db, { userId: BOT_ID.toString(), role: "admin", actor });
  assert.equal(bot.error, "bot-account");
  assert.equal((await setUserRole(db, { userId: new ObjectId().toString(), role: "admin", actor })).status, 404);
});

test("JBux report: real, test and promo money stay apart; splits, debits, legacy wallets and test buys as the portal counts them", { skip }, async () => {
  const r = await getJbuxReport(db);
  assert.deepEqual(r.byFunding, { real: { credited: 100, debited: 10 }, test: { credited: 50, debited: 0 }, promo: { credited: 50, debited: 5 } });
  assert.deepEqual(r.wallets, { real: 100, test: 50, promo: 50, balance: 200, onHold: 1, count: 3 });
  const spend = r.lines.find((l) => l.kind === "spend");
  assert.deepEqual(spend, { kind: "spend", source: "last-minute", rows: 1, real: 10, test: 0, promo: 5 });
  const testBuy = r.lines.find((l) => l.kind === "grant" && l.source === "test-buy");
  assert.deepEqual(testBuy, { kind: "grant", source: "test-buy", rows: 2, real: 0, test: 50, promo: 0 });
  assert.deepEqual(r.testBuys.map((b) => [b.email, b.amount, b.packId, b.env]), [["dev@jazaix.com", 20, "pack-s", "local"], ["a@example.com", 30, "pack-s", "local"]]);
  assert.equal(r.testBuys[0].at, "2026-11-03T10:00:00.000Z");

  const realOnly = await getJbuxReport(db, { funding: "real" });
  assert.deepEqual(realOnly.lines.map((l) => l.kind).sort(), ["purchase", "spend"]);
  assert.equal(realOnly.filter.funding, "real");
  const window = await getJbuxReport(db, { from: "2026-11-02", to: "2026-11-03" });
  assert.equal(window.lines.length, 1);
  assert.equal(window.testBuys.length, 1);
  assert.equal(window.testBuys[0].email, "a@example.com");
  assert.deepEqual(window.byFunding.test, { credited: 30, debited: 0 });
  // the wallet pots are the live totals, whatever the ledger filter
  assert.deepEqual(window.wallets, r.wallets);
});

test("games: list, search, sort and one game with keys (no key values), join requests and rooms", { skip }, async () => {
  const gid = new ObjectId();
  await db.collection("games").insertMany([
    { _id: gid, slug: "it-game", name: "Integration Game", creator_name: "owner", creator_id: ADMIN_ID, plays: 9, rounds_completed: 1, updatedAt: NOW, studio_enabled: true },
    { slug: "it-other", name: "Other", creator_name: "gamer", plays: 1, rounds_completed: 7, updatedAt: new Date(NOW.getTime() - 1000) },
  ]);
  await db.collection("game_keys").insertMany([
    { key: "gk_dev_INTEGRATION_SECRET", prefix: "gk_dev_zz", game_id: gid, game_slug: "it-game", label: "local", environment: "dev", status: "active", createdAt: NOW },
  ]);
  await db.collection("game_join_requests").insertOne({ gameId: gid.toString(), userId: WAIT_A.toString(), status: "pending", createdAt: NOW });
  await db.collection("rooms").insertMany([
    { _id: "it-room-1", room_id: "it-room-1", game_id: "it-game", game_slug: "it-game", state: "open", players: 2, updatedAt: NOW },
    { _id: "it-room-2", room_id: "it-room-2", game_id: "it-game", game_slug: null, state: "closed", updatedAt: new Date(NOW.getTime() - 5000) },
  ]);
  assert.deepEqual((await listGames(db, { sort: "plays" })).rows.map((g) => g.slug), ["it-game", "it-other"]);
  assert.deepEqual((await listGames(db, { sort: "rounds" })).rows.map((g) => g.slug), ["it-other", "it-game"]);
  assert.deepEqual((await listGames(db, { q: "GAMER" })).rows.map((g) => g.slug), ["it-other"]);
  const d = await getGameDetail(db, "it-game");
  assert.equal(d.keys.count, 1);
  assert.doesNotMatch(JSON.stringify(d), /INTEGRATION_SECRET|gk_dev_zz/);
  assert.equal(d.joinRequests.items[0].email, "a@example.com");
  const rooms = await listRooms(db, { game: "it-game" });
  assert.deepEqual(rooms.rows.map((r) => r.roomId), ["it-room-1", "it-room-2"]);
  assert.equal((await listRooms(db, { game: "it-game", state: "closed" })).total, 1);
  const room = await getRoomDetail(db, "it-room-1");
  assert.equal(room.row.state, "open");
  assert.equal(await getGameDetail(db, "missing"), null);
});

test("catalog and audit lists read their collections", { skip }, async () => {
  await db.collection("catalog").insertOne({ sku: "it-sku", name: "Item", kind: "avatar-item", gameId: "it-game", priceCredits: 5, enabled: true, createdAt: NOW });
  const c = await listCatalog(db);
  assert.equal(c.total, 1);
  assert.equal(c.columns[0], "sku");
  await db.collection(AUDIT_COLLECTION).insertOne({ at: new Date(NOW.getTime() + 60_000), actor: "zz-integration@jazaix.com", action: "set-role", target: "t", via: "admin-console" });
  const a = await listAuditActions(db, { actor: "ZZ-INTEGRATION" });
  assert.equal(a.total, 1);
  assert.equal(a.rows[0].actor, "zz-integration@jazaix.com");
});

test("game members (owner 2026-11-18): add by username as admin, change to contributor, refuse the owner, remove; one audit row each", { skip }, async () => {
  const gid = new ObjectId();
  await db.collection("games").insertOne({ _id: gid, slug: "it-members", name: "Members Game", creator_id: ADMIN_ID, creator_name: "owner", contributors: [
    { user_id: DEV_ID, credit: "Maps", listed: true, added_at: NOW },
  ] });
  await db.collection("users").updateOne({ _id: OLD_ID }, { $set: { username: "Simpl3Un1c0rn", usernameLower: "simpl3un1c0rn" } });
  const actor = { id: ADMIN_ID.toString(), email: "it-admin@jazaix.com" };
  const added = await applyGameMemberChange(db, { slug: "it-members", who: { username: "simpl3UN1C0RN" }, action: "set-role", role: "admin" }, actor, NOW);
  assert.equal(added.ok, true);
  assert.equal(added.changed, true);
  assert.deepEqual([added.from, added.to], [null, "admin"]);
  assert.deepEqual(added.members.items.map((i) => [i.userId, i.role]), [[DEV_ID.toString(), "contributor"], [OLD_ID.toString(), "admin"]]);
  const stored = await db.collection("games").findOne({ _id: gid });
  assert.deepEqual(stored.contributors[1], { user_id: OLD_ID, role: "admin", credit: "Contributor", listed: true, added_at: NOW }, "the entry the portal's members route would write");
  const again = await applyGameMemberChange(db, { slug: "it-members", who: { userId: OLD_ID.toString() }, action: "set-role", role: "admin" }, actor, NOW);
  assert.equal(again.changed, false, "same role: nothing written");
  const demoted = await applyGameMemberChange(db, { slug: "it-members", who: { userId: DEV_ID.toString() }, action: "set-role", role: "admin" }, actor, NOW);
  assert.equal(demoted.changed, true);
  assert.deepEqual([demoted.from, demoted.to], ["contributor", "admin"]);
  assert.equal((await db.collection("games").findOne({ _id: gid })).contributors[0].credit, "Maps", "a role change keeps the credit");
  const owner = await applyGameMemberChange(db, { slug: "it-members", who: { userId: ADMIN_ID.toString() }, action: "set-role", role: "admin" }, actor, NOW);
  assert.equal(owner.ok, false);
  assert.equal(owner.status, 409);
  assert.equal((await applyGameMemberChange(db, { slug: "no-such-game", who: { userId: DEV_ID.toString() }, action: "set-role", role: "admin" }, actor)).status, 404);
  assert.equal((await applyGameMemberChange(db, { slug: "it-members", who: { username: "nobody-here" }, action: "set-role", role: "admin" }, actor)).status, 404);
  const removed = await applyGameMemberChange(db, { slug: "it-members", who: { userId: OLD_ID.toString() }, action: "remove" }, actor, NOW);
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.members.items.map((i) => i.userId), [DEV_ID.toString()]);
  const audit = await db.collection(AUDIT_COLLECTION).find({ action: "game-member", actor: "it-admin@jazaix.com" }).sort({ _id: 1 }).toArray();
  assert.equal(audit.length, 4, "add, same-role, change, remove each leave a row; refusals do not");
  assert.deepEqual(audit.map((a) => [a.target, a.details.from, a.details.to]), [
    [OLD_ID.toString(), null, "admin"], [OLD_ID.toString(), "admin", "admin"], [DEV_ID.toString(), "contributor", "admin"], [OLD_ID.toString(), "admin", null],
  ]);
  assert.ok(audit.every((a) => a.details.game === "it-members" && a.via === "admin-console"));
});

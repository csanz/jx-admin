/**
 * A game's people from the console (owner 2026-11-18: "make Simpl3Un1c0rn an admin for one-shot game in prod ... in
 * admin"): the stored entries read the way the portal reads them, the request body parsed, the page and the route
 * wired. The write itself (applyGameMemberChange) runs against a real database in test/mongo-integration.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import { gameMemberEntries, gameMemberRoleOf, gameMembersOf, parseGameMemberChange, GAME_MEMBER_ROLES } from "../src/lib/repo/game-members.ts";
import { getGameDetail } from "../src/lib/repo/games.ts";
import { AUDIT_ACTIONS } from "../src/lib/repo/audit.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const OWNER = new ObjectId("6af8e8b798510477d976ce6f");
const UNI = new ObjectId("6ae92ff73a4a4070bdd2f551");
const COOP = new ObjectId("6ae204d8c05a94f95f234732");
const GAME = new ObjectId();

const gameDoc = () => ({
  _id: GAME, slug: "one-shot-arena", name: "One Shot Arena", creator_id: OWNER, creator_name: "gamer",
  contributors: [
    { user_id: UNI, credit: "Contributor", listed: true, added_at: new Date("2026-11-17T15:21:47.962Z") },
    { user_id: COOP, role: "admin", credit: "Maps", listed: false },
    { user_id: OWNER, role: "admin" },                      // the owner is never an entry
    { user_id: UNI, role: "admin" },                        // a duplicate: the first one counts
    { user_id: "nope" }, null, "x",                         // junk
  ],
});

test("a stored entry's role: 'admin' when it says so, otherwise contributor (older entries have no role)", () => {
  assert.equal(gameMemberRoleOf("admin"), "admin");
  assert.equal(gameMemberRoleOf("contributor"), "contributor");
  assert.equal(gameMemberRoleOf(undefined), "contributor");
  assert.equal(gameMemberRoleOf("owner"), "contributor");
  assert.deepEqual([...GAME_MEMBER_ROLES], ["admin", "contributor"]);
});

test("the entries are read like the portal reads them: junk dropped, one per user, never the owner, the role kept", () => {
  assert.deepEqual(gameMemberEntries(gameDoc()), [
    { userId: UNI.toHexString(), role: "contributor", credit: "Contributor", listed: true, addedAt: "2026-11-17T15:21:47.962Z" },
    { userId: COOP.toHexString(), role: "admin", credit: "Maps", listed: false, addedAt: null },
  ]);
  assert.deepEqual(gameMemberEntries({}), []);
  assert.deepEqual(gameMemberEntries(null), []);
});

test("gameMembersOf: the owner and the people with their accounts; a deleted account keeps its id", async () => {
  const db = fakeDb({
    users: [
      { _id: OWNER, username: "gamer", email: "gamer@example.com", name: "Gamer" },
      { _id: UNI, username: "Simpl3Un1c0rn", email: "uni@example.com", image: "https://x/u.png" },
    ],
  });
  const m = await gameMembersOf(db, gameDoc());
  assert.deepEqual(m.owner, { id: OWNER.toHexString(), username: "gamer", email: "gamer@example.com", name: "Gamer", image: null });
  assert.equal(m.items.length, 2);
  assert.deepEqual(m.items[0], { userId: UNI.toHexString(), role: "contributor", credit: "Contributor", listed: true, addedAt: "2026-11-17T15:21:47.962Z", username: "Simpl3Un1c0rn", email: "uni@example.com", name: "", image: "https://x/u.png" });
  assert.equal(m.items[1].username, "", "no account: empty strings, the id stays");
  assert.equal(m.items[1].role, "admin");
  const q = db.queries.find((x) => x.collection === "users");
  assert.deepEqual(q.options.projection, { username: 1, email: 1, name: 1, image: 1 }, "only the fields the page shows");
});

test("getGameDetail carries the members", async () => {
  const db = fakeDb({ games: [gameDoc()], game_keys: [], game_join_requests: [], users: [{ _id: UNI, username: "Simpl3Un1c0rn", email: "u@x" }] });
  const d = await getGameDetail(db, "one-shot-arena");
  assert.equal(d.members.owner.id, OWNER.toHexString());
  assert.deepEqual(d.members.items.map((i) => [i.username, i.role]), [["Simpl3Un1c0rn", "contributor"], ["", "admin"]]);
});

test("parseGameMemberChange: by username or id with a role, or a remove by id; everything else is refused", () => {
  const slug = "one-shot-arena";
  assert.deepEqual(parseGameMemberChange(slug, { username: " @Simpl3Un1c0rn ", role: "admin" }), { ok: true, change: { slug, who: { username: "Simpl3Un1c0rn" }, action: "set-role", role: "admin" } });
  assert.deepEqual(parseGameMemberChange(slug, { userId: UNI.toHexString(), role: "contributor" }), { ok: true, change: { slug, who: { userId: UNI.toHexString() }, action: "set-role", role: "contributor" } });
  assert.deepEqual(parseGameMemberChange(slug, { userId: UNI.toHexString(), role: "admin", action: "set-role" }).ok, true);
  assert.deepEqual(parseGameMemberChange(slug, { userId: UNI.toHexString(), action: "remove" }), { ok: true, change: { slug, who: { userId: UNI.toHexString() }, action: "remove" } });
  for (const [s, body, why] of [
    ["One Shot", { username: "x", role: "admin" }, "slug"],
    [slug, { username: "x", role: "owner" }, "role"],
    [slug, { username: "x" }, "role"],
    [slug, { role: "admin" }, "username is required"],
    [slug, { username: "x".repeat(41), role: "admin" }, "username is required"],
    [slug, { userId: "short", role: "admin" }, "userId"],
    [slug, { action: "remove" }, "userId"],
    [slug, { username: "x", action: "nuke", role: "admin" }, "action"],
  ]) {
    const r = parseGameMemberChange(s, body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.match(r.message, new RegExp(why), JSON.stringify(body));
  }
});

test("the route, the page and the audit are wired: POST /api/games/[slug]/members behind the gate, a People section with the control, action game-member", () => {
  const route = read("src/app/api/games/[slug]/members/route.ts");
  assert.match(route, /requireAdminApi\(req, \{ write: true \}\)/);
  assert.match(route, /parseGameMemberChange\(\(await params\)\.slug, parsed\.body\)/);
  assert.match(route, /applyGameMemberChange\(await mongoDb\(\), a\.change, \{ id: g\.actor\.id, email: g\.actor\.email \}\)/);
  const page = read("src/app/(console)/games/[slug]/page.tsx");
  assert.match(page, /<Section title="People"/);
  assert.match(page, /<GameMembersControl slug=\{g\.slug\} gameName=\{g\.name \|\| g\.slug\} members=\{members\} portalUrl=\{portalUrlIfSet\(\)\} \/>/);
  assert.match(page, /Read only, except People/);
  const control = read("src/components/GameMembersControl.tsx");
  assert.match(control, /fetch\(`\/api\/games\/\$\{encodeURIComponent\(slug\)\}\/members`, \{ method: "POST"/);
  assert.match(control, /window\.confirm\(/, "every change is confirmed");
  assert.match(control, /router\.refresh\(\)/);
  assert.doesNotMatch(control, /\u2014/, "no em dashes");
  assert.ok(AUDIT_ACTIONS.includes("game-member"));
  const repo = read("src/lib/repo/game-members.ts");
  assert.match(repo, /action: "game-member", target: userId, details: \{ game: change\.slug, from, to \}/);
  assert.match(repo, /\$set: \{ "contributors\.\$\.role": change\.role \}/);
  assert.match(repo, /\$pull: \{ contributors: \{ user_id: new ObjectId\(userId\) \} \}/);
  assert.match(repo, /role: change\.role, credit: "Contributor", listed: true, added_at: now/);
  assert.match(read("README.md"), /games\.contributors\[\]/);
});

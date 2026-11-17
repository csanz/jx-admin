import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  SETTABLE_ROLES, accessOf, decideRoleChange, findUserRoleByEmail, parseRoleChange, regexEscape, roleOf, signupAsOf, userSearchFilter, userView,
} from "../src/lib/repo/users.ts";

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
    createdAt: at.toISOString(), lastLoginAt: null, waitlistedAt: at.toISOString(), approvedAt: null, approvedBy: null,
    emails: { joined: "sent", approved: null }, signupAs: "both",
  });
  const old = userView({ _id, email: "o@x.io", approvedBy: { id: "x", email: "owner@jazaix.com" }, approvedAt: at });
  assert.equal(old.access, "approved");
  assert.equal(old.role, "player");
  assert.equal(old.approvedBy, "owner@jazaix.com");
  assert.equal(accessOf({}), "approved");
  assert.equal(accessOf({ access: "waitlist" }), "waitlist");
  assert.equal(roleOf({ role: "" }), "player");
  assert.equal(signupAsOf({ signupAs: "nope" }), null);
});

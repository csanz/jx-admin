import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WAITLIST_PAGE_SIZE, parseWaitlistAction, waitlistBypass, waitlistFilter, waitlistSort, waitlistUpdate,
} from "../src/lib/repo/waitlist.ts";

const NOW = new Date("2026-11-17T12:00:00Z");
const ADMIN = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", email: "owner@jazaix.com" };

test("waitlistFilter is the portal's: bots never listed, waiting = access waitlist, approved = access not waitlist", () => {
  assert.deepEqual(waitlistFilter("waitlist", ""), { role: { $ne: "bot" }, access: "waitlist" });
  assert.deepEqual(waitlistFilter(undefined, null), { role: { $ne: "bot" }, access: "waitlist" });
  assert.deepEqual(waitlistFilter("approved", ""), { role: { $ne: "bot" }, access: { $ne: "waitlist" } });
  const f = waitlistFilter("approved", " a.b@x.io ");
  const re = { $regex: "a\\.b@x\\.io", $options: "i" };
  assert.deepEqual(f.$or, [{ email: re }, { name: re }, { username: re }]);
  assert.equal(waitlistFilter("waitlist", "x".repeat(100)).$or[0].email.$regex.length, 80);
});

test("waitlistSort: waiting newest first; approved most recently approved first", () => {
  assert.deepEqual(waitlistSort("waitlist"), { waitlistedAt: -1, createdAt: -1 });
  assert.deepEqual(waitlistSort("approved"), { approvedAt: -1, createdAt: -1 });
  assert.equal(WAITLIST_PAGE_SIZE, 100);
});

test("waitlistUpdate writes the portal's fields: approve stamps access/approvedAt/approvedBy, move back restarts the wait", () => {
  assert.deepEqual(waitlistUpdate("approve", ADMIN, NOW), { $set: { access: "approved", approvedAt: NOW, approvedBy: { id: ADMIN.id, email: ADMIN.email } } });
  assert.deepEqual(waitlistUpdate("waitlist", ADMIN, NOW), { $set: { access: "waitlist", waitlistedAt: NOW }, $unset: { approvedAt: "", approvedBy: "" } });
});

test("parseWaitlistAction and waitlistBypass match the portal", () => {
  const id = "ABCDEFABCDEFABCDEFABCDEF";
  assert.deepEqual(parseWaitlistAction({ userId: id, action: "approve" }), { ok: true, userId: id.toLowerCase(), action: "approve" });
  assert.equal(parseWaitlistAction({ userId: id, action: "ban" }).error, "invalid-action");
  assert.equal(parseWaitlistAction({ userId: "nope", action: "approve" }).error, "invalid-user");
  assert.equal(waitlistBypass("admin"), true);
  assert.equal(waitlistBypass("developer"), true);
  assert.equal(waitlistBypass("bot"), true);
  assert.equal(waitlistBypass("player"), false);
  assert.equal(waitlistBypass(undefined), false);
});

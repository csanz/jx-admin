import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdmin, isAllowlisted, normalizeEmail, parseAllowlist, rowConfirmsAdmin, gateReasonText } from "../src/lib/admin-gate.ts";

const ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const adminRow = (email) => async () => ({ id: ID, email, role: "admin" });

test("parseAllowlist: trims, lowercases, drops blanks and non-emails", () => {
  const l = parseAllowlist(" Owner@Jazaix.com, dev@x.io ,, not-an-email , ");
  assert.deepEqual([...l].sort(), ["dev@x.io", "owner@jazaix.com"]);
  assert.equal(parseAllowlist("").size, 0);
  assert.equal(parseAllowlist(undefined).size, 0);
});

test("isAllowlisted is case-insensitive on both sides", () => {
  const l = parseAllowlist("OWNER@jazaix.com");
  assert.equal(isAllowlisted("owner@JAZAIX.com", l), true);
  assert.equal(isAllowlisted("  Owner@jazaix.com ", l), true);
  assert.equal(isAllowlisted("other@jazaix.com", l), false);
  assert.equal(isAllowlisted(null, l), false);
  assert.equal(normalizeEmail("nope"), null);
});

test("rowConfirmsAdmin needs a row with role exactly admin, an id, and the same email", () => {
  assert.equal(rowConfirmsAdmin("a@x.io", { id: ID, email: "A@X.io", role: "admin" }), true);
  assert.equal(rowConfirmsAdmin("a@x.io", { id: ID, email: "a@x.io", role: "developer" }), false);
  assert.equal(rowConfirmsAdmin("a@x.io", { id: ID, email: "a@x.io", role: "player" }), false);
  assert.equal(rowConfirmsAdmin("a@x.io", { id: ID, email: "b@x.io", role: "admin" }), false);
  assert.equal(rowConfirmsAdmin("a@x.io", { id: "", email: "a@x.io", role: "admin" }), false);
  assert.equal(rowConfirmsAdmin("a@x.io", null), false);
});

test("decideAdmin: admin only when allowlisted AND the users row in Mongo says admin; the id travels with the actor", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  const d = await decideAdmin("Owner@Jazaix.com", l, adminRow("owner@jazaix.com"));
  assert.deepEqual(d, { admin: true, email: "owner@jazaix.com", role: "admin", id: ID });
});

test("decideAdmin: allowlisted but the row's role is not admin, or there is no row -> not-admin-role", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  assert.equal((await decideAdmin("owner@jazaix.com", l, async () => ({ id: ID, email: "owner@jazaix.com", role: "developer" }))).reason, "not-admin-role");
  assert.equal((await decideAdmin("owner@jazaix.com", l, async () => null)).reason, "not-admin-role");
});

test("decideAdmin: admin in Mongo but not allowlisted -> not-allowlisted, and the database is never asked", async () => {
  let asked = 0;
  const d = await decideAdmin("stranger@x.io", parseAllowlist("owner@jazaix.com"), async (e) => { asked++; return adminRow(e)(); });
  assert.equal(d.admin, false);
  assert.equal(d.reason, "not-allowlisted");
  assert.equal(asked, 0);
});

test("decideAdmin: no email -> signed-out; a throwing lookup (database down) -> db-unavailable, never admin", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  assert.equal((await decideAdmin(null, l, adminRow("x"))).reason, "signed-out");
  assert.equal((await decideAdmin("", l, adminRow("x"))).reason, "signed-out");
  const d = await decideAdmin("owner@jazaix.com", l, async () => { throw new Error("MongoServerSelectionError"); });
  assert.equal(d.admin, false);
  assert.equal(d.reason, "db-unavailable");
});

test("gateReasonText has a short line for every reason and never a value", () => {
  for (const r of ["signed-out", "not-allowlisted", "not-admin-role", "db-unavailable"]) {
    const t = gateReasonText(r);
    assert.ok(t.length > 10 && t.length < 160, r);
  }
});

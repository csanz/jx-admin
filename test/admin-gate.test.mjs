import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAdmin, isAllowlisted, normalizeEmail, parseAllowlist, portalConfirmsAdmin, gateReasonText } from "../src/lib/admin-gate.ts";

const ok = (email) => async () => ({ status: 200, body: { email, role: "admin" } });

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

test("portalConfirmsAdmin needs 200, role admin and the same email", () => {
  assert.equal(portalConfirmsAdmin("a@x.io", 200, { email: "A@X.io", role: "admin" }), true);
  assert.equal(portalConfirmsAdmin("a@x.io", 200, { email: "a@x.io", role: "developer" }), false);
  assert.equal(portalConfirmsAdmin("a@x.io", 200, { email: "b@x.io", role: "admin" }), false);
  assert.equal(portalConfirmsAdmin("a@x.io", 403, { email: "a@x.io", role: "admin" }), false);
  assert.equal(portalConfirmsAdmin("a@x.io", 200, null), false);
  assert.equal(portalConfirmsAdmin("a@x.io", 200, "admin"), false);
});

test("decideAdmin: admin only when allowlisted AND the portal says admin", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  const d = await decideAdmin("Owner@Jazaix.com", l, ok("owner@jazaix.com"));
  assert.deepEqual(d, { admin: true, email: "owner@jazaix.com", role: "admin" });
});

test("decideAdmin: allowlisted but the portal role is not admin -> portal-role", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  const d = await decideAdmin("owner@jazaix.com", l, async () => ({ status: 200, body: { email: "owner@jazaix.com", role: "player" } }));
  assert.equal(d.admin, false);
  assert.equal(d.reason, "portal-role");
});

test("decideAdmin: portal admin but not allowlisted -> not-allowlisted, and the portal is never asked", async () => {
  let asked = 0;
  const d = await decideAdmin("stranger@x.io", parseAllowlist("owner@jazaix.com"), async (e) => { asked++; return ok(e)(); });
  assert.equal(d.admin, false);
  assert.equal(d.reason, "not-allowlisted");
  assert.equal(asked, 0);
});

test("decideAdmin: no email -> signed-out; portal down or throwing -> portal-unavailable", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  assert.equal((await decideAdmin(null, l, ok("x"))).reason, "signed-out");
  assert.equal((await decideAdmin("", l, ok("x"))).reason, "signed-out");
  assert.equal((await decideAdmin("owner@jazaix.com", l, async () => ({ status: 503, body: null }))).reason, "portal-unavailable");
  assert.equal((await decideAdmin("owner@jazaix.com", l, async () => { throw new Error("boom"); })).reason, "portal-unavailable");
});

test("decideAdmin: a 404 or 403 from the portal for the person is a role refusal, not an outage", async () => {
  const l = parseAllowlist("owner@jazaix.com");
  assert.equal((await decideAdmin("owner@jazaix.com", l, async () => ({ status: 404, body: { error: "not-found" } }))).reason, "portal-role");
});

test("gateReasonText has a short line for every reason and never a value", () => {
  for (const r of ["signed-out", "not-allowlisted", "portal-role", "portal-unavailable"]) {
    const t = gateReasonText(r);
    assert.ok(t.length > 10 && t.length < 160, r);
  }
});

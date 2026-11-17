import { test } from "node:test";
import assert from "node:assert/strict";
import { AUDIT_COLLECTION, AUDIT_VIA, appendAudit, auditDoc } from "../src/lib/repo/audit.ts";

const NOW = new Date("2026-11-17T12:00:00Z");

test("auditDoc is { at, actor, action, target, via: admin-console }, actor lower-cased, details only when given", () => {
  assert.equal(AUDIT_COLLECTION, "admin_actions");
  assert.equal(AUDIT_VIA, "admin-console");
  assert.deepEqual(auditDoc({ actor: " Owner@Jazaix.com ", action: "waitlist-approve", target: "abcdefabcdefabcdefabcdef", at: NOW }), {
    at: NOW, actor: "owner@jazaix.com", action: "waitlist-approve", target: "abcdefabcdefabcdefabcdef", via: "admin-console",
  });
  const withDetails = auditDoc({ actor: "o@x.io", action: "set-role", target: "t", details: { from: "player", to: "admin" }, at: NOW });
  assert.deepEqual(withDetails.details, { from: "player", to: "admin" });
  assert.equal("details" in auditDoc({ actor: "o@x.io", action: "set-role", target: "t", details: {}, at: NOW }), false);
  const stamped = auditDoc({ actor: "o@x.io", action: "set-role", target: "t" });
  assert.ok(Math.abs(stamped.at.getTime() - Date.now()) < 5000);
});

test("appendAudit inserts exactly that document into the collection", async () => {
  const inserted = [];
  const col = { async insertOne(d) { inserted.push(d); return { acknowledged: true }; } };
  const doc = await appendAudit(col, { actor: "o@x.io", action: "waitlist-move-back", target: "t", at: NOW });
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0], doc);
  assert.deepEqual(doc, { at: NOW, actor: "o@x.io", action: "waitlist-move-back", target: "t", via: "admin-console" });
});

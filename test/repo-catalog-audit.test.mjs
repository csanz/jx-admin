import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import { catalogColumns, catalogRow, listCatalog } from "../src/lib/repo/catalog.ts";
import { AUDIT_PAGE_SIZE, auditFilter, listAuditActions, recentAuditActions } from "../src/lib/repo/audit.ts";
import { PAGE_SIZE, paged, parsePage, parseSkip } from "../src/lib/repo/paging.ts";
import { displayValue } from "../src/lib/repo/values.ts";

test("paging: page and skip are bounded integers", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("1e9"), 1);
  assert.equal(parsePage("99999"), 20);
  assert.equal(parsePage("500"), 20);
  assert.equal(parseSkip("50"), 50);
  assert.equal(parseSkip("-5"), 0);
  assert.equal(parseSkip("99999999"), 0);
  assert.equal(parseSkip(150), 150);
  assert.deepEqual(paged([1, 2], 2, 1), { rows: [1, 2], total: 2, page: 1, hasMore: false });
  assert.equal(paged([1], 2, 1).hasMore, true);
});

test("displayValue: dates as ISO, ids as hex, objects as short JSON, absent as empty", () => {
  const id = new ObjectId("6af7f418162822b0a89e5239");
  assert.equal(displayValue(null), "");
  assert.equal(displayValue(undefined), "");
  assert.equal(displayValue(true), "true");
  assert.equal(displayValue(200), "200");
  assert.equal(displayValue(new Date("2026-11-14T05:39:36.907Z")), "2026-11-14T05:39:36.907Z");
  assert.equal(displayValue(id), "6af7f418162822b0a89e5239");
  assert.equal(displayValue({ a: id, b: [1] }), '{"a":"6af7f418162822b0a89e5239","b":[1]}');
  assert.equal(displayValue("x".repeat(1000)).length, 300);
});

test("catalog: every field a document has, the known columns first, the rest alphabetically", async () => {
  const docs = [
    { _id: new ObjectId(), sku: "wl-shirt", assetRef: "shirt-wyrm", cosmetic: true, createdAt: new Date("2026-11-14T05:39:36Z"), enabled: true, gameId: "wyrmlight", kind: "avatar-item", name: "Wyrm Tee", priceCredits: 200 },
    { _id: new ObjectId(), sku: "summon-whip", enabled: true, kind: "summon", name: "Release the monster", priceCredits: 200, gameId: "last-seat", zeta: "x", alpha: 1 },
  ];
  const rows = docs.map(catalogRow);
  assert.deepEqual(catalogColumns(rows), ["sku", "name", "kind", "gameId", "priceCredits", "enabled", "cosmetic", "assetRef", "createdAt", "alpha", "zeta"]);
  assert.equal(rows[0].fields.priceCredits, "200");
  assert.equal(rows[0].fields.createdAt, "2026-11-14T05:39:36.000Z");
  assert.equal("_id" in rows[0].fields, false);
  const list = await listCatalog(fakeDb({ catalog: docs }));
  assert.equal(list.total, 2);
  assert.deepEqual(list.rows.map((r) => r.fields.sku), ["summon-whip", "wl-shirt"], "by game, then kind, then sku");
});

test("catalog: pages of 50 with hasMore", async () => {
  const docs = Array.from({ length: 75 }, (_, i) => ({ _id: new ObjectId(), sku: `s-${String(i).padStart(2, "0")}`, gameId: "g", kind: "k" }));
  const db = fakeDb({ catalog: docs });
  const p1 = await listCatalog(db);
  assert.equal(p1.rows.length, PAGE_SIZE);
  assert.equal(p1.hasMore, true);
  const p2 = await listCatalog(db, { page: "2" });
  assert.equal(p2.rows.length, 75);
  assert.equal(p2.hasMore, false);
});

test("audit: newest first, filter by actor (substring, case-insensitive, escaped) and by a known action", async () => {
  const base = Date.UTC(2026, 10, 17);
  const docs = [
    { _id: new ObjectId(), at: new Date(base + 1000), actor: "owner@jazaix.com", action: "set-role", target: "u1", via: "admin-console", details: { from: "player", to: "admin" } },
    { _id: new ObjectId(), at: new Date(base + 3000), actor: "owner@jazaix.com", action: "waitlist-approve", target: "u2", via: "admin-console", details: { email: "sent" } },
    { _id: new ObjectId(), at: new Date(base + 2000), actor: "dev@jazaix.com", action: "waitlist-approve", target: "u3", via: "admin-console" },
  ];
  const db = fakeDb({ admin_actions: docs });
  const all = await listAuditActions(db);
  assert.deepEqual(all.rows.map((r) => r.target), ["u2", "u3", "u1"]);
  assert.equal(all.rows[2].details, '{"from":"player","to":"admin"}');
  assert.equal(all.rows[0].at, new Date(base + 3000).toISOString());
  const byActor = await listAuditActions(db, { actor: "OWNER" });
  assert.deepEqual(byActor.rows.map((r) => r.target), ["u2", "u1"]);
  assert.equal(byActor.actor, "OWNER");
  const byAction = await listAuditActions(db, { action: "waitlist-approve", actor: "dev" });
  assert.deepEqual(byAction.rows.map((r) => r.target), ["u3"]);
  assert.equal(byAction.action, "waitlist-approve");
  assert.deepEqual(auditFilter({ action: "drop-everything" }), {}, "an unknown action is no filter");
  assert.equal(auditFilter({ actor: "a.b" }).actor.$regex, "a\\.b");
  assert.equal((await listAuditActions(db, { actor: ".*" })).total, 0);
  assert.deepEqual((await recentAuditActions(db, 2)).map((r) => r.target), ["u2", "u3"]);
});

test("audit: 100 a page with hasMore", async () => {
  const docs = Array.from({ length: 130 }, (_, i) => ({ _id: new ObjectId(), at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)), actor: "o@x.io", action: "set-role", target: `t${i}` }));
  const db = fakeDb({ admin_actions: docs });
  const p1 = await listAuditActions(db);
  assert.equal(AUDIT_PAGE_SIZE, 100);
  assert.equal(p1.rows.length, 100);
  assert.equal(p1.rows[0].target, "t129");
  assert.equal(p1.hasMore, true);
  const p2 = await listAuditActions(db, { page: "2" });
  assert.equal(p2.rows.length, 130);
  assert.equal(p2.hasMore, false);
});

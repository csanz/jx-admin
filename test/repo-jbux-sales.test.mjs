import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import {
  PLATFORM_SELLER, PLATFORM_SELLER_NAME, RECEIPTS_PAGE_SIZE, addSplit, defaultJbuxEnv, joinCatalogSales, kpiWindows, listReceipts, parseEnv, parseRange,
  receiptsFilter, rollupKpis, rollupSellers, sellerOf, splitOf, splitText, topGames, topItems, walletPots,
} from "../src/lib/repo/jbux-sales.ts";

const NOW = new Date("2026-11-17T15:30:00Z");
const split = (real, test, promo) => ({ real, test, promo });

test("env: prod by default on a production deployment, every env elsewhere; all / a known env / junk", () => {
  assert.equal(defaultJbuxEnv("production"), "prod");
  assert.equal(defaultJbuxEnv("development"), "");
  assert.equal(defaultJbuxEnv(undefined), "");
  assert.equal(defaultJbuxEnv("production", "all"), "", "JX_JBUX_DEFAULT_ENV=all shows every env on a production build");
  assert.equal(defaultJbuxEnv("production", "local"), "local");
  assert.equal(defaultJbuxEnv("production", "bogus"), "prod", "an unknown override is ignored");
  assert.equal(defaultJbuxEnv("development", ""), "");
  assert.equal(parseEnv("all", "prod"), "");
  assert.equal(parseEnv("local", "prod"), "local");
  assert.equal(parseEnv("evil", "prod"), "prod");
  assert.equal(parseEnv(undefined, ""), "");
});

test("range math: UTC days, `to` inclusive, default the last 30 days, reversed ranges swapped, capped at 3 years", () => {
  const d = parseRange({}, NOW);
  assert.equal(d.fromKey, "2026-10-19");
  assert.equal(d.toKey, "2026-11-17");
  assert.equal(d.days, 30);
  assert.equal(d.to.toISOString(), "2026-11-18T00:00:00.000Z", "to is exclusive of the next day");
  const r = parseRange({ from: "2026-11-10", to: "2026-11-01" }, NOW);
  assert.deepEqual([r.fromKey, r.toKey, r.days], ["2026-11-01", "2026-11-10", 10]);
  assert.equal(parseRange({ from: "2026-13-45", to: "nope" }, NOW).toKey, "2026-11-17", "invalid dates fall back");
  assert.ok(parseRange({ from: "2000-01-01" }, NOW).days <= 3 * 366 + 1);
  const w = kpiWindows(NOW);
  assert.deepEqual(w.map((x) => x.from.toISOString().slice(0, 10)), ["2026-11-17", "2026-11-11", "2026-10-19"]);
});

test("KPI roll-up: counts and split sums per window, real revenue = the real pot, refunds from the ledger", () => {
  const days = [
    { day: "2026-11-17", purchases: 2, split: split(100, 0, 50), refunded: 0 },
    { day: "2026-11-12", purchases: 1, split: split(0, 200, 0), refunded: 1 },
    { day: "2026-10-30", purchases: 4, split: split(10, 10, 10), refunded: 0 },
    { day: "2026-10-01", purchases: 9, split: split(999, 0, 0), refunded: 0 },
  ];
  const k = rollupKpis(days, [{ day: "2026-11-17", count: 1 }, { day: "2026-11-01", count: 2 }], NOW);
  assert.deepEqual(k.map((x) => [x.key, x.purchases, splitText(x.spent), x.realRevenue, x.refunds]), [
    ["today", 2, "100/0/50", 100, 1],
    ["7d", 3, "100/200/50", 100, 1],
    ["30d", 7, "110/210/60", 110, 3],
  ]);
});

test("splits: stored splits read as numbers, sums add pot by pot", () => {
  assert.deepEqual(splitOf({ real: 1, test: "x", promo: null }), split(1, 0, 0));
  assert.deepEqual(splitOf(undefined), split(0, 0, 0));
  assert.deepEqual(addSplit(split(1, 2, 3), split(10, 20, 30)), split(11, 22, 33));
});

const SALES = [
  { sku: "a", gameId: "wyrmlight", sales: 2, split: split(0, 100, 300), gross: 400, lastSale: "2026-11-14T06:00:00.000Z", refunded: 0 },
  { sku: "b", gameId: "wyrmlight", sales: 1, split: split(50, 0, 0), gross: 50, lastSale: "2026-11-15T06:00:00.000Z", refunded: 1 },
  { sku: "plat", gameId: "last-minute", sales: 3, split: split(0, 0, 90), gross: 90, lastSale: "2026-11-16T06:00:00.000Z", refunded: 0 },
  { sku: "gone", gameId: "osa", sales: 1, split: split(5, 0, 0), gross: 5, lastSale: null, refunded: 0 },
  { sku: "none", gameId: "wyrmlight", sales: 0, split: split(0, 0, 0), gross: 0, lastSale: null, refunded: 2 },
];

test("top items and games by JBux gross", () => {
  const items = topItems(SALES, new Map([["a", "Aurora"]]));
  assert.deepEqual(items.map((i) => [i.key, i.label, i.gross]), [["a", "Aurora", 400], ["plat", "plat", 90], ["b", "b", 50], ["gone", "gone", 5]]);
  const games = topGames(SALES, new Map([["wyrmlight", "Wyrmlight"]]));
  assert.deepEqual(games.map((g) => [g.key, g.label, g.sales, g.gross, splitText(g.split)]), [
    ["wyrmlight", "Wyrmlight", 3, 450, "50/100/300"],
    ["last-minute", "last-minute", 3, 90, "0/0/90"],
    ["osa", "osa", 1, 5, "5/0/0"],
  ]);
  assert.equal(topItems(SALES, new Map(), 2).length, 2);
});

test("seller attribution: sku -> catalog gameId -> game creator; platform-wide and unknown games go to Jazaix", () => {
  const CREATOR = "6ae204d8c05a94f95f234732";
  const GAMER = "6af8e8b798510477d976ce6f";
  const games = new Map([
    ["wyrmlight", { slug: "wyrmlight", name: "Wyrmlight", creatorId: CREATOR, creatorName: "Christian" }],
    ["osa", { slug: "osa", name: "One Shot Arena", creatorId: GAMER, creatorName: "gamer" }],
    ["orphan", { slug: "orphan", name: "Orphan", creatorId: null, creatorName: "" }],
  ]);
  assert.equal(sellerOf(null, games).key, PLATFORM_SELLER);
  assert.equal(sellerOf("unknown-game", games).name, PLATFORM_SELLER_NAME);
  assert.equal(sellerOf("orphan", games).key, PLATFORM_SELLER, "a game without a creator id is the platform's");
  assert.equal(sellerOf("wyrmlight", games).userId, CREATOR);
  const items = [
    { sku: "a", gameId: "wyrmlight", enabled: true, priceCredits: 200 },
    { sku: "b", gameId: "wyrmlight", enabled: true, priceCredits: 50 },
    { sku: "off", gameId: "wyrmlight", enabled: false, priceCredits: 10 },
    // bought inside last-minute, but the item is platform-wide: the seller is Jazaix, not the game where it sold
    { sku: "plat", gameId: null, enabled: true, priceCredits: 30 },
    { sku: "free", gameId: "osa", enabled: true, priceCredits: 0 },
  ];
  const rows = rollupSellers(items, SALES, games);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual([by[CREATOR].purchases, by[CREATOR].gross, splitText(by[CREATOR].split), by[CREATOR].itemsOnSale], [3, 450, "50/100/300", 2]);
  assert.deepEqual(by[CREATOR].games.map((g) => g.slug), ["wyrmlight"]);
  assert.equal(by[CREATOR].lastSale, "2026-11-15T06:00:00.000Z");
  assert.deepEqual([by[PLATFORM_SELLER].purchases, by[PLATFORM_SELLER].gross, by[PLATFORM_SELLER].itemsOnSale], [3, 90, 1]);
  // "gone" is no longer in the catalog: attributed through the game it sold in (osa -> gamer)
  assert.deepEqual([by[GAMER].purchases, by[GAMER].gross, by[GAMER].itemsOnSale], [1, 5, 0]);
  assert.equal(rows[0].key, CREATOR, "sorted by gross");
});

test("catalog joined to its sales, sorted by gross, sales or sku", () => {
  const items = [{ sku: "b", name: "B", priceCredits: 50, enabled: true }, { sku: "a", name: "A", priceCredits: 200, enabled: true, gameId: "wyrmlight" }, { sku: "z", name: "Z", gameId: null }];
  assert.deepEqual(joinCatalogSales(items, SALES, "gross").map((r) => r.sku), ["a", "b", "z"]);
  assert.deepEqual(joinCatalogSales(items, SALES, "sku").map((r) => r.sku), ["a", "b", "z"]);
  const z = joinCatalogSales(items, SALES, "sales").find((r) => r.sku === "z");
  assert.deepEqual([z.sales, z.gross, z.gameId, z.lastSale], [0, 0, null, null]);
});

test("wallet pots: funds when present, a legacy wallet is all test money", () => {
  assert.deepEqual(walletPots({ balance: 750, funds: { real: 0, test: 650, promo: 100 } }), { real: 0, test: 650, promo: 100, balance: 750 });
  assert.deepEqual(walletPots({ balance: 40 }), { real: 0, test: 40, promo: 0, balance: 40 });
});

test("receipts: the filter, newest first, 50 a page, buyer / item / game names joined", async () => {
  const U = new ObjectId("6ae204d8c05a94f95f234732");
  const base = new Date("2026-11-10T00:00:00Z").getTime();
  const receipts = Array.from({ length: RECEIPTS_PAGE_SIZE + 3 }, (_, i) => ({
    _id: new ObjectId(), receiptId: `r${i}`, userId: U, sku: i % 2 ? "wl-nightshade" : "wl-tee", kind: i % 2 ? "skin" : "avatar-item", gameId: "wyrmlight",
    state: i === 0 ? "refunded" : "issued", priceCredits: 100, split: i % 3 ? split(0, 100, 0) : split(100, 0, 0), env: i % 5 ? "local" : "prod", createdAt: new Date(base + i * 60_000),
  }));
  const db = fakeDb({
    jbox_receipts: receipts,
    users: [{ _id: U, name: "Chris", username: "CaptJoeDeath", email: "c@x.io", imageSmall: "/api/images/u/x-96.webp" }],
    catalog: [{ sku: "wl-nightshade", name: "Nightshade" }],
    games: [{ slug: "wyrmlight", name: "Wyrmlight" }],
  });
  const range = parseRange({ from: "2026-11-01", to: "2026-11-30" }, NOW);
  const all = await listReceipts(db, { env: "", from: range.from, to: range.to });
  assert.equal(all.total, RECEIPTS_PAGE_SIZE + 3);
  assert.equal(all.rows.length, RECEIPTS_PAGE_SIZE);
  assert.equal(all.pageCount, 2);
  assert.equal(all.rows[0].sku, "wl-tee");
  assert.equal(all.rows[0].at, new Date(base + (RECEIPTS_PAGE_SIZE + 2) * 60_000).toISOString(), "newest first");
  const night = all.rows.find((r) => r.sku === "wl-nightshade");
  assert.deepEqual([night.itemName, night.gameName, night.buyer.username, night.buyer.image], ["Nightshade", "Wyrmlight", "CaptJoeDeath", "/api/images/u/x-96.webp"]);
  const page2 = await listReceipts(db, { env: "", from: range.from, to: range.to, page: "2" });
  assert.equal(page2.rows.length, 3);
  const real = await listReceipts(db, { env: "", funding: "real", from: range.from, to: range.to });
  assert.ok(real.rows.every((r) => r.split.real > 0));
  const prod = await listReceipts(db, { env: "prod", from: range.from, to: range.to });
  assert.ok(prod.total > 0 && prod.rows.every((r) => r.env === "prod"));
  const refunded = await listReceipts(db, { env: "", state: "refunded", from: range.from, to: range.to });
  assert.equal(refunded.total, 1);
  const none = await listReceipts(db, { env: "", from: new Date("2027-01-01"), to: new Date("2027-02-01") });
  assert.equal(none.total, 0);
  // injection-shaped values are ignored
  assert.deepEqual(Object.keys(receiptsFilter({ game: { $ne: null }, kind: "A B", state: "nope", funding: "gold", env: "", sku: "../x", buyer: "1", from: range.from, to: range.to })), ["createdAt"]);
});

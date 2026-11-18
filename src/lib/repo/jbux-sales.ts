/**
 * JBUX SALES, read only: purchases (`jbox_receipts`), the catalog with its sales, sellers and wallets.
 *
 * A purchase is a `jbox_receipts` row (the portal writes one per spend: receiptId, userId, sku, kind, gameId,
 * roomId, state issued | consumed | bountied | refunded, priceCredits, split { real, test, promo }, env, createdAt).
 * Sales figures leave REFUNDED receipts out. Refunds are counted from `credit_transactions` (kind "refund").
 *
 * SELLERS: there is no seller ledger. A purchase debits the buyer only; the seller is DERIVED: the receipt's sku ->
 * the catalog item -> its gameId (null = platform-wide) -> the game's creator (games.creator_id / creator_name).
 * Platform-wide items (and items whose game is unknown) are attributed to "Jazaix". The figures are GROSS: the
 * platform share and payouts are not defined yet (owner decision pending).
 *
 * The database does the grouping (aggregation pipelines, bucketed by UTC day or by sku); the roll-ups from those
 * rows into windows, items, games and sellers are pure functions here, tested with plain rows. No framework imports.
 */
import { ObjectId, type Db, type Document, type Filter } from "mongodb";
import { numberedPage, type NumberedPage } from "./paging.ts";
import { idString, isoOrNull, numberOr0, stringOr } from "./values.ts";

export const FUNDINGS = ["real", "test", "promo"] as const;
export type Funding = (typeof FUNDINGS)[number];
export type Split = Record<Funding, number>;
export const RECEIPT_STATES = ["issued", "consumed", "bountied", "refunded"] as const;
export const JBUX_ENVS = ["local", "dev", "staging", "prod"] as const;
export const RECEIPTS_PAGE_SIZE = 50;
export const WALLETS_PAGE_SIZE = 50;
export const TOP_N = 5;
export const CATALOG_SALES_MAX = 500;
/** The seller key for platform-wide items and items whose game is unknown. */
export const PLATFORM_SELLER = "jazaix";
export const PLATFORM_SELLER_NAME = "Jazaix";

const DAY = 86_400_000;
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const KIND_RE = /^[a-z][a-z0-9_-]{0,39}$/;

export const zeroSplit = (): Split => ({ real: 0, test: 0, promo: 0 });

/** A stored split as numbers (missing pots are 0). */
export function splitOf(v: unknown): Split {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { real: numberOr0(o.real), test: numberOr0(o.test), promo: numberOr0(o.promo) };
}

export function addSplit(a: Split, b: Split): Split {
  return { real: a.real + b.real, test: a.test + b.test, promo: a.promo + b.promo };
}

export const splitTotal = (s: Split) => s.real + s.test + s.promo;

/** "real/test/promo" as the tables show a split. */
export const splitText = (s: Split) => `${s.real}/${s.test}/${s.promo}`;

// ── ENV AND RANGE ──────────────────────────────────────────────────────────────────────────────────────────────

/** The env filter's default: prod on a production deployment, every env otherwise (the caller passes NODE_ENV).
 *  JX_JBUX_DEFAULT_ENV overrides it ("all" or one of the portal's envs): a production build reviewed against local data
 *  (the owner's port 3400) would otherwise open every JBux page empty. */
export function defaultJbuxEnv(nodeEnv: string | undefined, override?: string): string {
  if (override === "all") return "";
  if (override && (JBUX_ENVS as readonly string[]).includes(override)) return override;
  return nodeEnv === "production" ? "prod" : "";
}

/** ?env= -> one of the portal's envs, "" for all, or the default when absent. "all" picks every env explicitly. */
export function parseEnv(v: unknown, fallback: string): string {
  if (v === "all") return "";
  if (typeof v === "string" && (JBUX_ENVS as readonly string[]).includes(v)) return v;
  return fallback;
}

/** The start of the UTC day of `now`. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** "YYYY-MM-DD" for a date (UTC). */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * ?from= & ?to= (YYYY-MM-DD, UTC days, `to` inclusive) -> [from, toExclusive). Default: the last 30 days including
 * today. A reversed range is swapped; a range is never longer than 3 years.
 */
export function parseRange(input: { from?: unknown; to?: unknown }, now: Date): { from: Date; to: Date; fromKey: string; toKey: string; days: number } {
  const day = (v: unknown): Date | null => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const today = utcDayStart(now);
  let to = day(input.to) ?? today;
  let from = day(input.from) ?? new Date(to.getTime() - 29 * DAY);
  if (from > to) [from, to] = [to, from];
  if (to.getTime() - from.getTime() > 3 * 366 * DAY) from = new Date(to.getTime() - 3 * 366 * DAY);
  const toExclusive = new Date(to.getTime() + DAY);
  return { from, to: toExclusive, fromKey: dayKey(from), toKey: dayKey(to), days: Math.round((toExclusive.getTime() - from.getTime()) / DAY) };
}

/** The KPI windows: today (since UTC midnight), the last 7 days and the last 30 days (both including today). */
export function kpiWindows(now: Date): Array<{ key: "today" | "7d" | "30d"; label: string; from: Date }> {
  const today = utcDayStart(now);
  return [
    { key: "today", label: "Today", from: today },
    { key: "7d", label: "7 days", from: new Date(today.getTime() - 6 * DAY) },
    { key: "30d", label: "30 days", from: new Date(today.getTime() - 29 * DAY) },
  ];
}

// ── KPIs ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A day's purchases as the database groups them. */
export type DayRow = { day: string; purchases: number; split: Split; refunded: number };
export type Kpi = { key: string; label: string; purchases: number; spent: Split; realRevenue: number; refunds: number };

/**
 * Pure: the KPI tiles from per-day rows. `purchases` counts every receipt; `spent` (and real revenue, the real pot
 * only) leave refunded receipts out (the rows' split is already net of them); `refunds` comes from the ledger.
 */
export function rollupKpis(days: DayRow[], refundDays: Array<{ day: string; count: number }>, now: Date): Kpi[] {
  return kpiWindows(now).map((w) => {
    const fromKey = dayKey(w.from);
    const inside = days.filter((d) => d.day >= fromKey);
    const spent = inside.reduce((s, d) => addSplit(s, d.split), zeroSplit());
    return {
      key: w.key,
      label: w.label,
      purchases: inside.reduce((n, d) => n + d.purchases, 0),
      spent,
      realRevenue: spent.real,
      refunds: refundDays.filter((r) => r.day >= fromKey).reduce((n, r) => n + r.count, 0),
    };
  });
}

/** $toDate on a field that may be a Date or an ISO string. */
const asDate = (field: string): Document => ({ $toDate: `$${field}` });
const NOT_REFUNDED: Document = { $ne: ["$state", "refunded"] };
const potSum = (pot: Funding): Document => ({ $sum: { $cond: [NOT_REFUNDED, { $ifNull: [`$split.${pot}`, 0] }, 0] } });

export async function purchaseKpis(db: Db, input: { env: string; now?: Date }): Promise<Kpi[]> {
  const now = input.now ?? new Date();
  const since = kpiWindows(now)[2].from;
  const envMatch: Document = input.env ? { env: input.env } : {};
  const [days, refunds] = await Promise.all([
    db.collection("jbox_receipts").aggregate([
      { $match: envMatch },
      { $addFields: { _at: asDate("createdAt") } },
      { $match: { _at: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$_at" } },
          purchases: { $sum: 1 },
          real: potSum("real"),
          test: potSum("test"),
          promo: potSum("promo"),
          refunded: { $sum: { $cond: [NOT_REFUNDED, 0, 1] } },
        },
      },
    ]).toArray(),
    db.collection("credit_transactions").aggregate([
      { $match: { kind: "refund", ...envMatch } },
      { $addFields: { _at: asDate("at") } },
      { $match: { _at: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$_at" } }, count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  return rollupKpis(
    days.map((d) => ({ day: String(d._id), purchases: numberOr0(d.purchases), split: splitOf(d), refunded: numberOr0(d.refunded) })),
    refunds.map((r) => ({ day: String(r._id), count: numberOr0(r.count) })),
    now,
  );
}

// ── PER-SKU SALES (the base of items, games and sellers) ───────────────────────────────────────────────────────

/** One sku's sales as the database groups them (refunded receipts left out of everything but `refunded`). */
export type SkuSales = { sku: string; gameId: string; sales: number; split: Split; gross: number; lastSale: string | null; refunded: number };

export async function salesBySku(db: Db, input: { env: string; from?: Date; to?: Date; skus?: string[] }): Promise<SkuSales[]> {
  const match: Document = input.env ? { env: input.env } : {};
  if (input.skus) match.sku = { $in: input.skus };
  const range: Document = {};
  if (input.from) range.$gte = input.from;
  if (input.to) range.$lt = input.to;
  const rows = await db.collection("jbox_receipts").aggregate([
    { $match: match },
    { $addFields: { _at: asDate("createdAt") } },
    ...(Object.keys(range).length ? [{ $match: { _at: range } }] : []),
    {
      $group: {
        _id: "$sku",
        gameId: { $last: "$gameId" },
        sales: { $sum: { $cond: [NOT_REFUNDED, 1, 0] } },
        refunded: { $sum: { $cond: [NOT_REFUNDED, 0, 1] } },
        real: potSum("real"),
        test: potSum("test"),
        promo: potSum("promo"),
        gross: { $sum: { $cond: [NOT_REFUNDED, { $ifNull: ["$priceCredits", 0] }, 0] } },
        lastSale: { $max: { $cond: [NOT_REFUNDED, "$_at", null] } },
      },
    },
  ]).toArray();
  return rows.map((r) => ({
    sku: String(r._id ?? ""),
    gameId: stringOr(r.gameId),
    sales: numberOr0(r.sales),
    split: splitOf(r),
    gross: numberOr0(r.gross),
    lastSale: isoOrNull(r.lastSale),
    refunded: numberOr0(r.refunded),
  }));
}

export type TopRow = { key: string; label: string; sales: number; gross: number; split: Split };

/** Pure: the top n items by JBux (gross), ties by sales then key. */
export function topItems(rows: SkuSales[], names: Map<string, string>, n = TOP_N): TopRow[] {
  return rows
    .filter((r) => r.sales > 0)
    .map((r) => ({ key: r.sku, label: names.get(r.sku) || r.sku, sales: r.sales, gross: r.gross, split: r.split }))
    .sort((a, b) => b.gross - a.gross || b.sales - a.sales || a.key.localeCompare(b.key))
    .slice(0, n);
}

/** Pure: the top n games by JBux, from per-sku rows (a receipt's game is where the item was bought). */
export function topGames(rows: SkuSales[], gameNames: Map<string, string>, n = TOP_N): TopRow[] {
  const by = new Map<string, TopRow>();
  for (const r of rows) {
    if (r.sales <= 0) continue;
    const key = r.gameId || "";
    const t = by.get(key) ?? { key, label: key ? gameNames.get(key) || key : "no game", sales: 0, gross: 0, split: zeroSplit() };
    t.sales += r.sales;
    t.gross += r.gross;
    t.split = addSplit(t.split, r.split);
    by.set(key, t);
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross || b.sales - a.sales || a.key.localeCompare(b.key)).slice(0, n);
}

// ── PURCHASES (the receipts table) ─────────────────────────────────────────────────────────────────────────────

export type ReceiptFilterInput = { game?: unknown; kind?: unknown; funding?: unknown; state?: unknown; env: string; sku?: unknown; buyer?: unknown; from: Date; to: Date };

/** Pure: the receipts filter. Invalid values are ignored; funding means "that pot paid part of it". */
export function receiptsFilter(f: ReceiptFilterInput): Filter<Document> {
  const q: Document = { createdAt: { $gte: f.from, $lt: f.to } };
  if (typeof f.game === "string" && SLUG_RE.test(f.game)) q.gameId = f.game;
  if (typeof f.kind === "string" && KIND_RE.test(f.kind)) q.kind = f.kind;
  if (typeof f.state === "string" && (RECEIPT_STATES as readonly string[]).includes(f.state)) q.state = f.state;
  if (typeof f.funding === "string" && (FUNDINGS as readonly string[]).includes(f.funding)) q[`split.${f.funding}`] = { $gt: 0 };
  if (f.env) q.env = f.env;
  if (typeof f.sku === "string" && SKU_RE.test(f.sku)) q.sku = f.sku;
  if (typeof f.buyer === "string" && /^[a-f0-9]{24}$/i.test(f.buyer)) q.userId = { $in: [new ObjectId(f.buyer), f.buyer.toLowerCase()] };
  return q;
}

export type Person = { id: string; name: string; username: string; email: string; image: string };
export type ReceiptRow = {
  id: string;
  at: string | null;
  buyer: Person;
  sku: string;
  itemName: string;
  kind: string;
  gameId: string;
  gameName: string;
  roomId: string;
  price: number;
  split: Split;
  state: string;
  env: string;
};

export async function listReceipts(db: Db, input: ReceiptFilterInput & { page?: unknown }): Promise<NumberedPage<ReceiptRow>> {
  const filter = receiptsFilter(input);
  const col = db.collection("jbox_receipts");
  const p = await numberedPage({
    page: input.page,
    size: RECEIPTS_PAGE_SIZE,
    count: () => col.countDocuments(filter),
    fetch: (skip, limit) => col.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  });
  const [people, items, games] = await Promise.all([
    peopleById(db, p.rows.map((r) => idString(r.userId))),
    itemNames(db, p.rows.map((r) => stringOr(r.sku))),
    gameNamesBySlug(db, p.rows.map((r) => stringOr(r.gameId))),
  ]);
  return {
    ...p,
    rows: p.rows.map((r) => {
      const uid = idString(r.userId) ?? "";
      return {
        id: idString(r._id) ?? stringOr(r.receiptId),
        at: isoOrNull(r.createdAt),
        buyer: people.get(uid) ?? { id: uid, name: "", username: "", email: "", image: "" },
        sku: stringOr(r.sku),
        itemName: items.get(stringOr(r.sku)) ?? "",
        kind: stringOr(r.kind),
        gameId: stringOr(r.gameId),
        gameName: games.get(stringOr(r.gameId)) ?? "",
        roomId: stringOr(r.roomId),
        price: numberOr0(r.priceCredits),
        split: splitOf(r.split),
        state: stringOr(r.state),
        env: stringOr(r.env),
      };
    }),
  };
}

/** The values the purchases filters offer (games, kinds, envs present in the receipts). */
export async function receiptFilterOptions(db: Db): Promise<{ games: string[]; kinds: string[]; envs: string[] }> {
  const col = db.collection("jbox_receipts");
  const [games, kinds, envs] = await Promise.all([col.distinct("gameId"), col.distinct("kind"), col.distinct("env")]);
  const strings = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === "string" && x !== ""))].sort();
  return { games: strings(games), kinds: strings(kinds), envs: [...new Set([...JBUX_ENVS, ...strings(envs)])] };
}

// ── LOOKUPS ────────────────────────────────────────────────────────────────────────────────────────────────────

const hexIds = (ids: Array<string | null>) => [...new Set(ids.filter((i): i is string => typeof i === "string" && /^[a-f0-9]{24}$/i.test(i)))];

export async function peopleById(db: Db, ids: Array<string | null>): Promise<Map<string, Person>> {
  const hex = hexIds(ids);
  if (!hex.length) return new Map();
  const users = await db.collection("users").find({ _id: { $in: hex.map((h) => new ObjectId(h)) } }, { projection: { name: 1, username: 1, email: 1, image: 1, imageSmall: 1 } }).toArray();
  return new Map(users.map((u) => {
    const id = idString(u._id) ?? "";
    return [id, { id, name: stringOr(u.name), username: stringOr(u.username), email: stringOr(u.email), image: stringOr(u.imageSmall) || stringOr(u.image) }];
  }));
}

async function itemNames(db: Db, skus: string[]): Promise<Map<string, string>> {
  const list = [...new Set(skus.filter(Boolean))];
  if (!list.length) return new Map();
  const docs = await db.collection("catalog").find({ sku: { $in: list } }, { projection: { sku: 1, name: 1 } }).toArray();
  return new Map(docs.map((d) => [stringOr(d.sku), stringOr(d.name)]));
}

export async function gameNamesBySlug(db: Db, slugs: string[]): Promise<Map<string, string>> {
  const list = [...new Set(slugs.filter(Boolean))];
  if (!list.length) return new Map();
  const docs = await db.collection("games").find({ slug: { $in: list } }, { projection: { slug: 1, name: 1 } }).toArray();
  return new Map(docs.map((d) => [stringOr(d.slug), stringOr(d.name)]));
}

// ── PURCHASES PAGE ─────────────────────────────────────────────────────────────────────────────────────────────

export type PurchasesView = {
  env: string;
  range: { fromKey: string; toKey: string; days: number };
  kpis: Kpi[];
  topItems: TopRow[];
  topGames: TopRow[];
  receipts: NumberedPage<ReceiptRow>;
  options: { games: string[]; kinds: string[]; envs: string[] };
};

export async function getPurchases(db: Db, input: { game?: unknown; kind?: unknown; funding?: unknown; state?: unknown; env: string; sku?: unknown; buyer?: unknown; from?: unknown; to?: unknown; page?: unknown; now?: Date }): Promise<PurchasesView> {
  const now = input.now ?? new Date();
  const range = parseRange(input, now);
  const [kpis, bySku, receipts, options] = await Promise.all([
    purchaseKpis(db, { env: input.env, now }),
    salesBySku(db, { env: input.env, from: range.from, to: range.to }),
    listReceipts(db, { ...input, from: range.from, to: range.to }),
    receiptFilterOptions(db),
  ]);
  const [names, gameNames] = await Promise.all([itemNames(db, bySku.map((r) => r.sku)), gameNamesBySlug(db, bySku.map((r) => r.gameId))]);
  return {
    env: input.env,
    range: { fromKey: range.fromKey, toKey: range.toKey, days: range.days },
    kpis,
    topItems: topItems(bySku, names),
    topGames: topGames(bySku, gameNames),
    receipts,
    options,
  };
}

// ── CATALOG WITH SALES ─────────────────────────────────────────────────────────────────────────────────────────

export type CatalogSalesRow = {
  sku: string;
  name: string;
  kind: string;
  gameId: string | null;
  price: number;
  enabled: boolean;
  cosmetic: boolean;
  sales: number;
  split: Split;
  gross: number;
  lastSale: string | null;
};

export const CATALOG_SORTS = ["sales", "gross", "sku"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];
export const parseCatalogSort = (v: unknown): CatalogSort => (CATALOG_SORTS.includes(v as CatalogSort) ? (v as CatalogSort) : "gross");

/** Pure: catalog items joined to their sales, sorted. */
export function joinCatalogSales(items: Document[], sales: SkuSales[], sort: CatalogSort): CatalogSalesRow[] {
  const bySku = new Map(sales.map((s) => [s.sku, s]));
  const rows = items.map((d) => {
    const sku = stringOr(d.sku);
    const s = bySku.get(sku);
    return {
      sku,
      name: stringOr(d.name),
      kind: stringOr(d.kind),
      gameId: typeof d.gameId === "string" && d.gameId ? d.gameId : null,
      price: numberOr0(d.priceCredits),
      enabled: d.enabled === true,
      cosmetic: d.cosmetic === true,
      sales: s?.sales ?? 0,
      split: s?.split ?? zeroSplit(),
      gross: s?.gross ?? 0,
      lastSale: s?.lastSale ?? null,
    };
  });
  const bySkuName = (a: CatalogSalesRow, b: CatalogSalesRow) => a.sku.localeCompare(b.sku);
  if (sort === "sales") return rows.sort((a, b) => b.sales - a.sales || b.gross - a.gross || bySkuName(a, b));
  if (sort === "gross") return rows.sort((a, b) => b.gross - a.gross || b.sales - a.sales || bySkuName(a, b));
  return rows.sort(bySkuName);
}

export async function catalogWithSales(db: Db, input: { env: string; sort?: unknown }): Promise<{ rows: CatalogSalesRow[]; total: number; sort: CatalogSort }> {
  const sort = parseCatalogSort(input.sort);
  const col = db.collection("catalog");
  const [total, items, sales] = await Promise.all([
    col.countDocuments({}),
    col.find({}).sort({ gameId: 1, sku: 1, _id: 1 }).limit(CATALOG_SALES_MAX).toArray(),
    salesBySku(db, { env: input.env }),
  ]);
  return { rows: joinCatalogSales(items, sales, sort), total, sort };
}

// ── SELLERS ────────────────────────────────────────────────────────────────────────────────────────────────────

export type GameOwner = { slug: string; name: string; creatorId: string | null; creatorName: string };

export type SellerRow = {
  key: string;
  name: string;
  userId: string | null;
  games: Array<{ slug: string; name: string }>;
  itemsOnSale: number;
  purchases: number;
  split: Split;
  gross: number;
  lastSale: string | null;
};

/** The seller a catalog item is attributed to: its game's creator, else Jazaix (platform-wide or unknown game). */
export function sellerOf(itemGameId: string | null, games: Map<string, GameOwner>): { key: string; name: string; userId: string | null; game: GameOwner | null } {
  const g = itemGameId ? games.get(itemGameId) : undefined;
  if (g && g.creatorId) return { key: g.creatorId, name: g.creatorName || g.creatorId, userId: g.creatorId, game: g };
  return { key: PLATFORM_SELLER, name: PLATFORM_SELLER_NAME, userId: null, game: g ?? null };
}

/**
 * Pure: one row per seller. Every catalog item belongs to its seller (sku -> gameId -> creator); the item's sales
 * (from per-sku rows) add to that seller. Items on sale = enabled items with a price.
 */
export function rollupSellers(items: Document[], sales: SkuSales[], games: Map<string, GameOwner>): SellerRow[] {
  const salesBySku = new Map(sales.map((s) => [s.sku, s]));
  const by = new Map<string, SellerRow>();
  const itemSkus = new Set<string>();
  const touch = (gameId: string | null) => {
    const s = sellerOf(gameId, games);
    let row = by.get(s.key);
    if (!row) {
      row = { key: s.key, name: s.name, userId: s.userId, games: [], itemsOnSale: 0, purchases: 0, split: zeroSplit(), gross: 0, lastSale: null };
      by.set(s.key, row);
    }
    if (s.game && !row.games.some((g) => g.slug === s.game!.slug)) row.games.push({ slug: s.game.slug, name: s.game.name });
    return row;
  };
  const addSales = (row: SellerRow, s: SkuSales | undefined) => {
    if (!s) return;
    row.purchases += s.sales;
    row.split = addSplit(row.split, s.split);
    row.gross += s.gross;
    if (s.lastSale && (!row.lastSale || s.lastSale > row.lastSale)) row.lastSale = s.lastSale;
  };
  for (const d of items) {
    const sku = stringOr(d.sku);
    itemSkus.add(sku);
    const gameId = typeof d.gameId === "string" && d.gameId ? d.gameId : null;
    const row = touch(gameId);
    if (d.enabled === true && numberOr0(d.priceCredits) > 0) row.itemsOnSale += 1;
    addSales(row, salesBySku.get(sku));
  }
  // a sold sku that is no longer in the catalog: attributed through the game it was bought in
  for (const s of sales) if (!itemSkus.has(s.sku)) addSales(touch(s.gameId || null), s);
  return [...by.values()].sort((a, b) => b.gross - a.gross || b.purchases - a.purchases || a.name.localeCompare(b.name));
}

export async function gameOwners(db: Db): Promise<Map<string, GameOwner>> {
  const docs = await db.collection("games").find({}, { projection: { slug: 1, name: 1, creator_id: 1, creator_name: 1 } }).toArray();
  return new Map(docs.map((g) => [stringOr(g.slug), { slug: stringOr(g.slug), name: stringOr(g.name), creatorId: idString(g.creator_id), creatorName: stringOr(g.creator_name) }]));
}

export async function listSellers(db: Db, input: { env: string }): Promise<Array<SellerRow & { person: Person | null }>> {
  const [items, sales, games] = await Promise.all([
    db.collection("catalog").find({}, { projection: { sku: 1, gameId: 1, enabled: 1, priceCredits: 1 } }).limit(CATALOG_SALES_MAX).toArray(),
    salesBySku(db, { env: input.env }),
    gameOwners(db),
  ]);
  const rows = rollupSellers(items, sales, games);
  const people = await peopleById(db, rows.map((r) => r.userId));
  return rows.map((r) => ({ ...r, person: r.userId ? (people.get(r.userId) ?? null) : null }));
}

/** One seller's sales by item (the seller key is a creator's 24-hex id or "jazaix"). */
export async function getSeller(db: Db, key: unknown, input: { env: string }): Promise<{ seller: SellerRow & { person: Person | null }; items: CatalogSalesRow[] } | null> {
  if (typeof key !== "string" || !(key === PLATFORM_SELLER || /^[a-f0-9]{24}$/i.test(key))) return null;
  const k = key.toLowerCase();
  const [items, sales, games] = await Promise.all([
    db.collection("catalog").find({}).limit(CATALOG_SALES_MAX).toArray(),
    salesBySku(db, { env: input.env }),
    gameOwners(db),
  ]);
  const seller = rollupSellers(items, sales, games).find((s) => s.key === k);
  if (!seller) return null;
  const mine = items.filter((d) => sellerOf(typeof d.gameId === "string" && d.gameId ? d.gameId : null, games).key === k);
  const people = seller.userId ? await peopleById(db, [seller.userId]) : new Map<string, Person>();
  return { seller: { ...seller, person: seller.userId ? (people.get(seller.userId) ?? null) : null }, items: joinCatalogSales(mine, sales, "gross") };
}

// ── WALLETS ────────────────────────────────────────────────────────────────────────────────────────────────────

export type WalletRow = { id: string; user: Person; real: number; test: number; promo: number; balance: number; hold: string | null; updatedAt: string | null };
export type WalletTotals = { count: number; real: number; test: number; promo: number; onHold: number };

export const WALLET_SORTS = ["real", "balance", "promo", "test", "updated"] as const;
export type WalletSort = (typeof WALLET_SORTS)[number];
export const parseWalletSort = (v: unknown): WalletSort => (WALLET_SORTS.includes(v as WalletSort) ? (v as WalletSort) : "real");

const walletSortSpec = (s: WalletSort): Record<string, 1 | -1> =>
  s === "updated" ? { updatedAt: -1, _id: -1 } : s === "balance" ? { balance: -1, _id: -1 } : { [`funds.${s}`]: -1, balance: -1, _id: -1 };

/** Pure: a wallet's pots (a legacy wallet with no `funds` is all test money, the ledger report's rule). */
export function walletPots(doc: Document): Split & { balance: number } {
  const f = doc.funds && typeof doc.funds === "object" ? (doc.funds as Record<string, unknown>) : null;
  const balance = numberOr0(doc.balance);
  return f ? { real: numberOr0(f.real), test: numberOr0(f.test), promo: numberOr0(f.promo), balance } : { real: 0, test: balance, promo: 0, balance };
}

export async function listWallets(db: Db, input: { sort?: unknown; page?: unknown } = {}): Promise<NumberedPage<WalletRow> & { sort: WalletSort; totals: WalletTotals }> {
  const sort = parseWalletSort(input.sort);
  const col = db.collection("wallets");
  const [p, totalsRows] = await Promise.all([
    numberedPage({
      page: input.page,
      size: WALLETS_PAGE_SIZE,
      count: () => col.countDocuments({}),
      fetch: (skip, limit) => col.find({}).sort(walletSortSpec(sort)).skip(skip).limit(limit).toArray(),
    }),
    col.aggregate([
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          real: { $sum: { $ifNull: ["$funds.real", 0] } },
          test: { $sum: { $ifNull: ["$funds.test", "$balance"] } },
          promo: { $sum: { $ifNull: ["$funds.promo", 0] } },
          onHold: { $sum: { $cond: [{ $ifNull: ["$hold", false] }, 1, 0] } },
        },
      },
    ]).toArray(),
  ]);
  const people = await peopleById(db, p.rows.map((w) => idString(w.userId)));
  const t = totalsRows[0] ?? {};
  return {
    ...p,
    sort,
    totals: { count: numberOr0(t.count), real: numberOr0(t.real), test: numberOr0(t.test), promo: numberOr0(t.promo), onHold: numberOr0(t.onHold) },
    rows: p.rows.map((w) => {
      const uid = idString(w.userId) ?? "";
      const pots = walletPots(w);
      return {
        id: idString(w._id) ?? "",
        user: people.get(uid) ?? { id: uid, name: "", username: "", email: "", image: "" },
        ...pots,
        hold: typeof w.hold === "string" && w.hold ? w.hold : null,
        updatedAt: isoOrNull(w.updatedAt),
      };
    }),
  };
}

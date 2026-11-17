/**
 * THE JBUX ADMIN REPORT, read straight from the platform database: the portal's getJboxReport (jx-portal
 * src/lib/wallet-admin.ts, jx-docs/jbox-design.md D15 §7) ported line for line, READ side only.
 *   - ledger totals by kind x source x funding pot (credit_transactions), with a row's `split` when it has one,
 *     else its whole amount on its `funding`;
 *   - credited vs debited per pot (spend and reversal debit, everything else credits);
 *   - every wallet pot right now and how many wallets are on hold (wallets; a legacy wallet with no `funds` counts
 *     its balance as test money, as the portal does);
 *   - who test-bought what (grant / test-buy), newest first, at most 200.
 * Test money is reported apart from real money, always: the pots never add up into one number here.
 *
 * The money MUTATIONS (adminRefund, setHold) are NOT here and must not be ported: they are the ledger's money
 * rules (splits, pots, entitlement revocation) and have one implementation, the portal's. The console calls them
 * through the portal link (src/app/api/jbox/refund, /hold).
 * No framework imports.
 */
import { ObjectId, type Db, type Document } from "mongodb";

export const JBUX_FUNDINGS = ["real", "test", "promo"] as const;
export type JbuxFunding = (typeof JBUX_FUNDINGS)[number];
export const REPORT_KINDS = ["grant", "purchase", "spend", "refund", "reversal", "adjust"] as const;
const DEBIT_KINDS = ["spend", "reversal"];
export const TEST_BUYS_LIMIT = 200;

export class ReportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportInputError";
  }
}

export type FundingTotals = Record<JbuxFunding, { credited: number; debited: number }>;

export type JbuxReport = {
  filter: { funding: JbuxFunding | null; kind: string | null; from: string | null; to: string | null };
  /** One line per (kind, source): row count and each pot's share. */
  lines: Array<{ kind: string; source: string | null; rows: number; real: number; test: number; promo: number }>;
  byFunding: FundingTotals;
  /** Every pot across all wallets right now, and how many wallets are on hold. */
  wallets: { real: number; test: number; promo: number; balance: number; onHold: number; count: number };
  /** Who test-bought, when, how much (newest first, at most 200). */
  testBuys: Array<{ userId: string; email: string | null; amount: number; at: string; env: string | null; packId: string | null }>;
};

export type ReportInput = { funding?: string | null; kind?: string | null; from?: string | null; to?: string | null };
export type ReportFilter = { funding: JbuxFunding | null; kind: string | null; from: Date | null; to: Date | null };

/** Pure: the query string's four filters, validated the portal's way (throws ReportInputError). */
export function parseReportFilter(input: ReportInput = {}): ReportFilter {
  const funding = input.funding && (JBUX_FUNDINGS as readonly string[]).includes(input.funding) ? (input.funding as JbuxFunding) : null;
  if (input.funding && !funding) throw new ReportInputError("funding must be real, test or promo");
  const kind = input.kind && (REPORT_KINDS as readonly string[]).includes(input.kind) ? input.kind : null;
  if (input.kind && !kind) throw new ReportInputError(`kind must be one of ${REPORT_KINDS.join(", ")}`);
  const date = (v: string | null | undefined, name: string): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new ReportInputError(`${name} is not a date`);
    return d;
  };
  return { funding, kind, from: date(input.from, "from"), to: date(input.to, "to") };
}

/** Pure: the $match on credit_transactions for a filter (the portal's). */
export function ledgerMatch(f: ReportFilter): Document {
  const match: Document = {};
  if (f.kind) match.kind = f.kind;
  if (f.from || f.to) match.at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
  if (f.funding) match.$or = [{ funding: f.funding }, { [`split.${f.funding}`]: { $gt: 0 } }];
  return match;
}

/** The ledger's per-row share of each pot: `split` when the row has one, else its whole amount on its `funding`. */
export const POT_SHARE = (pot: JbuxFunding): Document => ({
  $cond: [
    { $ifNull: ["$split", false] },
    { $ifNull: [`$split.${pot}`, 0] },
    { $cond: [{ $eq: ["$funding", pot] }, "$amount", 0] },
  ],
});

export function emptyFundingTotals(): FundingTotals {
  return Object.fromEntries(JBUX_FUNDINGS.map((p) => [p, { credited: 0, debited: 0 }])) as FundingTotals;
}

async function fundingTotals(db: Db, match: Document): Promise<FundingTotals> {
  const group: Document = { _id: { debit: { $in: ["$kind", DEBIT_KINDS] } } };
  for (const pot of JBUX_FUNDINGS) group[pot] = { $sum: POT_SHARE(pot) };
  const rows = await db.collection("credit_transactions").aggregate([{ $match: match }, { $group: group }]).toArray();
  const out = emptyFundingTotals();
  for (const r of rows) {
    for (const pot of JBUX_FUNDINGS) {
      if (r._id.debit) out[pot].debited += Number(r[pot] ?? 0);
      else out[pot].credited += Number(r[pot] ?? 0);
    }
  }
  return out;
}

/** The report: totals by kind x source x funding, test buys, wallet pots. */
export async function getJbuxReport(db: Db, input: ReportInput = {}): Promise<JbuxReport> {
  const f = parseReportFilter(input);
  const match = ledgerMatch(f);
  const group: Document = { _id: { kind: "$kind", source: "$source" }, rows: { $sum: 1 } };
  for (const pot of JBUX_FUNDINGS) group[pot] = { $sum: POT_SHARE(pot) };
  const [lineRows, byFunding, walletAgg, testBuyRows] = await Promise.all([
    db.collection("credit_transactions").aggregate([{ $match: match }, { $group: group }, { $sort: { "_id.kind": 1, "_id.source": 1 } }]).toArray(),
    fundingTotals(db, match),
    db.collection("wallets").aggregate([
      {
        $group: {
          _id: null,
          real: { $sum: { $ifNull: ["$funds.real", 0] } },
          test: { $sum: { $ifNull: ["$funds.test", "$balance"] } },
          promo: { $sum: { $ifNull: ["$funds.promo", 0] } },
          balance: { $sum: "$balance" },
          onHold: { $sum: { $cond: [{ $ifNull: ["$hold", false] }, 1, 0] } },
          count: { $sum: 1 },
        },
      },
    ]).toArray(),
    db.collection("credit_transactions")
      .find({ kind: "grant", source: "test-buy", ...(match.at ? { at: match.at } : {}) }, { projection: { userId: 1, amount: 1, at: 1, env: 1, packId: 1 } })
      .sort({ at: -1 })
      .limit(TEST_BUYS_LIMIT)
      .toArray(),
  ]);
  const userIds = [...new Set(testBuyRows.map((r) => String(r.userId)))].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users = userIds.length ? await db.collection("users").find({ _id: { $in: userIds } }, { projection: { email: 1 } }).toArray() : [];
  const emailById = new Map(users.map((u) => [String(u._id), (u.email as string) || null]));
  const w = walletAgg[0] ?? {};
  return {
    filter: { funding: f.funding, kind: f.kind, from: f.from?.toISOString() ?? null, to: f.to?.toISOString() ?? null },
    lines: lineRows.map((r) => ({ kind: r._id.kind as string, source: (r._id.source as string) ?? null, rows: r.rows as number, real: Number(r.real), test: Number(r.test), promo: Number(r.promo) })),
    byFunding,
    wallets: { real: Number(w.real ?? 0), test: Number(w.test ?? 0), promo: Number(w.promo ?? 0), balance: Number(w.balance ?? 0), onHold: Number(w.onHold ?? 0), count: Number(w.count ?? 0) },
    testBuys: testBuyRows.map((r) => ({
      userId: String(r.userId),
      email: emailById.get(String(r.userId)) ?? null,
      amount: Number(r.amount),
      at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
      env: (r.env as string) ?? null,
      packId: (r.packId as string) ?? null,
    })),
  };
}

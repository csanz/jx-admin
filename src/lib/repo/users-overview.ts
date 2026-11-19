/**
 * THE USERS OVERVIEW (owner 2026-11-19: "the same thing in overview with player traffic across the board on the users
 * section"), for a range of 1 week / 1 month / 1 year (?activity=, the activity pages' ranges):
 *   tiles      accounts in all (bots left out), new in the range, active in the range (a sign-in or a play, the Last
 *              active rule), returning (active, created before the range), on the waitlist, never active
 *   new        new accounts per UTC day (users.createdAt)
 *   players    players per UTC day across every game from game_sessions, split into accounts (a 24-hex player id)
 *              and guests (anything else), bot sessions left out: the same source and rule as the Games overview, so
 *              the two pages agree
 *   lastSeen   every account by when it was last seen: today, this week, this month, older, never
 * The per-account figures come from one pass over the accounts (createdAt, lastLoginAt, access) joined in code with
 * one group of play_history by user (its latest played_at), so the page costs two scans, not a lookup per account.
 * No framework imports.
 */
import type { Db, Document } from "mongodb";
import { HUMAN_SESSION, dayKeys, dayStages, parseActivityRange, rangeStart, seriesSum, zeroFill, type ActivityRange, type Point } from "./analytics.ts";
import { numberOr0 } from "./values.ts";
import { userIdHex } from "./users.ts";

export const HUMAN_USER: Document = { role: { $ne: "bot" } };
const DAY_MS = 86_400_000;

export const LAST_SEEN_BUCKETS = ["today", "week", "month", "older", "never"] as const;
export type LastSeenBucket = (typeof LAST_SEEN_BUCKETS)[number];
export const LAST_SEEN_LABEL: Record<LastSeenBucket, string> = { today: "today", week: "this week", month: "this month", older: "older", never: "never" };

export type LastSeenRow = { bucket: LastSeenBucket; count: number; share: number };

export type AccountSummary = {
  accounts: number;
  active: number;
  returning: number;
  waitlist: number;
  neverActive: number;
  lastSeen: LastSeenRow[];
};

export type UsersOverview = AccountSummary & {
  days: ActivityRange;
  from: string;
  to: string;
  newAccounts: { points: Point[]; total: number };
  players: { points: Point[]; total: number; accounts: number; guests: number };
};

/** The fields of an account the summary reads. */
export type AccountRow = { id: string; createdAt: Date | null; lastLoginAt: Date | null; waitlist: boolean };

const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

/** A users document as an AccountRow. */
export function accountRow(doc: Document): AccountRow {
  return { id: userIdHex(doc._id) ?? "", createdAt: asDate(doc.createdAt), lastLoginAt: asDate(doc.lastLoginAt), waitlist: doc.access === "waitlist" };
}

/** Pure: the later of a sign-in and a play, or null. */
export function lastSeenAt(row: AccountRow, latestPlay: Date | null): Date | null {
  if (row.lastLoginAt && latestPlay) return row.lastLoginAt > latestPlay ? row.lastLoginAt : latestPlay;
  return row.lastLoginAt ?? latestPlay;
}

/** Pure: which bucket a last-seen instant falls in at `now` (UTC today; a week and a month are 7 and 30 days). */
export function lastSeenBucket(at: Date | null, now: Date): LastSeenBucket {
  if (!at) return "never";
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const t = at.getTime();
  if (t >= today) return "today";
  if (t >= now.getTime() - 7 * DAY_MS) return "week";
  if (t >= now.getTime() - 30 * DAY_MS) return "month";
  return "older";
}

/**
 * Pure: the tiles and the last-seen rows from the accounts and each account's latest play (a Map by hex id).
 * `from` is the start of the range: active = seen at or after it, returning = active and created before it.
 */
export function summarizeAccounts(rows: AccountRow[], latestPlay: Map<string, Date>, from: Date, now: Date): AccountSummary {
  const counts: Record<LastSeenBucket, number> = { today: 0, week: 0, month: 0, older: 0, never: 0 };
  let active = 0;
  let returning = 0;
  let waitlist = 0;
  for (const r of rows) {
    const seen = lastSeenAt(r, latestPlay.get(r.id) ?? null);
    counts[lastSeenBucket(seen, now)] += 1;
    if (r.waitlist) waitlist += 1;
    if (seen && seen >= from) {
      active += 1;
      if (r.createdAt && r.createdAt < from) returning += 1;
    }
  }
  const total = rows.length;
  return {
    accounts: total,
    active,
    returning,
    waitlist,
    neverActive: counts.never,
    lastSeen: LAST_SEEN_BUCKETS.map((bucket) => ({ bucket, count: counts[bucket], share: total ? counts[bucket] / total : 0 })),
  };
}

/** Pure: { hex -> latest played_at } from play_history rows grouped by user_id ({ _id: user_id, at }). */
export function latestPlayByUser(rows: Document[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    const hex = userIdHex(r._id);
    const at = asDate(r.at);
    if (!hex || !at) continue;
    const prev = out.get(hex);
    if (!prev || at > prev) out.set(hex, at);
  }
  return out;
}

/** The $cond that tells an account's session (a 24-hex player id) from a guest's. */
const IS_ACCOUNT: Document = { $regexMatch: { input: { $toString: { $ifNull: ["$player_id", ""] } }, regex: "^[a-f0-9]{24}$", options: "i" } };

export async function getUsersOverview(db: Db, input: { range?: unknown; now?: Date } = {}): Promise<UsersOverview> {
  const now = input.now ?? new Date();
  const days = parseActivityRange(input.range);
  const from = rangeStart(now, days);
  const keys = dayKeys(now, days);

  const [accounts, plays, newDaily, playersDaily, playersRange] = await Promise.all([
    db.collection("users").find(HUMAN_USER, { projection: { createdAt: 1, lastLoginAt: 1, access: 1 } }).toArray(),
    db.collection("play_history").aggregate([{ $group: { _id: "$user_id", at: { $max: "$played_at" } } }]).toArray(),
    db.collection("users").aggregate([...dayStages("createdAt", from, HUMAN_USER), { $group: { _id: "$_day", accounts: { $sum: 1 } } }]).toArray(),
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      { $group: { _id: "$_day", accountSet: { $addToSet: { $cond: [IS_ACCOUNT, "$player_id", "$$REMOVE"] } }, guestSet: { $addToSet: { $cond: [IS_ACCOUNT, "$$REMOVE", "$player_id"] } } } },
      { $project: { accounts: { $size: "$accountSet" }, guests: { $size: "$guestSet" } } },
    ]).toArray(),
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      { $group: { _id: "$player_id", account: { $max: { $cond: [IS_ACCOUNT, 1, 0] } } } },
      { $group: { _id: null, total: { $sum: 1 }, accounts: { $sum: "$account" } } },
    ]).toArray(),
  ]);

  const summary = summarizeAccounts(accounts.map(accountRow), latestPlayByUser(plays), from, now);
  const newAccounts = zeroFill(keys, newDaily, ["accounts"]);
  const players = zeroFill(keys, playersDaily, ["accounts", "guests"]);
  const range = playersRange[0] ?? {};
  const total = numberOr0(range.total);
  const accountPlayers = numberOr0(range.accounts);
  return {
    ...summary,
    days,
    from: keys[0],
    to: keys[keys.length - 1],
    newAccounts: { points: newAccounts, total: seriesSum(newAccounts, "accounts") },
    // players per day summed over days would count a person once per day: the totals are the distinct ids in the range
    players: { points: players, total, accounts: accountPlayers, guests: total - accountPlayers },
  };
}

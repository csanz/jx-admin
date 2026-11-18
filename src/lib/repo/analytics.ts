/**
 * ANALYTICS for the overview: daily usage series and a per-game table for a range of 7, 30 or 90 UTC days.
 *
 * The database buckets by UTC day (`$dateToString` on `$toDate` of the stored field, so a Date or an ISO string both
 * work); the code fills the missing days with zeros (`zeroFill`) and merges the per-game rows. Every series is a list of
 * { day: "YYYY-MM-DD", ...values } with one entry per day of the range, oldest first.
 *
 * Sources: game_sessions (players, sessions seated / watching, play time; bot sessions left out), matches (rounds),
 * daily_stats (peak concurrent; the fallback for players, sessions, play time and rounds when the raw collections are
 * empty for the range), users (new accounts, bots left out), credit_transactions (JBux spent by pot, kind spend),
 * jbox_receipts (purchases), client_reports (reports and reports with errors).
 *
 * TO ADD A SERIES: add its key to SERIES_KEYS and a pipeline (or a field in an existing one) in getAnalytics that
 * returns { _id: day, <field>: n } rows; zeroFill it into the result, then add a panel in the overview page
 * (src/app/(console)/page.tsx) with its title, lines and total. No framework imports.
 */
import type { Db, Document } from "mongodb";
import { idString, numberOr0, stringOr } from "./values.ts";

export const RANGE_DAYS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
const DAY = 86_400_000;

/** ?range= -> 7, 30 or 90 (default 30). */
export function parseRangeDays(v: unknown): RangeDays {
  const n = typeof v === "string" ? Number(v) : v;
  return (RANGE_DAYS as readonly number[]).includes(n as number) ? (n as RangeDays) : 30;
}

/** The start of the range: UTC midnight `days - 1` days before today (the range includes today). */
export function rangeStart(now: Date, days: number): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY);
}

/** Every UTC day of the range, oldest first, as "YYYY-MM-DD". */
export function dayKeys(now: Date, days: number): string[] {
  const start = rangeStart(now, days).getTime();
  return Array.from({ length: days }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
}

/** A stored date (Date or ISO string) as its UTC day, or null. The same rule the pipelines apply. */
export function dayOf(v: unknown): string | null {
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export type Point = { day: string } & Record<string, number | string>;

/** Pure: one point per day of `keys`, the fields from `rows` (matched on `_id` or `day`), 0 where a day has none. */
export function zeroFill(keys: string[], rows: Document[], fields: string[]): Point[] {
  const byDay = new Map<string, Document>();
  for (const r of rows) {
    const day = typeof r._id === "string" ? r._id : typeof r.day === "string" ? r.day : null;
    if (day) byDay.set(day, r);
  }
  return keys.map((day) => {
    const r = byDay.get(day);
    const p: Point = { day };
    for (const f of fields) p[f] = r ? numberOr0(r[f]) : 0;
    return p;
  });
}

/** Pure: the sum of a field over a series. */
export function seriesSum(points: Point[], field: string): number {
  return points.reduce((n, p) => n + numberOr0(p[field]), 0);
}

/** Pure: the max of a field over a series. */
export function seriesMax(points: Point[], field: string): number {
  return points.reduce((n, p) => Math.max(n, numberOr0(p[field])), 0);
}

/** Pure: true when every value of the fields is 0 (the raw source is empty: use the daily_stats fallback). */
export function isEmptySeries(points: Point[], fields: string[]): boolean {
  return points.every((p) => fields.every((f) => numberOr0(p[f]) === 0));
}

// ── PIPELINE PIECES ────────────────────────────────────────────────────────────────────────────────────────────

/** The stages that put a UTC day on each row from `field` and keep the range. */
export function dayStages(field: string, from: Date, preMatch: Document = {}): Document[] {
  return [
    ...(Object.keys(preMatch).length ? [{ $match: preMatch }] : []),
    { $addFields: { _at: { $toDate: `$${field}` } } },
    { $match: { _at: { $gte: from } } },
    { $addFields: { _day: { $dateToString: { format: "%Y-%m-%d", date: "$_at", timezone: "UTC" } } } },
  ];
}

const potShare = (pot: string): Document => ({
  $cond: [{ $ifNull: ["$split", false] }, { $ifNull: [`$split.${pot}`, 0] }, { $cond: [{ $eq: ["$funding", pot] }, "$amount", 0] }],
});

const HUMAN_SESSION: Document = { role: { $ne: "bot" } };

// ── PER GAME ───────────────────────────────────────────────────────────────────────────────────────────────────

export type GameStatRow = { game: string; name: string; players: number; sessions: number; playHours: number; rounds: number; peak: number; purchases: number };

/**
 * Pure: the per-game table from the per-source rows (each keyed by the game's slug in `_id`). Games with no activity
 * in any source are left out; sorted by players, then sessions.
 */
export function mergeGameRows(input: { sessions: Document[]; rounds: Document[]; peaks: Document[]; purchases: Document[]; names: Map<string, string> }): GameStatRow[] {
  const by = new Map<string, GameStatRow>();
  const row = (game: string) => {
    let r = by.get(game);
    if (!r) {
      r = { game, name: input.names.get(game) || game, players: 0, sessions: 0, playHours: 0, rounds: 0, peak: 0, purchases: 0 };
      by.set(game, r);
    }
    return r;
  };
  for (const s of input.sessions) if (typeof s._id === "string" && s._id) Object.assign(row(s._id), { players: numberOr0(s.players), sessions: numberOr0(s.sessions), playHours: numberOr0(s.playS) / 3600 });
  for (const s of input.rounds) if (typeof s._id === "string" && s._id) row(s._id).rounds += numberOr0(s.rounds);
  for (const s of input.peaks) if (typeof s._id === "string" && s._id) row(s._id).peak = Math.max(row(s._id).peak, numberOr0(s.peak));
  for (const s of input.purchases) if (typeof s._id === "string" && s._id) row(s._id).purchases += numberOr0(s.purchases);
  return [...by.values()]
    .filter((r) => r.players || r.sessions || r.rounds || r.peak || r.purchases)
    .sort((a, b) => b.players - a.players || b.sessions - a.sessions || a.game.localeCompare(b.game));
}

/** Pure: matches carry game_slug, or only the game's ObjectId hex in game_id: resolve both to the slug. */
export function matchGameKey(row: { slug?: unknown; id?: unknown }, slugById: Map<string, string>): string {
  const slug = stringOr(row.slug);
  if (slug) return slug;
  const id = stringOr(row.id);
  return slugById.get(id) ?? id;
}

// ── THE OVERVIEW ───────────────────────────────────────────────────────────────────────────────────────────────

export type Analytics = {
  days: RangeDays;
  from: string;
  to: string;
  players: { points: Point[]; total: number; fallback: boolean };
  sessions: { points: Point[]; total: number; fallback: boolean };
  playHours: { points: Point[]; total: number; fallback: boolean };
  rounds: { points: Point[]; total: number; fallback: boolean };
  peak: { points: Point[]; max: number };
  accounts: { points: Point[]; total: number };
  jbux: { points: Point[]; total: { real: number; test: number; promo: number; purchases: number } };
  errors: { points: Point[]; total: { withErrors: number; reports: number } };
  games: GameStatRow[];
};

export async function getAnalytics(db: Db, input: { range?: unknown; now?: Date } = {}): Promise<Analytics> {
  const now = input.now ?? new Date();
  const days = parseRangeDays(input.range);
  const from = rangeStart(now, days);
  const keys = dayKeys(now, days);
  const gameKey: Document = { $ifNull: ["$game_slug", "$game_id"] };

  const [sessDaily, playersRange, matchDaily, statsDaily, accounts, spend, receipts, reports, sessGames, matchGames, statGames, receiptGames, games] = await Promise.all([
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      {
        $group: {
          _id: "$_day",
          playerSet: { $addToSet: "$player_id" },
          sessions: { $sum: 1 },
          seated: { $sum: { $cond: [{ $eq: ["$seated", true] }, 1, 0] } },
          watching: { $sum: { $cond: [{ $eq: ["$seated", true] }, 0, 1] } },
          playS: { $sum: { $ifNull: ["$duration_s", 0] } },
        },
      },
      { $project: { players: { $size: "$playerSet" }, sessions: 1, seated: 1, watching: 1, playH: { $divide: ["$playS", 3600] } } },
    ]).toArray(),
    db.collection("game_sessions").aggregate([...dayStages("joined_at", from, HUMAN_SESSION), { $group: { _id: "$player_id" } }, { $count: "n" }]).toArray(),
    db.collection("matches").aggregate([...dayStages("at", from), { $group: { _id: "$_day", rounds: { $sum: 1 } } }]).toArray(),
    db.collection("daily_stats").aggregate([
      { $match: { date: { $gte: keys[0] } } },
      {
        $group: {
          _id: "$date",
          players: { $sum: { $ifNull: ["$players", 0] } },
          sessions: { $sum: { $ifNull: ["$sessions", 0] } },
          seated: { $sum: { $ifNull: ["$seated_sessions", 0] } },
          watching: { $sum: { $ifNull: ["$watcher_sessions", 0] } },
          playS: { $sum: { $ifNull: ["$total_play_s", 0] } },
          rounds: { $sum: { $ifNull: ["$rounds", 0] } },
          peak: { $max: { $ifNull: ["$peak_concurrent", 0] } },
        },
      },
      { $addFields: { playH: { $divide: ["$playS", 3600] } } },
    ]).toArray(),
    db.collection("users").aggregate([...dayStages("createdAt", from, { role: { $ne: "bot" } }), { $group: { _id: "$_day", accounts: { $sum: 1 } } }]).toArray(),
    db.collection("credit_transactions").aggregate([
      ...dayStages("at", from, { kind: "spend" }),
      { $group: { _id: "$_day", real: { $sum: potShare("real") }, test: { $sum: potShare("test") }, promo: { $sum: potShare("promo") } } },
    ]).toArray(),
    db.collection("jbox_receipts").aggregate([...dayStages("createdAt", from), { $group: { _id: "$_day", purchases: { $sum: 1 } } }]).toArray(),
    db.collection("client_reports").aggregate([
      ...dayStages("received_at", from),
      {
        $group: {
          _id: "$_day",
          reports: { $sum: 1 },
          withErrors: {
            $sum: {
              $cond: [
                { $gt: [{ $cond: [{ $isArray: "$errors" }, { $size: "$errors" }, { $ifNull: [{ $convert: { input: "$errors", to: "double", onError: 0, onNull: 0 } }, 0] }] }, 0] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).toArray(),
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      { $group: { _id: gameKey, playerSet: { $addToSet: "$player_id" }, sessions: { $sum: 1 }, playS: { $sum: { $ifNull: ["$duration_s", 0] } } } },
      { $project: { players: { $size: "$playerSet" }, sessions: 1, playS: 1 } },
    ]).toArray(),
    db.collection("matches").aggregate([...dayStages("at", from), { $group: { _id: { slug: "$game_slug", id: "$game_id" }, rounds: { $sum: 1 } } }]).toArray(),
    db.collection("daily_stats").aggregate([{ $match: { date: { $gte: keys[0] } } }, { $group: { _id: gameKey, peak: { $max: { $ifNull: ["$peak_concurrent", 0] } }, rounds: { $sum: { $ifNull: ["$rounds", 0] } } } }]).toArray(),
    db.collection("jbox_receipts").aggregate([...dayStages("createdAt", from), { $group: { _id: "$gameId", purchases: { $sum: 1 } } }]).toArray(),
    db.collection("games").find({}, { projection: { slug: 1, name: 1 } }).toArray(),
  ]);

  const stats = statsDaily;
  const pick = (raw: Document[], fields: string[]) => {
    const points = zeroFill(keys, raw, fields);
    if (!isEmptySeries(points, fields)) return { points, fallback: false };
    const fb = zeroFill(keys, stats, fields);
    return isEmptySeries(fb, fields) ? { points, fallback: false } : { points: fb, fallback: true };
  };
  const players = pick(sessDaily, ["players"]);
  const sessions = pick(sessDaily, ["seated", "watching"]);
  const playHours = pick(sessDaily, ["playH"]);
  const rounds = pick(matchDaily, ["rounds"]);
  const peak = zeroFill(keys, stats, ["peak"]);
  const accountPts = zeroFill(keys, accounts, ["accounts"]);
  const spendPts = zeroFill(keys, spend, ["real", "test", "promo"]);
  const purchasePts = zeroFill(keys, receipts, ["purchases"]);
  const jbuxPts = spendPts.map((p, i) => ({ ...p, purchases: purchasePts[i].purchases }));
  const errorPts = zeroFill(keys, reports, ["withErrors", "reports"]);

  const slugById = new Map(games.map((g) => [idString(g._id) ?? "", stringOr(g.slug)]));
  const names = new Map(games.map((g) => [stringOr(g.slug), stringOr(g.name)]));
  // every source names a game by its slug, or (older rows) by the game's ObjectId hex: resolve both to the slug
  const bySlug = (rows: Document[]) => rows.map((r) => ({ ...r, _id: slugById.get(stringOr(r._id)) ?? r._id }));
  const matchRounds = matchGames.map((m) => ({ _id: matchGameKey(m._id ?? {}, slugById), rounds: m.rounds }));
  const gameRows = mergeGameRows({
    sessions: bySlug(sessGames),
    rounds: matchRounds.length ? matchRounds : bySlug(statGames),
    peaks: bySlug(statGames),
    purchases: bySlug(receiptGames),
    names,
  });

  return {
    days,
    from: keys[0],
    to: keys[keys.length - 1],
    players: { ...players, total: players.fallback ? seriesSum(players.points, "players") : numberOr0(playersRange[0]?.n) },
    sessions: { ...sessions, total: seriesSum(sessions.points, "seated") + seriesSum(sessions.points, "watching") },
    playHours: { ...playHours, total: seriesSum(playHours.points, "playH") },
    rounds: { ...rounds, total: seriesSum(rounds.points, "rounds") },
    peak: { points: peak, max: seriesMax(peak, "peak") },
    accounts: { points: accountPts, total: seriesSum(accountPts, "accounts") },
    jbux: { points: jbuxPts, total: { real: seriesSum(jbuxPts, "real"), test: seriesSum(jbuxPts, "test"), promo: seriesSum(jbuxPts, "promo"), purchases: seriesSum(jbuxPts, "purchases") } },
    errors: { points: errorPts, total: { withErrors: seriesSum(errorPts, "withErrors"), reports: seriesSum(errorPts, "reports") } },
    games: gameRows,
  };
}

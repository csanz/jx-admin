/**
 * ONE USER'S ACTIVITY OVER TIME (owner 2026-11-18: "a graph here too of activity, like 1 week, 1 month, 1 year ...
 * line graph"): plays per UTC day from play_history (the portal upserts one row per game per five minutes of play,
 * so a row is one sitting), one point per day of the range, 0 where there was none, oldest first. The range is
 * 7, 30 or 365 days including today (?activity=). The rows are fetched (played_at only, the portal stores a Date,
 * the same `$gte` it queries with) and bucketed in code with the overview's day helpers, so the fake db covers it.
 * No framework imports.
 */
import type { Db, Document, Filter } from "mongodb";
import { dayKeys, dayOf, parseActivityRange, seriesMax, seriesSum, type ActivityRange, type Point } from "./analytics.ts";
import { OBJECT_ID_RE } from "./users.ts";
import { idForms } from "./user-detail.ts";

export { ACTIVITY_DEFAULT, ACTIVITY_RANGES, ACTIVITY_RANGE_LABEL, parseActivityRange, type ActivityRange } from "./analytics.ts";

export type UserActivity = {
  days: ActivityRange;
  /** One point per day: { day: "YYYY-MM-DD", plays }. */
  points: Point[];
  /** Plays in the range. */
  total: number;
  /** The busiest day's plays (0 when none). */
  peak: number;
  /** Days with at least one play. */
  activeDays: number;
};

/** Pure: the series for `keys` from play rows (anything with a played_at), rows outside the keys ignored. */
export function activitySeries(keys: string[], plays: Document[]): Point[] {
  const count = new Map<string, number>();
  for (const p of plays) {
    const day = dayOf(p.played_at);
    if (day) count.set(day, (count.get(day) ?? 0) + 1);
  }
  return keys.map((day) => ({ day, plays: count.get(day) ?? 0 }));
}

export function summarize(days: ActivityRange, points: Point[]): UserActivity {
  return {
    days,
    points,
    total: seriesSum(points, "plays"),
    peak: seriesMax(points, "plays"),
    activeDays: points.filter((p) => Number(p.plays) > 0).length,
  };
}

/** The user's plays per day for the range. An unknown id gives an all-zero series (the page already 404s on it). */
export async function getUserActivity(db: Db, id: string, opts: { range?: unknown; now?: Date } = {}): Promise<UserActivity> {
  const days = parseActivityRange(opts.range);
  const now = opts.now ?? new Date();
  const keys = dayKeys(now, days);
  if (!OBJECT_ID_RE.test(id)) return summarize(days, activitySeries(keys, []));
  const hex = id.toLowerCase();
  const from = new Date(`${keys[0]}T00:00:00.000Z`);
  const filter: Filter<Document> = { user_id: { $in: idForms(hex) }, played_at: { $gte: from } };
  const rows = await db.collection("play_history").find(filter, { projection: { played_at: 1 } }).toArray();
  return summarize(days, activitySeries(keys, rows));
}

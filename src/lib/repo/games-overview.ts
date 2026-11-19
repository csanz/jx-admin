/**
 * THE GAMES OVERVIEW (owner 2026-11-18: "an overview link under games menu so you can see activity graphs with
 * activity for top games, top 10 games, most active games, and just overall activity of people playing"), for a
 * range of 1 week / 1 month / 1 year (?activity=, the activity pages' ranges):
 *   overall   players (distinct ids) and sessions (seated / watching) per UTC day across every game
 *   games     every game with activity in the range, busiest first (the overview's per-game rows: players, sessions,
 *             play hours, rounds, peak)
 *   top       the first TOP_GAMES of those, each with its own players-per-day series
 * Source: game_sessions, bot sessions left out (HUMAN_SESSION); rounds and peaks from matches / daily_stats like the
 * overview. The aggregations run in the database; the ranking and the per-game zero fill are pure (tested).
 * No framework imports.
 */
import type { Db, Document } from "mongodb";
import {
  HUMAN_SESSION, dayKeys, dayStages, matchGameKey, mergeGameRows, parseActivityRange, rangeStart, seriesSum, zeroFill,
  type ActivityRange, type GameStatRow, type Point,
} from "./analytics.ts";
import { idString, numberOr0, stringOr } from "./values.ts";

export const TOP_GAMES = 10;

export type TopGame = GameStatRow & { points: Point[] };

export type GamesOverview = {
  days: ActivityRange;
  from: string;
  to: string;
  players: { points: Point[]; total: number };
  sessions: { points: Point[]; total: number };
  playHours: { points: Point[]; total: number };
  games: GameStatRow[];
  top: TopGame[];
};

/** Pure: the first `n` rows (mergeGameRows already sorts busiest first). */
export function topGames(rows: GameStatRow[], n = TOP_GAMES): GameStatRow[] {
  return rows.slice(0, n);
}

/**
 * Pure: one players-per-day series per game from rows grouped by { day, game } (`_id: { day, game }`, `players`),
 * zero-filled over `keys`. `resolve` maps a stored game key (slug or ObjectId hex) to the slug.
 */
export function perGameSeries(keys: string[], rows: Document[], resolve: (key: string) => string = (k) => k): Map<string, Point[]> {
  const byGame = new Map<string, Document[]>();
  for (const r of rows) {
    const id = r._id && typeof r._id === "object" ? (r._id as Record<string, unknown>) : {};
    const day = typeof id.day === "string" ? id.day : null;
    const game = resolve(stringOr(id.game));
    if (!day || !game) continue;
    const list = byGame.get(game) ?? [];
    list.push({ day, players: numberOr0(r.players), sessions: numberOr0(r.sessions) });
    byGame.set(game, list);
  }
  const out = new Map<string, Point[]>();
  for (const [game, list] of byGame) out.set(game, zeroFill(keys, list, ["players", "sessions"]));
  return out;
}

export async function getGamesOverview(db: Db, input: { range?: unknown; now?: Date } = {}): Promise<GamesOverview> {
  const now = input.now ?? new Date();
  const days = parseActivityRange(input.range);
  const from = rangeStart(now, days);
  const keys = dayKeys(now, days);
  const gameKey: Document = { $ifNull: ["$game_slug", "$game_id"] };

  const [daily, playersRange, perGameDaily, sessGames, matchGames, statGames, games] = await Promise.all([
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      {
        $group: {
          _id: "$_day",
          playerSet: { $addToSet: "$player_id" },
          seated: { $sum: { $cond: [{ $eq: ["$seated", true] }, 1, 0] } },
          watching: { $sum: { $cond: [{ $eq: ["$seated", true] }, 0, 1] } },
          playS: { $sum: { $ifNull: ["$duration_s", 0] } },
        },
      },
      { $project: { players: { $size: "$playerSet" }, seated: 1, watching: 1, playH: { $divide: ["$playS", 3600] } } },
    ]).toArray(),
    db.collection("game_sessions").aggregate([...dayStages("joined_at", from, HUMAN_SESSION), { $group: { _id: "$player_id" } }, { $count: "n" }]).toArray(),
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      { $group: { _id: { day: "$_day", game: gameKey }, playerSet: { $addToSet: "$player_id" }, sessions: { $sum: 1 } } },
      { $project: { players: { $size: "$playerSet" }, sessions: 1 } },
    ]).toArray(),
    db.collection("game_sessions").aggregate([
      ...dayStages("joined_at", from, HUMAN_SESSION),
      { $group: { _id: gameKey, playerSet: { $addToSet: "$player_id" }, sessions: { $sum: 1 }, playS: { $sum: { $ifNull: ["$duration_s", 0] } } } },
      { $project: { players: { $size: "$playerSet" }, sessions: 1, playS: 1 } },
    ]).toArray(),
    db.collection("matches").aggregate([...dayStages("at", from), { $group: { _id: { slug: "$game_slug", id: "$game_id" }, rounds: { $sum: 1 } } }]).toArray(),
    db.collection("daily_stats").aggregate([{ $match: { date: { $gte: keys[0] } } }, { $group: { _id: gameKey, peak: { $max: { $ifNull: ["$peak_concurrent", 0] } }, rounds: { $sum: { $ifNull: ["$rounds", 0] } } } }]).toArray(),
    db.collection("games").find({}, { projection: { slug: 1, name: 1 } }).toArray(),
  ]);

  const slugById = new Map(games.map((g) => [idString(g._id) ?? "", stringOr(g.slug)]));
  const names = new Map(games.map((g) => [stringOr(g.slug), stringOr(g.name)]));
  const resolve = (key: string) => slugById.get(key) ?? key;
  const bySlug = (rows: Document[]) => rows.map((r) => ({ ...r, _id: resolve(stringOr(r._id)) }));
  const matchRounds = matchGames.map((m) => ({ _id: matchGameKey(m._id ?? {}, slugById), rounds: m.rounds }));
  const rows = mergeGameRows({
    sessions: bySlug(sessGames),
    rounds: matchRounds.length ? matchRounds : bySlug(statGames),
    peaks: bySlug(statGames),
    purchases: [],
    names,
  });

  const players = zeroFill(keys, daily, ["players"]);
  const sessions = zeroFill(keys, daily, ["seated", "watching"]);
  const playHours = zeroFill(keys, daily, ["playH"]);
  const series = perGameSeries(keys, perGameDaily, resolve);
  const top: TopGame[] = topGames(rows).map((g) => ({ ...g, points: series.get(g.game) ?? zeroFill(keys, [], ["players", "sessions"]) }));

  return {
    days,
    from: keys[0],
    to: keys[keys.length - 1],
    // players per day summed over days would count a person once per day: the total is the distinct ids in the range
    players: { points: players, total: numberOr0(playersRange[0]?.n) },
    sessions: { points: sessions, total: seriesSum(sessions, "seated") + seriesSum(sessions, "watching") },
    playHours: { points: playHours, total: seriesSum(playHours, "playH") },
    games: rows,
    top,
  };
}

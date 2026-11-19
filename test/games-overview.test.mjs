/**
 * Games > Overview (owner 2026-11-18: "activity graphs with activity for top games, top 10 games, most active games,
 * and just overall activity of people playing"): the pure ranking and per-game series, and the page wired with the
 * range switch, the two overall charts, the ranked table and the top-10 lines.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TOP_GAMES, perGameSeries, topGames } from "../src/lib/repo/games-overview.ts";
import { mergeGameRows } from "../src/lib/repo/analytics.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("topGames: the first ten of the busiest-first rows", () => {
  assert.equal(TOP_GAMES, 10);
  const rows = mergeGameRows({
    sessions: Array.from({ length: 12 }, (_, i) => ({ _id: `g${i}`, players: 12 - i, sessions: 1, playS: 0 })),
    rounds: [], peaks: [], purchases: [], names: new Map(),
  });
  const top = topGames(rows);
  assert.equal(top.length, 10);
  assert.deepEqual(top.map((r) => r.game), ["g0", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9"]);
  assert.equal(topGames(rows, 2).length, 2);
  assert.deepEqual(topGames([]), []);
});

test("perGameSeries: one zero-filled series per game from { day, game } rows, game ids resolved to slugs, junk dropped", () => {
  const keys = ["2026-11-16", "2026-11-17", "2026-11-18"];
  const s = perGameSeries(keys, [
    { _id: { day: "2026-11-18", game: "one-shot-arena" }, players: 4, sessions: 9 },
    { _id: { day: "2026-11-16", game: "one-shot-arena" }, players: 1, sessions: 1 },
    { _id: { day: "2026-11-17", game: "6ae02121890be921ce8b6e19" }, players: 2, sessions: 3 }, // older rows: the game's id
    { _id: { day: "2026-11-01", game: "one-shot-arena" }, players: 7, sessions: 7 }, // outside the keys
    { _id: { day: "2026-11-17" }, players: 5 }, // no game
    { _id: "2026-11-17", players: 5 }, // wrong shape
    { players: 5 },
  ], (k) => (k === "6ae02121890be921ce8b6e19" ? "last-minute" : k));
  assert.deepEqual([...s.keys()].sort(), ["last-minute", "one-shot-arena"]);
  assert.deepEqual(s.get("one-shot-arena"), [
    { day: "2026-11-16", players: 1, sessions: 1 },
    { day: "2026-11-17", players: 0, sessions: 0 },
    { day: "2026-11-18", players: 4, sessions: 9 },
  ]);
  assert.deepEqual(s.get("last-minute").map((p) => p.players), [0, 2, 0]);
  assert.deepEqual(perGameSeries(keys, []), new Map());
});

test("the page: range switch, the two overall charts, the ranked table, one line per top game; the nav has Games > Overview", () => {
  const page = read("src/app/(console)/games/overview/page.tsx");
  assert.match(page, /getGamesOverview\(await mongoDb\(\), \{ range: one\(sp\.activity\) \}\)/);
  assert.match(page, /<RangeSwitch days=\{days\} hrefFor=\{hrefFor\} \/>/);
  assert.match(page, /<LineChartPanel title="Players per day"[^\n]*note="distinct player ids, every game" curve="linear"/);
  assert.match(page, /<LineChartPanel title="Sessions per day"[^\n]*series=\{\[\{ key: "seated", label: "seated" \}, \{ key: "watching", label: "watching" \}\]\}/);
  assert.match(page, /Most active games/);
  assert.match(page, /data-testid=\{`game-rank-\$\{g\.game\}`\}/);
  assert.match(page, /\{a\.top\.map\(\(g, i\) => \(/);
  assert.match(page, /title=\{`\$\{i \+ 1\}\. \$\{g\.name\}`\}/);
  assert.match(page, /curve="linear"/);
  assert.doesNotMatch(page, /\u2014/, "no em dashes");
  const repo = read("src/lib/repo/games-overview.ts");
  assert.match(repo, /dayStages\("joined_at", from, HUMAN_SESSION\)/, "bots left out");
  assert.match(repo, /\{ \$group: \{ _id: "\$player_id" \} \}, \{ \$count: "n" \}/, "distinct players in the range");
  assert.match(repo, /_id: \{ day: "\$_day", game: gameKey \}/);
  assert.doesNotMatch(repo, /\u2014/);
});

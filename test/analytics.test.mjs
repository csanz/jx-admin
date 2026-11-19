import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dayKeys, dayOf, dayStages, isEmptySeries, matchGameKey, mergeGameRows, parseRangeDays, rangeStart, seriesMax, seriesSum, zeroFill } from "../src/lib/repo/analytics.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const NOW = new Date("2026-11-17T23:59:00Z");

test("range: 7 / 30 / 365 days (30 by default; the overviews' 1 week / 1 month / 1 year), UTC days including today, oldest first", () => {
  assert.equal(parseRangeDays("7"), 7);
  assert.equal(parseRangeDays("365"), 365);
  for (const bad of ["", "31", "90", "x", null, 8]) assert.equal(parseRangeDays(bad), 30);
  assert.equal(rangeStart(NOW, 7).toISOString(), "2026-11-11T00:00:00.000Z");
  const k = dayKeys(NOW, 7);
  assert.deepEqual(k, ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
  assert.equal(dayKeys(NOW, 365).length, 365);
  assert.equal(dayKeys(new Date("2026-03-30T01:00:00Z"), 3)[0], "2026-03-28", "no DST drift in UTC");
});

test("day bucketing: a Date and an ISO string land on the same UTC day", () => {
  assert.equal(dayOf(new Date("2026-11-17T23:30:00-08:00")), "2026-11-18");
  assert.equal(dayOf("2026-11-17T23:30:00Z"), "2026-11-17");
  assert.equal(dayOf("garbage"), null);
  assert.equal(dayOf(42), null);
  // the pipelines do the same: $toDate on the stored field, then $dateToString in UTC
  const stages = dayStages("joined_at", new Date("2026-11-11T00:00:00Z"), { role: { $ne: "bot" } });
  assert.deepEqual(stages[0], { $match: { role: { $ne: "bot" } } });
  assert.deepEqual(stages[1], { $addFields: { _at: { $toDate: "$joined_at" } } });
  assert.deepEqual(stages[3].$addFields._day.$dateToString, { format: "%Y-%m-%d", date: "$_at", timezone: "UTC" });
  assert.equal(dayStages("at", new Date())[0].$addFields !== undefined, true, "no empty $match stage");
});

test("zero fill: one point per day, missing days are 0, rows outside the range ignored", () => {
  const keys = dayKeys(NOW, 4);
  const pts = zeroFill(keys, [{ _id: "2026-11-15", players: 3, junk: 9 }, { _id: "2026-11-17", players: 1 }, { _id: "2026-10-01", players: 99 }, { day: "2026-11-16", players: 2 }], ["players", "seated"]);
  assert.deepEqual(pts, [
    { day: "2026-11-14", players: 0, seated: 0 },
    { day: "2026-11-15", players: 3, seated: 0 },
    { day: "2026-11-16", players: 2, seated: 0 },
    { day: "2026-11-17", players: 1, seated: 0 },
  ]);
  assert.equal(seriesSum(pts, "players"), 6);
  assert.equal(seriesMax(pts, "players"), 3);
  assert.equal(isEmptySeries(pts, ["players"]), false);
  assert.equal(isEmptySeries(zeroFill(keys, [], ["players"]), ["players"]), true);
});

test("per-game table: sources merged by slug, matches by slug or game id, empty games left out, busiest first", () => {
  const slugById = new Map([["6ae02121890be921ce8b6e19", "last-minute"]]);
  assert.equal(matchGameKey({ slug: "wyrmlight", id: "x" }, slugById), "wyrmlight");
  assert.equal(matchGameKey({ slug: null, id: "6ae02121890be921ce8b6e19" }, slugById), "last-minute");
  assert.equal(matchGameKey({ id: "unknown" }, slugById), "unknown");
  const rows = mergeGameRows({
    sessions: [{ _id: "wyrmlight", players: 5, sessions: 9, playS: 7200 }, { _id: "last-minute", players: 7, sessions: 8, playS: 3600 }],
    rounds: [{ _id: "last-minute", rounds: 2 }, { _id: "last-minute", rounds: 1 }],
    peaks: [{ _id: "wyrmlight", peak: 3 }, { _id: "wyrmlight", peak: 4 }, { _id: "ghost", peak: 0 }],
    purchases: [{ _id: "wyrmlight", purchases: 2 }, { _id: null, purchases: 1 }],
    names: new Map([["wyrmlight", "Wyrmlight"]]),
  });
  assert.deepEqual(rows, [
    { game: "last-minute", name: "last-minute", players: 7, sessions: 8, playHours: 1, rounds: 3, peak: 0, purchases: 0 },
    { game: "wyrmlight", name: "Wyrmlight", players: 5, sessions: 9, playHours: 2, rounds: 0, peak: 4, purchases: 2 },
  ]);
});

test("the chart components import only react and recharts, and draw with the theme tokens", () => {
  const dir = path.join(ROOT, "src/components/charts");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.match(src, /^"use client";/);
    for (const m of src.matchAll(/^import .* from "([^"]+)";$/gm)) assert.ok(["react", "recharts"].includes(m[1]), `${f} imports ${m[1]}`);
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i, `${f} hard-codes a colour; use the token classes`);
  }
  const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  assert.match(css, /\.jx-chart \.jx-line-1 \.recharts-line-curve \{ stroke: var\(--color-admin\); \}/);
  assert.match(css, /\.jx-chart \.recharts-cartesian-grid line \{ stroke: var\(--color-border-subtle\); \}/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(pkg.dependencies.recharts, /^\d+\.\d+\.\d+$/, "recharts pinned to an exact version");
});

test("the y axis is as wide as its widest label (a fixed width clipped 1,000 to ,000)", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/charts/LineChartPanel.tsx"), "utf8");
  assert.match(src, /export function yAxisWidth\(points: ChartPoint\[\], series: ChartSeries\[\], decimals: number\): number/);
  assert.match(src, /return Math\.max\(32, 10 \+ fmt\(max, decimals\)\.length \* 7\);/);
  assert.match(src, /<YAxis [^\n]*width=\{axisWidth\}/);
  assert.doesNotMatch(src, /width=\{\d+\}/, "no fixed axis width");
});

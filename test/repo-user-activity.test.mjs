/**
 * A user's activity line (owner 2026-11-18: "a graph here too of activity, like 1 week, 1 month, 1 year ... line
 * graph"): plays per UTC day from play_history, zero-filled over the range, and the page wired with the range switch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import { ACTIVITY_RANGES, ACTIVITY_RANGE_LABEL, activitySeries, getUserActivity, parseActivityRange } from "../src/lib/repo/user-activity.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const UID = new ObjectId("6ae204d8c05a94f95f234732");
const HEX = UID.toHexString();
const OTHER = new ObjectId("6ae204d8c05a94f95f234733");
const NOW = new Date("2026-11-18T23:00:00Z");

test("range: 1 week / 1 month / 1 year (30 by default)", () => {
  assert.deepEqual([...ACTIVITY_RANGES], [7, 30, 365]);
  assert.deepEqual(ACTIVITY_RANGE_LABEL, { 7: "1 week", 30: "1 month", 365: "1 year" });
  assert.equal(parseActivityRange("7"), 7);
  assert.equal(parseActivityRange("365"), 365);
  for (const bad of ["", "90", "x", null, undefined, 8]) assert.equal(parseActivityRange(bad), 30);
});

test("activitySeries: one point per day, plays counted on their UTC day, Date or ISO string, junk and out-of-range rows ignored", () => {
  const keys = ["2026-11-16", "2026-11-17", "2026-11-18"];
  const pts = activitySeries(keys, [
    { played_at: new Date("2026-11-17T23:30:00-08:00") }, // = Nov 18 UTC
    { played_at: "2026-11-18T02:02:00Z" },
    { played_at: new Date("2026-11-16T20:09:00Z") },
    { played_at: new Date("2026-11-01T00:00:00Z") }, // before the range
    { played_at: "garbage" },
    {},
  ]);
  assert.deepEqual(pts, [
    { day: "2026-11-16", plays: 1 },
    { day: "2026-11-17", plays: 0 },
    { day: "2026-11-18", plays: 2 },
  ]);
});

test("getUserActivity: this user's rows since the range start, both id forms, totals; a bad id gives zeros", async () => {
  const at = (iso) => new Date(iso);
  const db = fakeDb({
    play_history: [
      { _id: new ObjectId(), user_id: UID, played_at: at("2026-11-18T19:35:00Z") },
      { _id: new ObjectId(), user_id: HEX, played_at: at("2026-11-18T02:02:00Z") }, // the hex form counts too
      { _id: new ObjectId(), user_id: UID, played_at: at("2026-11-13T05:00:00Z") },
      { _id: new ObjectId(), user_id: UID, played_at: at("2026-11-11T12:00:00Z") }, // outside 1 week (starts Nov 12)
      { _id: new ObjectId(), user_id: OTHER, played_at: at("2026-11-18T12:00:00Z") }, // somebody else
    ],
  });
  const week = await getUserActivity(db, HEX, { range: "7", now: NOW });
  assert.equal(week.days, 7);
  assert.deepEqual(week.points.map((p) => p.day), ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]);
  assert.deepEqual(week.points.map((p) => p.plays), [0, 1, 0, 0, 0, 0, 2]);
  assert.equal(week.total, 3);
  assert.equal(week.peak, 2);
  assert.equal(week.activeDays, 2);
  const q = db.queries.find((x) => x.collection === "play_history");
  assert.deepEqual(q.filter.user_id, { $in: [HEX, UID] });
  assert.deepEqual(q.filter.played_at, { $gte: new Date("2026-11-12T00:00:00.000Z") });
  assert.deepEqual(q.options.projection, { played_at: 1 }, "only the date is fetched");

  const month = await getUserActivity(db, HEX, { range: undefined, now: NOW });
  assert.equal(month.days, 30);
  assert.equal(month.points.length, 30);
  assert.equal(month.total, 4);

  const year = await getUserActivity(db, HEX, { range: "365", now: NOW });
  assert.equal(year.points.length, 365);
  assert.equal(year.points[0].day, "2025-11-19");

  const none = await getUserActivity(db, "nope", { range: "7", now: NOW });
  assert.equal(none.total, 0);
  assert.equal(none.points.length, 7);
});

test("the user page draws the activity line above the play history with the three ranges", () => {
  const page = read("src/app/(console)/users/[id]/page.tsx");
  assert.match(page, /getUserActivity\(db, detail\.user\.id, \{ range: activity \}\)/);
  assert.match(page, /<Section\s+title="Activity"/);
  assert.match(page, /<RangeSwitch days=\{act\.days\} hrefFor=\{\(n\) => href\(\{ activity: n \}\)\}/);
  const sw = read("src/components/RangeSwitch.tsx");
  assert.match(sw, /ACTIVITY_RANGES\.map\(\(n\) =>/);
  assert.match(sw, /\{ACTIVITY_RANGE_LABEL\[n\]\}/);
  assert.match(page, /<LineChartPanel title="Plays per day"[^\n]*series=\{\[\{ key: "plays", label: "plays" \}\]\}/);
  assert.match(page, /curve="linear"/, "straight segments: a smooth curve would invent plays between days");
  assert.ok(page.indexOf('title="Activity"') < page.indexOf('title="Play history"'), "activity first");
  assert.doesNotMatch(page, /\u2014/, "no em dashes");
});

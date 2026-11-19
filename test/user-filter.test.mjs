/**
 * The Users list's filters (owner 2026-11-19: "who played this week ... date ranges ... the last 5 days, the last
 * 30 days"): the shared URL parsing, its inverse, the windows' bounds and the words on the count line; and the repo's
 * Mongo conditions built from them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  EMPTY_USER_FILTER, isEmptyUserFilter, parseDay, parseUserFilter, parseWindow, userFilterParams, userFilterSummary, windowBounds, windowPhrase,
} from "../src/lib/user-filter.ts";
import { buildUserFilter, userFilterConditions, userIdHex, windowRange } from "../src/lib/repo/users.ts";

const NOW = new Date("2026-11-19T12:00:00Z");
const params = (o) => new URLSearchParams(o);

test("parseDay: a real UTC day only", () => {
  assert.equal(parseDay("2026-11-19"), "2026-11-19");
  assert.equal(parseDay("2026-02-30"), null);
  assert.equal(parseDay("2026-1-9"), null);
  assert.equal(parseDay("2026-11-19T00:00:00Z"), null);
  assert.equal(parseDay(undefined), null);
});

test("parseWindow: presets, a range of days (turned around when reversed), nothing for junk or a half range", () => {
  assert.deepEqual(parseWindow("7d", null, null), { preset: "7d" });
  assert.deepEqual(parseWindow("1d", "x", "y"), { preset: "1d" });
  assert.deepEqual(parseWindow("range", "2026-11-01", "2026-11-15"), { preset: "range", from: "2026-11-01", to: "2026-11-15" });
  assert.deepEqual(parseWindow("range", "2026-11-15", "2026-11-01"), { preset: "range", from: "2026-11-01", to: "2026-11-15" });
  assert.equal(parseWindow("range", "2026-11-01", null), null);
  assert.equal(parseWindow("range", "2026-11-01", "nope"), null);
  assert.equal(parseWindow("2d", null, null), null);
  assert.equal(parseWindow(null, null, null), null);
});

test("parseUserFilter <-> userFilterParams: a round trip; unknown values fall back; kind only travels with an active window", () => {
  assert.deepEqual(parseUserFilter(params({})), EMPTY_USER_FILTER);
  assert.ok(isEmptyUserFilter(parseUserFilter(params({ kind: "played", q: "x", sort: "name" }))));
  const f = parseUserFilter(params({ active: "7d", kind: "played", created: "range", cf: "2026-11-01", ct: "2026-11-15", role: "player", access: "waitlist" }));
  assert.deepEqual(f, { active: { preset: "7d" }, kind: "played", created: { preset: "range", from: "2026-11-01", to: "2026-11-15" }, role: "player", access: "waitlist" });
  assert.deepEqual(userFilterParams(f), { active: "7d", kind: "played", created: "range", cf: "2026-11-01", ct: "2026-11-15", role: "player", access: "waitlist" });
  assert.deepEqual(parseUserFilter(params(userFilterParams(f))), f);
  // junk
  assert.deepEqual(parseUserFilter(params({ active: "yesterday", kind: "x", role: "god", access: "vip" })), EMPTY_USER_FILTER);
  // either is the default kind and is not written
  assert.deepEqual(userFilterParams({ ...EMPTY_USER_FILTER, active: { preset: "30d" } }), { active: "30d" });
  // kind without a window is dropped
  assert.deepEqual(userFilterParams({ ...EMPTY_USER_FILTER, kind: "played" }), {});
});

test("windowBounds: a preset is a rolling window up to now; a range covers its UTC days, both ends included", () => {
  assert.deepEqual(windowBounds({ preset: "1d" }, NOW), { from: new Date("2026-11-18T12:00:00Z"), to: null });
  assert.deepEqual(windowBounds({ preset: "5d" }, NOW), { from: new Date("2026-11-14T12:00:00Z"), to: null });
  assert.deepEqual(windowBounds({ preset: "30d" }, NOW), { from: new Date("2026-10-20T12:00:00Z"), to: null });
  assert.deepEqual(windowBounds({ preset: "range", from: "2026-11-01", to: "2026-11-15" }, NOW), { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-16T00:00:00Z") });
  assert.deepEqual(windowRange({ preset: "7d" }, NOW), { $gte: new Date("2026-11-12T12:00:00Z") });
  assert.deepEqual(windowRange({ preset: "range", from: "2026-11-19", to: "2026-11-19" }, NOW), { $gte: new Date("2026-11-19T00:00:00Z"), $lt: new Date("2026-11-20T00:00:00Z") });
});

test("the words on the count line", () => {
  assert.equal(windowPhrase({ preset: "7d" }), "in the last 7 days");
  assert.equal(windowPhrase({ preset: "1d" }), "in the last 24 hours");
  assert.equal(windowPhrase({ preset: "range", from: "2026-11-01", to: "2026-11-15" }), "from 2026-11-01 to 2026-11-15");
  assert.equal(windowPhrase({ preset: "range", from: "2026-11-01", to: "2026-11-01" }), "on 2026-11-01");
  assert.equal(userFilterSummary(EMPTY_USER_FILTER), "");
  assert.equal(userFilterSummary({ active: { preset: "7d" }, kind: "played", created: null, role: null, access: null }), "played in the last 7 days");
  assert.equal(
    userFilterSummary({ active: { preset: "30d" }, kind: "either", created: { preset: "range", from: "2026-11-01", to: "2026-11-15" }, role: "player", access: "waitlist" }),
    "played or signed in in the last 30 days, created from 2026-11-01 to 2026-11-15, role user, on the waitlist",
  );
});

test("userIdHex: both stored forms of play_history.user_id become lower-case hex; anything else is null", () => {
  const id = new ObjectId("6AE204D8C05A94F95F234732");
  assert.equal(userIdHex(id), "6ae204d8c05a94f95f234732");
  assert.equal(userIdHex("6AE204D8C05A94F95F234732"), "6ae204d8c05a94f95f234732");
  assert.equal(userIdHex("anon_1234"), null);
  assert.equal(userIdHex(null), null);
});

test("userFilterConditions: one Mongo condition per set part; played uses the looked-up ids, signed-in the stamp, either both", () => {
  const played = [new ObjectId(), new ObjectId()];
  assert.deepEqual(userFilterConditions(EMPTY_USER_FILTER, NOW, null), []);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, active: { preset: "7d" }, kind: "played" }, NOW, played), [{ _id: { $in: played } }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, active: { preset: "7d" }, kind: "signed-in" }, NOW, null), [{ lastLoginAt: { $gte: new Date("2026-11-12T12:00:00Z") } }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, active: { preset: "7d" } }, NOW, played), [
    { $or: [{ lastLoginAt: { $gte: new Date("2026-11-12T12:00:00Z") } }, { _id: { $in: played } }] },
  ]);
  // no one played: the played condition matches nobody rather than everybody
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, active: { preset: "7d" }, kind: "played" }, NOW, []), [{ _id: { $in: [] } }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, created: { preset: "range", from: "2026-11-01", to: "2026-11-15" } }, NOW, null), [
    { createdAt: { $gte: new Date("2026-11-01T00:00:00Z"), $lt: new Date("2026-11-16T00:00:00Z") } },
  ]);
  // "player" is stored as "player" or not at all
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, role: "player" }, NOW, null), [{ $or: [{ role: "player" }, { role: { $exists: false } }, { role: null }] }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, role: "admin" }, NOW, null), [{ role: "admin" }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, access: "waitlist" }, NOW, null), [{ access: "waitlist" }]);
  assert.deepEqual(userFilterConditions({ ...EMPTY_USER_FILTER, access: "approved" }, NOW, null), [{ access: { $ne: "waitlist" } }]);
});

test("buildUserFilter: the search and the filters $and-ed; {} for nothing; the play lookup runs only when needed", async () => {
  const calls = [];
  const db = {
    collection(name) {
      return {
        aggregate(pipeline) {
          calls.push({ name, pipeline });
          return { toArray: async () => [{ _id: "6ae204d8c05a94f95f234732" }, { _id: new ObjectId("6ae204d8c05a94f95f234732") }, { _id: "guest" }] };
        },
      };
    },
  };
  assert.deepEqual(await buildUserFilter(db, "", EMPTY_USER_FILTER, NOW), {});
  assert.equal(calls.length, 0);
  assert.deepEqual(await buildUserFilter(db, "ali", EMPTY_USER_FILTER, NOW), { $or: [{ email: { $regex: "ali", $options: "i" } }, { username: { $regex: "ali", $options: "i" } }, { name: { $regex: "ali", $options: "i" } }] });
  assert.deepEqual(await buildUserFilter(db, "", { ...EMPTY_USER_FILTER, active: { preset: "7d" }, kind: "signed-in" }, NOW), { lastLoginAt: { $gte: new Date("2026-11-12T12:00:00Z") } });
  assert.equal(calls.length, 0, "signed-in needs no play lookup");
  const both = await buildUserFilter(db, "ali", { ...EMPTY_USER_FILTER, active: { preset: "7d" }, kind: "played", role: "admin" }, NOW);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "play_history");
  assert.deepEqual(calls[0].pipeline, [{ $match: { played_at: { $gte: new Date("2026-11-12T12:00:00Z") } } }, { $group: { _id: "$user_id" } }]);
  assert.equal(both.$and.length, 3);
  assert.deepEqual(both.$and[1], { _id: { $in: [new ObjectId("6ae204d8c05a94f95f234732")] } }, "both id forms of one user are one id; guests are dropped");
  assert.deepEqual(both.$and[2], { role: "admin" });
});

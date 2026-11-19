/** The display helpers: `ago` (owner 2026-11-19: "2 days ago, 5 minutes ago" in the Users list) and the dates. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, shortWhen } from "../src/lib/format.ts";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const before = (ms) => new Date(NOW - ms).toISOString();
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("ago: words for the distance, singular at one, never for no date", () => {
  assert.equal(ago(before(0), NOW), "just now");
  assert.equal(ago(before(59 * SEC), NOW), "just now");
  assert.equal(ago(before(60 * SEC), NOW), "1 minute ago");
  assert.equal(ago(before(5 * MIN), NOW), "5 minutes ago");
  assert.equal(ago(before(HOUR), NOW), "1 hour ago");
  assert.equal(ago(before(23 * HOUR + 59 * MIN), NOW), "23 hours ago");
  assert.equal(ago(before(DAY), NOW), "1 day ago");
  assert.equal(ago(before(2 * DAY), NOW), "2 days ago");
  assert.equal(ago(before(29 * DAY), NOW), "29 days ago");
  assert.equal(ago(before(30 * DAY), NOW), "1 month ago");
  assert.equal(ago(before(100 * DAY), NOW), "3 months ago");
  assert.equal(ago(before(365 * DAY), NOW), "1 year ago");
  assert.equal(ago(before(800 * DAY), NOW), "2 years ago");
  // a clock slightly ahead of the server never says "in the future"
  assert.equal(ago(new Date(NOW + 30 * SEC).toISOString(), NOW), "just now");
  assert.equal(ago(null, NOW), "never");
  assert.equal(ago(undefined, NOW), "never");
  assert.equal(ago("not a date", NOW), "n/a");
});

test("shortWhen: UTC day and time, the year only when it is not the current one", () => {
  assert.equal(shortWhen(null), "n/a");
  assert.match(shortWhen(new Date(NOW).toISOString()), /^Nov 19 12:00$/);
  assert.match(shortWhen("2019-03-04T05:06:00Z"), /^Mar 4, 19 05:06$/);
});

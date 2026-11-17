import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fake-db.mjs";
import { clampPage, pageCount, pageSkip, parsePageNumber, MAX_SKIP } from "../src/lib/repo/paging.ts";
import {
  ROOMS_PAGE_SIZE, ROOM_EVENTS_LIMIT, formatSnapshotValue, getRoomDetail, isRoomId, listRooms, roomFilterOptions, roomsFilter, timelineLine, SNAPSHOT_TEXT_MAX,
} from "../src/lib/repo/rooms.ts";

const T0 = Date.UTC(2026, 10, 1);
const at = (min) => new Date(T0 + min * 60_000);

test("numbered paging: page count, skip, clamping and bounds", () => {
  assert.equal(pageCount(0, 25), 1);
  assert.equal(pageCount(25, 25), 1);
  assert.equal(pageCount(26, 25), 2);
  assert.equal(pageSkip(1, 25), 0);
  assert.equal(pageSkip(3, 25), 50);
  assert.equal(clampPage(9, 26, 25), 2, "a page past the end shows the last page");
  assert.equal(clampPage(0, 26, 25), 1);
  assert.equal(parsePageNumber("2", 25), 2);
  for (const bad of ["", "0", "-1", "1e3", "x", null, {}, 2.5]) assert.equal(parsePageNumber(bad, 25), 1);
  assert.ok(pageSkip(parsePageNumber("999999999", 25), 25) <= MAX_SKIP, "a hand-made page never skips past MAX_SKIP");
});

function rooms() {
  const out = Array.from({ length: 60 }, (_, i) => ({
    _id: `r${i}`, room_id: `r${i}`, name: `Room ${i}`, game_id: i % 3 === 0 ? "osa" : "last-minute", game_slug: i % 2 ? "last-minute" : null,
    state: i % 4 === 0 ? "closed" : "open", phase: "lobby", players: i % 5, max_players: 8, has_worker: i % 2 === 0, test: false, updatedAt: at(i),
  }));
  return out;
}

test("listRooms: newest updated first, 25 a page, previous/next math, game + state filters", async () => {
  const db = fakeDb({ rooms: rooms() });
  const p1 = await listRooms(db, {});
  assert.equal(p1.total, 60);
  assert.equal(p1.pageSize, ROOMS_PAGE_SIZE);
  assert.equal(p1.pageCount, 3);
  assert.equal(p1.rows.length, 25);
  assert.equal(p1.rows[0].roomId, "r59");
  const p3 = await listRooms(db, { page: "3" });
  assert.equal(p3.rows.length, 10);
  assert.equal(p3.rows.at(-1).roomId, "r0");
  const past = await listRooms(db, { page: "40" });
  assert.equal(past.page, 3, "past the end shows the last page");

  const osa = await listRooms(db, { game: "osa" });
  assert.ok(osa.rows.every((r) => r.game === "osa" || r.game === "last-minute"));
  // game matches game_slug OR game_id
  const lm = await listRooms(db, { game: "last-minute" });
  assert.equal(lm.total, 60 - rooms().filter((r) => r.game_id === "osa" && r.game_slug === null).length);
  const closed = await listRooms(db, { state: "closed", game: "last-minute" });
  assert.ok(closed.rows.every((r) => r.state === "closed"));
  assert.equal(closed.state, "closed");
  // injection-shaped input is ignored
  assert.deepEqual(roomsFilter({ game: { $ne: null }, state: "x y" }), {});
  const opts = await roomFilterOptions(db);
  assert.deepEqual(opts.games, ["last-minute", "osa"]);
  assert.deepEqual(opts.states, ["closed", "open"]);
});

test("getRoomDetail: every related list matches on room_id, is capped and counted", async () => {
  const events = Array.from({ length: ROOM_EVENTS_LIMIT + 5 }, (_, i) => ({ _id: `e${i}`, room_id: "lm-dev", event_type: "player_join", player_count: i, timestamp: at(i) }));
  events.push({ _id: "other", room_id: "lm-dev-2", event_type: "created", timestamp: at(9999) });
  const db = fakeDb({
    rooms: [{ _id: "lm-dev", room_id: "lm-dev", name: "Dev", state: "open", game_slug: "last-minute", players: 2, max_players: 8, secretish: null, updatedAt: at(1) }],
    game_sessions: [
      { _id: "s1", room_id: "lm-dev", name: "Chris", player_id: "6ae204d8c05a94f95f234732", role: "seat", seated: true, joined_at: at(1), left_at: at(3), duration_s: 120, conn_id: 4 },
      { _id: "s2", room_id: "lm-dev", name: "Guest", player_id: "anon_x", role: "watcher", seated: false, joined_at: at(2), open: true },
      { _id: "s3", room_id: "elsewhere", name: "No", joined_at: at(5) },
    ],
    matches: [{ _id: "m1", room_id: "lm-dev", at: at(4), round_id: "lm-dev:1", players: [{ name: "Chris" }, { name: "Mike" }], timeline: [{ t: 3, type: "kill", by: "Chris" }, "plain"] }],
    server_events: events,
    live_snapshots: [{ _id: "snap", room_id: "lm-dev", kind: "match", saved_at: at(5), value: JSON.stringify({ roomId: "lm-dev", body: JSON.stringify({ round: { n: 4 } }) }) }],
    client_reports: [{ _id: "rep", room_id: "lm-dev", name: "Guest", device: { class: "desktop", renderer: "ANGLE" }, reason: "pagehide", errors: [{ msg: "x" }, { msg: "y" }], session_ms: 2183, received_at: at(6) }],
  });
  const d = await getRoomDetail(db, "lm-dev");
  assert.equal(d.row.name, "Dev");
  assert.ok(d.fields.some(([k, v]) => k === "secretish" && v === "null"), "every field of the room document");
  assert.equal(d.sessions.count, 2);
  assert.deepEqual(d.sessions.items.map((s) => s.id), ["s2", "s1"], "newest joined first");
  assert.equal(d.sessions.items[1].durationS, 120);
  assert.equal(d.matches.items[0].players, 2);
  assert.deepEqual(d.matches.items[0].timeline, ["3 / kill / by: Chris", "plain"]);
  assert.equal(d.events.count, ROOM_EVENTS_LIMIT + 5);
  assert.equal(d.events.items.length, ROOM_EVENTS_LIMIT, "capped");
  assert.ok(d.events.items.every((e) => e.id !== "other"));
  assert.equal(d.events.items[0].id, `e${ROOM_EVENTS_LIMIT + 4}`, "newest first by default");
  const oldest = await getRoomDetail(db, "lm-dev", { eventsOrder: "oldest" });
  assert.equal(oldest.events.items[0].id, "e0");
  assert.equal(oldest.events.order, "oldest");
  assert.match(d.snapshots.items[0].text, /"n": 4/, "the nested body JSON is parsed too");
  assert.equal(d.reports.items[0].errors, 2);
  assert.equal(d.reports.items[0].device, "desktop, ANGLE");
  for (const q of db.queries.filter((q) => q.collection !== "rooms")) assert.deepEqual(q.filter, { room_id: "lm-dev" });

  const ghost = await getRoomDetail(db, "elsewhere");
  assert.equal(ghost.fields, null, "no room document, but the logs still show");
  assert.equal(ghost.sessions.count, 1);
  assert.equal(await getRoomDetail(db, "../x"), null);
  assert.equal(await getRoomDetail(db, { $ne: null }), null);
  assert.equal(isRoomId("test-gp-nqgf"), true);
  assert.equal(isRoomId("a b"), false);
});

test("snapshot formatting: parses JSON text, keeps other text, cuts very long values", () => {
  assert.equal(formatSnapshotValue("not json").text, "not json");
  assert.equal(formatSnapshotValue({ a: 1 }).text, '{\n  "a": 1\n}');
  const big = formatSnapshotValue(JSON.stringify({ s: "x".repeat(SNAPSHOT_TEXT_MAX * 2) }));
  assert.equal(big.cut, true);
  assert.equal(big.text.length, SNAPSHOT_TEXT_MAX);
  assert.equal(timelineLine(5), "5");
});

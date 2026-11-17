import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import { GAME_ROOMS_LIMIT, gameSearchFilter, gameSortSpec, getGameDetail, listGames, parseGameSort } from "../src/lib/repo/games.ts";
import { MAX_PAGES, PAGE_SIZE } from "../src/lib/repo/paging.ts";

const LM = new ObjectId("6ae02121890be921ce8b6e19");
const OSA = new ObjectId("6af8e8b8162822b0a8a81b8a");
const CREATOR = new ObjectId("6af8e8b798510477d976ce6f");
const ASKER = new ObjectId("6ae77ce1162822b0a831babf");
const DECIDER = new ObjectId("6ae204d8c05a94f95f234732");

function games() {
  return [
    { _id: LM, slug: "last-minute", name: "The Last Minute", emoji: "⏱", creator_name: "owner", access: "public", plays: 50, rounds_completed: 5, updatedAt: new Date("2026-11-10T00:00:00Z"), studio_enabled: true, discord_url: "https://discord.gg/x", likes: 3, tags: ["fps"] },
    { _id: OSA, slug: "one-shot-arena", name: "One Shot Arena", emoji: "🎯", creator_name: "gamer", creator_id: CREATOR, visibility: "public", plays: 10, rounds_completed: 40, updatedAt: new Date("2026-11-14T00:00:00Z"), createdAt: new Date("2026-11-14T00:00:00Z") },
    { _id: new ObjectId(), slug: "wyrmlight", name: "Wyrmlight", creator_name: "owner", plays: 30, rounds_completed: 20, updatedAt: new Date("2026-11-16T00:00:00Z") },
  ];
}

test("gameSearchFilter: slug, name or creator, case-insensitive, regex characters escaped; empty = everything", () => {
  assert.deepEqual(gameSearchFilter(""), {});
  assert.deepEqual(gameSearchFilter("   "), {});
  assert.deepEqual(gameSearchFilter(42), {});
  const f = gameSearchFilter(" a.b ");
  assert.deepEqual(f.$or.map((c) => Object.keys(c)[0]), ["slug", "name", "creator_name"]);
  assert.equal(f.$or[0].slug.$regex, "a\\.b");
  assert.equal(f.$or[0].slug.$options, "i");
  assert.equal(gameSearchFilter("x".repeat(500)).$or[0].slug.$regex.length, 80);
});

test("listGames: search matches slug, name and creator", async () => {
  const db = fakeDb({ games: games() });
  assert.deepEqual((await listGames(db, { q: "ARENA" })).rows.map((g) => g.slug), ["one-shot-arena"]);
  assert.deepEqual((await listGames(db, { q: "wyrm" })).rows.map((g) => g.slug), ["wyrmlight"]);
  const byCreator = await listGames(db, { q: "owner" });
  assert.deepEqual(byCreator.rows.map((g) => g.slug).sort(), ["last-minute", "wyrmlight"]);
  assert.equal(byCreator.total, 2);
  assert.equal((await listGames(db, { q: "(.*)" })).total, 0, "a regex from the caller is matched literally");
});

test("listGames: sorts by plays, rounds or updated (default), all descending", async () => {
  const db = fakeDb({ games: games() });
  assert.deepEqual((await listGames(db, { sort: "plays" })).rows.map((g) => g.slug), ["last-minute", "wyrmlight", "one-shot-arena"]);
  assert.deepEqual((await listGames(db, { sort: "rounds" })).rows.map((g) => g.slug), ["one-shot-arena", "wyrmlight", "last-minute"]);
  const def = await listGames(db, {});
  assert.equal(def.sort, "updated");
  assert.deepEqual(def.rows.map((g) => g.slug), ["wyrmlight", "one-shot-arena", "last-minute"]);
  assert.equal(parseGameSort("drop table"), "updated");
  assert.deepEqual(gameSortSpec("plays"), { plays: -1, _id: -1 });
  // the row carries the older `visibility` when `access` is absent
  assert.equal(def.rows.find((g) => g.slug === "one-shot-arena").access, "public");
});

test("listGames: pages of 50, shown cumulatively, with hasMore until everything is shown; page is bounded", async () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ _id: new ObjectId(), slug: `g-${String(i).padStart(3, "0")}`, name: `G ${i}`, plays: i, updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) }));
  const db = fakeDb({ games: many });
  const p1 = await listGames(db, { sort: "plays" });
  assert.equal(p1.rows.length, PAGE_SIZE);
  assert.equal(p1.total, 120);
  assert.equal(p1.hasMore, true);
  assert.equal(p1.rows[0].plays, 119);
  const p2 = await listGames(db, { sort: "plays", page: "2" });
  assert.equal(p2.rows.length, 100);
  assert.equal(p2.hasMore, true);
  assert.deepEqual(p2.rows.slice(0, 50), p1.rows, "page 2 continues page 1 without gaps or repeats");
  const p3 = await listGames(db, { sort: "plays", page: "3" });
  assert.equal(p3.rows.length, 120);
  assert.equal(p3.hasMore, false);
  assert.equal(new Set(p3.rows.map((r) => r.slug)).size, 120);
  assert.equal((await listGames(db, { page: "99999" })).page, MAX_PAGES);
  assert.equal((await listGames(db, { page: "-1" })).page, 1);
  assert.equal((await listGames(db, { page: "abc" })).page, 1);
  const lastFind = db.queries.filter((q) => q.collection === "games" && q.op === "find").at(-1);
  assert.ok(lastFind.options.projection, "the list projects its fields");
});

test("getGameDetail: the game's fields, counters and related rows; unknown or malformed slug = null", async () => {
  const keyDocs = [
    { _id: new ObjectId(), key: "gk_live_SECRET_VALUE_1", prefix: "gk_live_abc12", game_id: LM, game_slug: "last-minute", label: "prod box", environment: "prod", status: "active", createdAt: new Date("2026-11-01T00:00:00Z") },
    { _id: new ObjectId(), key: "gk_dev_SECRET_VALUE_2", prefix: "gk_dev_def34", game_id: LM, game_slug: "last-minute", label: "dev", environment: "dev", status: "revoked", createdAt: new Date("2026-11-02T00:00:00Z") },
    { _id: new ObjectId(), key: "gk_dev_OTHER_GAME", game_id: OSA, game_slug: "one-shot-arena", label: "osa", createdAt: new Date() },
  ];
  const rooms = Array.from({ length: 30 }, (_, i) => ({ _id: `room${i}`, room_id: `room${i}`, game_id: "last-minute", game_slug: i % 2 ? "last-minute" : null, state: "open", players: i, updatedAt: new Date(Date.UTC(2026, 10, 1, 0, i)), created_at: new Date(Date.UTC(2026, 10, 1)) }));
  rooms.push({ _id: "other", game_id: "fps-arena", game_slug: null, updatedAt: new Date(Date.UTC(2027, 0, 1)) });
  const db = fakeDb({
    games: games(),
    game_keys: keyDocs,
    game_join_requests: [
      { _id: new ObjectId(), gameId: LM.toHexString(), userId: ASKER.toHexString(), status: "approved", createdAt: new Date("2026-11-03T00:25:30Z"), decidedAt: new Date("2026-11-03T00:25:41Z"), decidedBy: DECIDER.toHexString() },
      { _id: new ObjectId(), gameId: OSA.toHexString(), userId: ASKER.toHexString(), status: "pending", createdAt: new Date() },
    ],
    rooms,
    users: [{ _id: ASKER, email: "asker@example.com" }, { _id: DECIDER, email: "owner@jazaix.com" }],
  });
  const d = await getGameDetail(db, "last-minute");
  assert.equal(d.game.slug, "last-minute");
  assert.equal(d.game.studioEnabled, true);
  assert.equal(d.game.discordUrl, "https://discord.gg/x");
  assert.deepEqual(d.game.tags, ["fps"]);
  assert.equal(d.game.counters.likes, 3);
  assert.equal(d.game.counters.dislikes, 0, "an absent counter reads 0");
  assert.equal(d.keys.count, 2);
  assert.deepEqual(d.keys.items.map((k) => k.label), ["dev", "prod box"], "newest key first");
  assert.equal(d.joinRequests.count, 1);
  assert.equal(d.joinRequests.items[0].email, "asker@example.com");
  assert.equal(d.joinRequests.items[0].decidedBy, "owner@jazaix.com");
  assert.equal(d.rooms.length, GAME_ROOMS_LIMIT);
  assert.equal(d.rooms[0].room_id, "room29", "most recently updated room first");
  assert.ok(d.rooms.every((r) => r.id !== "other"), "rooms of other games are not listed");
  assert.equal(d.rooms[0].players, "29");
  assert.equal(d.rooms[0].closed_at, "", "an absent field shows empty");

  assert.equal(await getGameDetail(db, "nope"), null);
  assert.equal(await getGameDetail(db, "../etc"), null);
  assert.equal(await getGameDetail(db, { $ne: null }), null, "an object never reaches the query");
});

test("getGameDetail: key VALUES are never returned, even when the store ignores the projection", async () => {
  const db = fakeDb({
    games: games(),
    game_keys: [{ _id: new ObjectId(), key: "gk_live_TOP_SECRET", prefix: "gk_live_abc12", hash: "h", secret: "s", game_id: LM, label: "prod", environment: "prod", status: "active", createdAt: new Date() }],
  });
  const d = await getGameDetail(db, "last-minute");
  const json = JSON.stringify(d);
  assert.doesNotMatch(json, /TOP_SECRET|gk_live_abc12/);
  assert.deepEqual(Object.keys(d.keys.items[0]).sort(), ["createdAt", "environment", "label", "status"]);
  const q = db.queries.find((x) => x.collection === "game_keys" && x.op === "find");
  assert.deepEqual(Object.keys(q.options.projection).sort(), ["createdAt", "environment", "label", "status"], "the key is not even read");
});

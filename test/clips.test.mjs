/**
 * Content > Clips: the clips client (src/lib/clips.ts) without a network, then against a real local HTTP server that
 * plays the clips API (paging, the X-Total-Count header, no header, 500, not JSON, a slow answer, nothing listening).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  CLIPS_API_PAGE_MAX, CLIPS_OFF_MESSAGE, CLIPS_PAGE_SIZE, clipPeople, clipPersonLabel, clipRow, clipShareUrl, clipsApiSearch, clipsTotal, loadClips, parseClipsQuery,
} from "../src/lib/clips.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PID = "6ae204d8c05a94f95f234732";

/** A wire record the way the clips API serves one (the production shape seen 2026-11-20, names invented). */
const wire = (over = {}) => ({
  v: 2, clipId: "osa-2026-11-20-abc123", game: "one-shot-arena", room: "r1", round: 3, kind: "kill", style: "bullet-cam", score: 42,
  kills: [{ victim: 7, headshot: true, distanceM: 61.2 }],
  savedBy: [{ id: 3, name: "Ace", pid: PID }, { id: 9, name: "Guest", pid: null }],
  auto: false, headshot: true, distanceM: 61.2,
  players: [{ id: 3, name: "Ace", bot: false, pid: PID, role: "player" }, { id: 7, name: "Rook", bot: true, pid: null, role: "crew" }],
  killer: { id: 3, name: "Ace", bot: false }, victim: { id: 7, name: "Rook", bot: true },
  createdAt: "2026-11-20T08:00:00.000Z", renderedAt: "2026-11-20T08:00:40.000Z", durationS: 9.5,
  urls: { clip: "https://clips.jazaix.com/a/clip.mp4", poster: "https://clips.jazaix.com/a/poster.jpg", preview: "https://clips.jazaix.com/a/preview.mp4", gif: "https://clips.jazaix.com/a/hit.gif" },
  expiresAt: null, tags: ["headshot", "long-shot"], combos: ["sniper"], featured: true, featureScore: 0.8,
  ...over,
});

test("parseClipsQuery: page 1 by default, a slug-shaped game only, featured=1 only", () => {
  assert.deepEqual(parseClipsQuery({}), { page: 1, game: "", featured: false });
  assert.deepEqual(parseClipsQuery({ page: "3", game: "one-shot-arena", featured: "1" }), { page: 3, game: "one-shot-arena", featured: true });
  assert.deepEqual(parseClipsQuery({ page: "0" }), { page: 1, game: "", featured: false });
  assert.deepEqual(parseClipsQuery({ page: "x", game: "../etc", featured: "yes" }), { page: 1, game: "", featured: false });
  assert.deepEqual(parseClipsQuery({ page: ["2", "9"], game: ["lm"] }), { page: 2, game: "lm", featured: false });
});

test("clipsApiSearch: the API's own filters plus limit/offset, limit capped at the API's 50", () => {
  assert.equal(clipsApiSearch({ page: 1, game: "", featured: false }).toString(), "limit=25&offset=0");
  assert.equal(clipsApiSearch({ page: 3, game: "lm", featured: true }).toString(), "game=lm&featured=1&limit=25&offset=50");
  assert.equal(clipsApiSearch({ page: 2, game: "", featured: false }, 80).toString(), `limit=${CLIPS_API_PAGE_MAX}&offset=80`);
  assert.equal(CLIPS_PAGE_SIZE, 25);
});

test("clipPeople: names from the record, platform ids from players; a bot is marked; a bad pid is no link", () => {
  const { killer, victim } = clipPeople(wire());
  assert.deepEqual(killer, { name: "Ace", bot: false, userId: PID });
  assert.deepEqual(victim, { name: "Rook", bot: true, userId: null });
  assert.deepEqual(clipPeople({ killer: { id: 1, name: "X", pid: "not-an-object-id" } }).killer, { name: "X", bot: false, userId: null });
  assert.deepEqual(clipPeople({ killer: { id: 4 } }).killer, { name: "player 4", bot: false, userId: null });
  assert.deepEqual(clipPeople({ killer: null, victim: "x" }), { killer: null, victim: null });
  // the cell label: a bot says so once (the engine's names already carry [CREW])
  assert.equal(clipPersonLabel({ name: "Ace", bot: false, userId: PID }), "Ace");
  assert.equal(clipPersonLabel({ name: "Rook", bot: true, userId: null }), "Rook (crew)");
  assert.equal(clipPersonLabel({ name: "Onyx [CREW]", bot: true, userId: null }), "Onyx [CREW]");
});

test("clipRow: the row the table shows; kept when nobody's save expires; not a clip without an id or a video", () => {
  const r = clipRow(wire());
  assert.equal(r.clipId, "osa-2026-11-20-abc123");
  assert.equal(r.game, "one-shot-arena");
  assert.equal(r.savedBy, 2);
  assert.equal(r.kept, true);
  assert.equal(r.featured, true);
  assert.deepEqual(r.tags, ["headshot", "long-shot"]);
  assert.equal(r.score, 42);
  assert.equal(r.durationS, 9.5);
  assert.equal(r.poster, "https://clips.jazaix.com/a/poster.jpg");
  assert.equal(r.gif, "https://clips.jazaix.com/a/hit.gif");
  assert.equal(r.renderedAt, "2026-11-20T08:00:40.000Z");
  // an expiring clip nobody kept
  const e = clipRow(wire({ expiresAt: "2026-11-21T08:00:00.000Z", savedBy: [{ id: 3, name: "Ace", pid: PID }] }));
  assert.equal(e.kept, false);
  assert.equal(e.expiresAt, "2026-11-21T08:00:00.000Z");
  // a saver who KEPT it stops the clock
  assert.equal(clipRow(wire({ expiresAt: "2026-11-21T08:00:00.000Z", savedBy: [{ id: 3, name: "Ace", pid: PID, kept: true }] })).kept, true);
  // bad input never throws, never becomes a row
  assert.equal(clipRow(null), null);
  assert.equal(clipRow("x"), null);
  assert.equal(clipRow(wire({ clipId: "" })), null);
  assert.equal(clipRow(wire({ urls: { poster: "https://x/p.jpg" } })), null);
  assert.equal(clipRow(wire({ urls: { clip: "javascript:alert(1)" } })), null);
  const odd = clipRow(wire({ tags: "headshot", savedBy: "many", durationS: "9", score: null, expiresAt: "soon", urls: { clip: "https://x/c.mp4", poster: "ftp://x/p" } }));
  assert.deepEqual(odd.tags, []);
  assert.equal(odd.savedBy, 0);
  assert.equal(odd.durationS, null);
  assert.equal(odd.score, null);
  assert.equal(odd.expiresAt, null);
  assert.equal(odd.poster, null);
});

test("clipShareUrl: the portal's share page, or null without a portal URL or a game", () => {
  assert.equal(clipShareUrl("https://play.jazaix.com", { game: "one-shot-arena", clipId: "a b" }), "https://play.jazaix.com/game/one-shot-arena/clips/a%20b");
  assert.equal(clipShareUrl(null, { game: "lm", clipId: "a" }), null);
  assert.equal(clipShareUrl("https://play.jazaix.com", { game: "", clipId: "a" }), null);
});

test("clipsTotal: the header wins (never below what the page proves); without it a full page allows one more", () => {
  assert.equal(clipsTotal("11", 0, 11, 25), 11);
  assert.equal(clipsTotal("11", 25, 3, 25), 28);
  assert.equal(clipsTotal("11", 25, 0, 25), 11, "an empty page past the end keeps the header's count");
  assert.equal(clipsTotal("x", 0, 5, 25), 5);
  assert.equal(clipsTotal(null, 0, 25, 25), 26);
  assert.equal(clipsTotal(null, 50, 7, 25), 57);
});

test("loadClips: no URL is 'off' with the plain message and no request", async () => {
  let calls = 0;
  const r = await loadClips(null, parseClipsQuery({}), { fetchImpl: async () => { calls++; return new Response("[]"); } });
  assert.deepEqual(r, { ok: false, kind: "off", message: CLIPS_OFF_MESSAGE });
  assert.equal(calls, 0);
  assert.equal(CLIPS_OFF_MESSAGE, "Clips are not connected.");
});

test("loadClips: the request is a GET of /api/clips with the page's query, JSON accepted, never a body", async () => {
  let seen;
  const r = await loadClips("https://clips.example", { page: 2, game: "lm", featured: true }, {
    fetchImpl: async (input, init) => { seen = { input, init }; return new Response(JSON.stringify([wire()]), { headers: { "x-total-count": "40" } }); },
  });
  assert.equal(seen.input, "https://clips.example/api/clips?game=lm&featured=1&limit=25&offset=25");
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers.accept, "application/json");
  assert.equal(seen.init.body, undefined);
  assert.equal(r.ok, true);
  assert.equal(r.value.total, 40);
  assert.equal(r.value.pageCount, 2);
  assert.equal(r.value.page, 2);
  assert.equal(r.value.rows.length, 1);
});

// ── a real server playing the clips API ─────────────────────────────────────────────────────────────────────────
const mode = { value: "ok" };
const ALL = Array.from({ length: 31 }, (_, i) => wire({ clipId: `c${String(i).padStart(2, "0")}`, featured: i % 5 === 0, createdAt: new Date(Date.UTC(2026, 10, 20, 0, 31 - i)).toISOString() }));
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (mode.value === "slow") return; // never answers
  if (mode.value === "500") { res.writeHead(500).end("boom"); return; }
  if (mode.value === "html") { res.writeHead(200, { "content-type": "text/html" }).end("<html>"); return; }
  if (mode.value === "object") { res.writeHead(200, { "content-type": "application/json" }).end('{"clips":[]}'); return; }
  let list = ALL.filter((c) => !u.searchParams.get("game") || c.game === u.searchParams.get("game")).filter((c) => !u.searchParams.get("featured") || c.featured);
  if (mode.value === "junk") list = [{ nope: true }, ...list];
  const limit = Number(u.searchParams.get("limit")) || list.length, offset = Number(u.searchParams.get("offset")) || 0;
  const headers = { "content-type": "application/json" };
  if (mode.value !== "no-header") headers["x-total-count"] = String(list.length);
  res.writeHead(200, headers).end(JSON.stringify(list.slice(offset, offset + limit)));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test("against a server: pages of 25 with the whole count, the filters passed through, newest first kept as served", async () => {
  mode.value = "ok";
  const p1 = await loadClips(base, parseClipsQuery({}));
  assert.equal(p1.ok, true);
  assert.equal(p1.value.total, 31);
  assert.equal(p1.value.pageCount, 2);
  assert.equal(p1.value.rows.length, 25);
  assert.equal(p1.value.rows[0].clipId, "c00");
  const p2 = await loadClips(base, parseClipsQuery({ page: "2" }));
  assert.equal(p2.value.rows.length, 6);
  assert.equal(p2.value.rows[0].clipId, "c25");
  const f = await loadClips(base, parseClipsQuery({ featured: "1" }));
  assert.equal(f.value.total, 7);
  assert.deepEqual(f.value.rows.map((r) => r.clipId), ["c00", "c05", "c10", "c15", "c20", "c25", "c30"]);
  const g = await loadClips(base, parseClipsQuery({ game: "other-game" }));
  assert.equal(g.ok, true);
  assert.equal(g.value.total, 0);
  assert.deepEqual(g.value.rows, []);
  assert.equal(g.value.pageCount, 1);
  // a page past the end: no rows, the count and the page count unchanged (the page offers a way back)
  const p3 = await loadClips(base, parseClipsQuery({ page: "3" }));
  assert.deepEqual([p3.value.rows.length, p3.value.total, p3.value.pageCount, p3.value.page], [0, 31, 2, 3]);
});

test("against a server: no X-Total-Count still pages (a full page offers one more), junk records are dropped", async () => {
  mode.value = "no-header";
  const p1 = await loadClips(base, parseClipsQuery({}));
  assert.equal(p1.value.total, 26);
  assert.equal(p1.value.pageCount, 2);
  const p2 = await loadClips(base, parseClipsQuery({ page: "2" }));
  assert.equal(p2.value.total, 31);
  assert.equal(p2.value.pageCount, 2);
  mode.value = "junk";
  const j = await loadClips(base, parseClipsQuery({}));
  assert.equal(j.value.total, 32);
  assert.equal(j.value.rows.length, 24, "the junk record is not a row");
});

test("against a server: 500, not JSON, not a list, a slow answer and nothing listening are messages, never throws", async () => {
  mode.value = "500";
  assert.deepEqual(await loadClips(base, parseClipsQuery({})), { ok: false, kind: "error", message: "the clips API answered 500" });
  mode.value = "html";
  assert.deepEqual(await loadClips(base, parseClipsQuery({})), { ok: false, kind: "error", message: "the clips API did not answer with JSON" });
  mode.value = "object";
  assert.deepEqual(await loadClips(base, parseClipsQuery({})), { ok: false, kind: "error", message: "the clips API did not answer with a list" });
  mode.value = "slow";
  const t0 = Date.now();
  const slow = await loadClips(base, parseClipsQuery({}), { timeoutMs: 300 });
  assert.deepEqual(slow, { ok: false, kind: "timeout", message: "the clips API did not answer within 0 s" });
  assert.ok(Date.now() - t0 < 2000, "gave up at the timeout");
  mode.value = "ok";
  const dead = await loadClips("http://127.0.0.1:9", parseClipsQuery({}), { timeoutMs: 2000 });
  assert.deepEqual(dead, { ok: false, kind: "unreachable", message: "the clips API could not be reached" });
});

test("the page and the table: read only (no writes to the clips API), no inner scroll, the off card says nothing specific", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/(console)/content/clips/page.tsx"), "utf8");
  const table = fs.readFileSync(path.join(ROOT, "src/components/ClipsTable.tsx"), "utf8");
  const client = fs.readFileSync(path.join(ROOT, "src/lib/clips.ts"), "utf8");
  assert.doesNotMatch(client, /method: "(POST|DELETE|PUT|PATCH)"/);
  assert.doesNotMatch(page + table, /fetch\(|method="post"|onClick/i, "the page is a server-rendered read");
  assert.doesNotMatch(page + table, /overflow-x|overflow-auto/, "no inner scroll container");
  assert.match(page, /data-testid="clips-off"/);
  assert.doesNotMatch(page, /JX_CLIPS_API_URL|jx-replays|clips-api/, "the off card names no config");
  assert.match(page, /gatedPage\(/, "the page goes through the admin gate");
  assert.match(table, /target="_blank" rel="noreferrer"/, "clip links open the CDN or the portal in a new tab");
  assert.match(table, /<Poster src=\{r\.poster\} \/>/, "the poster goes through the never-broken-image component");
});

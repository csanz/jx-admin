import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { fakeDb } from "./fake-db.mjs";
import { REDACTED, USER_LISTS_PAGE_SIZE, getUserDetail, isSecretField, redactSecrets, userFields, walletSummary } from "../src/lib/repo/user-detail.ts";

const UID = new ObjectId("6ae204d8c05a94f95f234732");
const HEX = UID.toHexString();
const GAME = new ObjectId("6ae02121890be921ce8b6e19");
const T0 = Date.UTC(2026, 10, 1);
const at = (min) => new Date(T0 + min * 60_000);

test("secret-looking fields are redacted at any depth", () => {
  for (const k of ["token", "accessToken", "refresh_token", "secret", "clientSecret", "passwordHash", "hash", "password", "apiKey", "api_key", "otpSeed", "salt"]) assert.equal(isSecretField(k), true, k);
  for (const k of ["email", "name", "photoKey", "image", "role", "username"]) assert.equal(isSecretField(k), false, k);
  assert.deepEqual(redactSecrets({ a: 1, nested: { idToken: "x", ok: "y", list: [{ secret: "z" }] } }), { a: 1, nested: { idToken: REDACTED, ok: "y", list: [{ secret: REDACTED }] } });
  const f = new Map(userFields({ _id: UID, email: "a@b.c", sessionToken: "SECRET-1", oauth: { refresh_token: "SECRET-2" } }));
  assert.equal(f.get("sessionToken"), REDACTED);
  assert.doesNotMatch(JSON.stringify([...f]), /SECRET-/);
  assert.equal(f.get("email"), "a@b.c");
});

test("walletSummary: pots, legacy wallet = test money, hold", () => {
  assert.equal(walletSummary(null), null);
  assert.deepEqual(walletSummary({ balance: 750, funds: { real: 1, test: 649, promo: 100 }, hold: "admin", updatedAt: at(0) }), { balance: 750, real: 1, test: 649, promo: 100, hold: "admin", updatedAt: at(0).toISOString() });
  assert.equal(walletSummary({ balance: 40 }).test, 40);
});

test("getUserDetail: fields, wallet, sign-ins, play history joined to games and sessions by player_id, paged at 50", async () => {
  const plays = Array.from({ length: USER_LISTS_PAGE_SIZE + 7 }, (_, i) => ({ _id: `p${i}`, user_id: HEX, game_id: GAME, played_at: at(i) }));
  plays.push({ _id: "other", user_id: "000000000000000000000001", game_id: GAME, played_at: at(9999) });
  const sessions = Array.from({ length: 3 }, (_, i) => ({ _id: `s${i}`, player_id: HEX, game_slug: "last-minute", room_id: `room${i}`, joined_at: at(i), duration_s: 10 * i, role: "seat", seated: true }));
  sessions.push({ _id: "anon", player_id: "anon_1", room_id: "x", joined_at: at(50) });
  const db = fakeDb({
    users: [{ _id: UID, email: "chris@example.com", name: "Chris", username: "chris", role: "admin", createdAt: at(0), lastLoginAt: at(100), providerToken: "SECRET" }],
    wallets: [{ _id: new ObjectId(), userId: UID, balance: 5, funds: { real: 0, test: 5, promo: 0 } }],
    play_history: plays,
    game_sessions: sessions,
    games: [{ _id: GAME, slug: "last-minute", name: "The Last Minute" }],
  });
  const d = await getUserDetail(db, HEX);
  assert.equal(d.user.role, "admin");
  assert.equal(d.wallet.test, 5);
  assert.deepEqual(d.signIns, { first: at(0).toISOString(), latest: at(100).toISOString(), onlyLatestStored: true });
  assert.doesNotMatch(JSON.stringify(d), /SECRET/);
  assert.equal(d.plays.total, USER_LISTS_PAGE_SIZE + 7);
  assert.equal(d.plays.rows.length, USER_LISTS_PAGE_SIZE);
  assert.equal(d.plays.rows[0].id, `p${USER_LISTS_PAGE_SIZE + 6}`, "newest first");
  assert.equal(d.plays.rows[0].gameName, "The Last Minute");
  assert.equal(d.plays.rows[0].gameSlug, "last-minute");
  assert.equal(d.sessions.total, 3);
  assert.deepEqual(d.sessions.rows.map((s) => s.roomId), ["room2", "room1", "room0"]);
  const p2 = await getUserDetail(db, HEX, { playsPage: "2" });
  assert.equal(p2.plays.page, 2);
  assert.equal(p2.plays.rows.length, 7);
  assert.equal(await getUserDetail(db, "nope"), null);
  assert.equal(await getUserDetail(db, "000000000000000000000009"), null);
});

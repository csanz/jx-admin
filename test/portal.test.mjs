import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortalClient, mapPortalStatus, PORTAL_TIMEOUT_MS } from "../src/lib/portal.ts";

const jsonRes = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recordingFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return jsonRes(status, body); };
  return { calls, fetchImpl };
}

test("sets the bearer token, the actor email and JSON content type; never a cookie", async () => {
  const { calls, fetchImpl } = recordingFetch(200, { ok: 1 });
  const portal = createPortalClient({ baseUrl: "https://play.example.com/", token: "svc-token", fetchImpl });
  const r = await portal("/api/admin/waitlist", { method: "POST", body: { userId: "a", action: "approve" }, actor: "Owner@Jazaix.com" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://play.example.com/api/admin/waitlist");
  const h = calls[0].init.headers;
  assert.equal(h.Authorization, "Bearer svc-token");
  assert.equal(h["X-Jx-Admin-Email"], "owner@jazaix.com");
  assert.equal(h["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, JSON.stringify({ userId: "a", action: "approve" }));
  assert.equal(calls[0].init.credentials, "omit");
  for (const k of Object.keys(h)) assert.notEqual(k.toLowerCase(), "cookie");
});

test("GET sends no body and no content type", async () => {
  const { calls, fetchImpl } = recordingFetch(200, { counts: { waiting: 1, approved: 2 }, users: [] });
  const portal = createPortalClient({ baseUrl: "https://p.example", token: "t", fetchImpl });
  await portal("/api/admin/waitlist?status=waitlist&q=x", { actor: "a@b.co" });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers["Content-Type"], undefined);
  assert.equal(calls[0].url, "https://p.example/api/admin/waitlist?status=waitlist&q=x");
});

test("requires an actor and refuses paths outside /api/admin/", async () => {
  const portal = createPortalClient({ baseUrl: "https://p.example", token: "t", fetchImpl: recordingFetch(200, {}).fetchImpl });
  await assert.rejects(() => portal("/api/admin/me", { actor: "" }), /actor/);
  await assert.rejects(() => portal("/api/me", { actor: "a@b.co" }), /outside/);
});

test("portal 401/403 -> 502 portal-rejected; 5xx -> 504; 4xx pass through with the portal's JSON", async () => {
  for (const s of [401, 403]) {
    const r = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl: recordingFetch(s, { error: "forbidden" }).fetchImpl })("/api/admin/me", { actor: "a@b.co" });
    assert.equal(r.status, 502, String(s));
    assert.equal(r.mapped, true);
    assert.equal(r.body.error, "portal-rejected");
    assert.doesNotMatch(JSON.stringify(r.body), /t"|Bearer/);
  }
  for (const s of [500, 502, 503]) {
    const r = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl: recordingFetch(s, { error: "x" }).fetchImpl })("/api/admin/me", { actor: "a@b.co" });
    assert.equal(r.status, 504, String(s));
    assert.equal(r.mapped, true);
  }
  const r = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl: recordingFetch(409, { error: "already-approved", message: "Already approved." }).fetchImpl })("/api/admin/waitlist", { method: "POST", body: {}, actor: "a@b.co" });
  assert.equal(r.status, 409);
  assert.equal(r.mapped, false);
  assert.equal(r.body.message, "Already approved.");
});

test("mapPortalStatus is pure and matches the client", () => {
  assert.equal(mapPortalStatus(401, {}).status, 502);
  assert.equal(mapPortalStatus(403, {}).status, 502);
  assert.equal(mapPortalStatus(500, {}).status, 504);
  assert.deepEqual(mapPortalStatus(200, { a: 1 }), { status: 200, body: { a: 1 }, mapped: false });
  assert.deepEqual(mapPortalStatus(400, { error: "invalid-input" }), { status: 400, body: { error: "invalid-input" }, mapped: false });
});

test("a timeout -> 504 portal-timeout; a network error -> 504 portal-unreachable", async () => {
  assert.equal(PORTAL_TIMEOUT_MS, 10_000);
  const slow = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const r1 = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl: slow, timeoutMs: 20 })("/api/admin/me", { actor: "a@b.co" });
  assert.equal(r1.status, 504);
  assert.equal(r1.body.error, "portal-timeout");
  const down = async () => { throw new TypeError("fetch failed"); };
  const r2 = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl: down })("/api/admin/me", { actor: "a@b.co" });
  assert.equal(r2.status, 504);
  assert.equal(r2.body.error, "portal-unreachable");
});

test("a non-JSON 200 from the portal is a 502, never raw HTML to the browser", async () => {
  const fetchImpl = async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } });
  const r = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl })("/api/admin/me", { actor: "a@b.co" });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, "portal-bad-json");
});

test("an empty body (204) passes through with a null body", async () => {
  const fetchImpl = async () => new Response(null, { status: 204 });
  const r = await createPortalClient({ baseUrl: "https://p", token: "t", fetchImpl })("/api/admin/me", { actor: "a@b.co" });
  assert.equal(r.status, 204);
  assert.equal(r.body, null);
});

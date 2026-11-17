import { test } from "node:test";
import assert from "node:assert/strict";
import { adminOrigins, checkSameOriginJson, isJsonContentType } from "../src/lib/same-origin.ts";

const ADMIN = "https://admin.jazaix.com";
const req = (over = {}) => ({ origin: ADMIN, secFetchSite: "same-origin", contentType: "application/json", requestOrigin: ADMIN, ...over });

test("a same-origin JSON request passes", () => {
  assert.equal(checkSameOriginJson(req(), [ADMIN]), null);
  assert.equal(checkSameOriginJson(req({ contentType: "application/json; charset=utf-8" }), [ADMIN]), null);
  assert.equal(checkSameOriginJson(req({ secFetchSite: null }), [ADMIN]), null);
  assert.equal(checkSameOriginJson(req({ origin: "HTTPS://ADMIN.JAZAIX.COM" }), [ADMIN]), null);
});

test("a missing or foreign Origin is a 403 bad-origin", () => {
  assert.deepEqual(checkSameOriginJson(req({ origin: null }), [ADMIN]), { ok: false, status: 403, error: "bad-origin" });
  assert.deepEqual(checkSameOriginJson(req({ origin: "https://evil.example" }), [ADMIN]), { ok: false, status: 403, error: "bad-origin" });
  assert.deepEqual(checkSameOriginJson(req({ origin: "not a url" }), [ADMIN]), { ok: false, status: 403, error: "bad-origin" });
  // the portal's origin is NOT this app's origin: a page on the portal cannot write here
  assert.equal(checkSameOriginJson(req({ origin: "https://play.jazaix.com" }), [ADMIN])?.status, 403);
});

test("the origin the request was addressed to is accepted even when AUTH_URL is unset (local run)", () => {
  assert.equal(checkSameOriginJson(req({ origin: "http://127.0.0.1:3400", requestOrigin: "http://127.0.0.1:3400" }), []), null);
  assert.equal(checkSameOriginJson(req({ origin: "http://127.0.0.1:3400", requestOrigin: "http://127.0.0.1:3401" }), [])?.status, 403);
});

test("Sec-Fetch-Site other than same-origin is a 403", () => {
  assert.equal(checkSameOriginJson(req({ secFetchSite: "cross-site" }), [ADMIN])?.status, 403);
  assert.equal(checkSameOriginJson(req({ secFetchSite: "same-site" }), [ADMIN])?.status, 403);
  assert.equal(checkSameOriginJson(req({ secFetchSite: "none" }), [ADMIN])?.status, 403);
});

test("a non-JSON body is a 415 json-required (form posts cannot write)", () => {
  assert.deepEqual(checkSameOriginJson(req({ contentType: "application/x-www-form-urlencoded" }), [ADMIN]), { ok: false, status: 415, error: "json-required" });
  assert.deepEqual(checkSameOriginJson(req({ contentType: "text/plain" }), [ADMIN]), { ok: false, status: 415, error: "json-required" });
  assert.equal(checkSameOriginJson(req({ contentType: null }), [ADMIN])?.status, 415);
  assert.equal(isJsonContentType("Application/JSON"), true);
  assert.equal(isJsonContentType("application/json-patch+json"), false);
});

test("adminOrigins comes from AUTH_URL / NEXTAUTH_URL only and ignores a malformed value", () => {
  assert.deepEqual(adminOrigins({ AUTH_URL: "https://admin.jazaix.com/" }), [ADMIN]);
  assert.deepEqual(adminOrigins({ AUTH_URL: "nope", NEXTAUTH_URL: "http://localhost:3400/x" }), ["http://localhost:3400"]);
  assert.deepEqual(adminOrigins({}), []);
});

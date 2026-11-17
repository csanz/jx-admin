import { test } from "node:test";
import assert from "node:assert/strict";
import { ENV_NAMES, EnvError, portalUrlIfSet, readEnv, validateEnv } from "../src/lib/env.ts";

const FULL = {
  AUTH_SECRET: "s3cret-value-xyz",
  AUTH_URL: "https://admin.jazaix.com",
  GOOGLE_CLIENT_ID: "cid-value",
  GOOGLE_CLIENT_SECRET: "csecret-value",
  JX_DEVELOPER_EMAILS: "owner@jazaix.com",
  JX_PORTAL_URL: "https://play.jazaix.com/",
  JX_ADMIN_API_TOKEN: "token-value-abc",
};

test("the seven names are exactly the ones in .env.example", async () => {
  const fs = await import("node:fs");
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const names = [...example.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]).sort();
  assert.deepEqual(names, [...ENV_NAMES].sort());
});

test("a complete env validates and trims the portal URL's trailing slash", () => {
  const r = validateEnv(FULL);
  assert.equal(r.ok, true);
  assert.equal(r.config.portalUrl, "https://play.jazaix.com");
  assert.equal(r.config.adminApiToken, "token-value-abc");
});

test("missing names are listed, every one of them, and values never appear", () => {
  const r = validateEnv({ ...FULL, AUTH_SECRET: "", JX_ADMIN_API_TOKEN: undefined, JX_PORTAL_URL: "   " });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["AUTH_SECRET", "JX_PORTAL_URL", "JX_ADMIN_API_TOKEN"]);
  assert.throws(() => readEnv({ ...FULL, GOOGLE_CLIENT_SECRET: "" }), EnvError);
  let err;
  try { readEnv({ ...FULL, GOOGLE_CLIENT_SECRET: "" }); } catch (x) { err = x; }
  assert.ok(err instanceof EnvError);
  assert.deepEqual(err.missing, ["GOOGLE_CLIENT_SECRET"]);
  assert.match(err.message, /GOOGLE_CLIENT_SECRET/);
  for (const v of Object.values(FULL)) assert.equal(err.message.includes(v), false, `value leaked: ${v}`);
});

test("an empty env lists all seven names", () => {
  const r = validateEnv({});
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [...ENV_NAMES]);
});

test("a malformed portal URL is reported by name", () => {
  const r = validateEnv({ ...FULL, JX_PORTAL_URL: "play.jazaix.com" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["JX_PORTAL_URL (not a URL)"]);
});

test("portalUrlIfSet gives the origin or null, never throws", () => {
  assert.equal(portalUrlIfSet({ JX_PORTAL_URL: "https://play.jazaix.com/api" }), "https://play.jazaix.com");
  assert.equal(portalUrlIfSet({ JX_PORTAL_URL: "nope" }), null);
  assert.equal(portalUrlIfSet({}), null);
});

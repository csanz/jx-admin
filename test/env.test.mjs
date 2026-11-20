import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMAIL_FROM, DEFAULT_MONGODB_DB, ENV_NAMES, EnvError, OPTIONAL_ENV_NAMES, REQUIRED_ENV_NAMES,
  clipsApiUrlIfSet, mongoIfSet, portalLinked, portalUrlIfSet, readEnv, validateEnv,
} from "../src/lib/env.ts";

const REQUIRED = {
  AUTH_SECRET: "s3cret-value-xyz",
  AUTH_URL: "https://admin.jazaix.com",
  GOOGLE_CLIENT_ID: "cid-value",
  GOOGLE_CLIENT_SECRET: "csecret-value",
  JX_DEVELOPER_EMAILS: "owner@jazaix.com",
  MONGODB_URI: "mongodb://localhost:27018/jx_portal?replicaSet=jx-db-local-rs&directConnection=true",
};
const FULL = {
  ...REQUIRED,
  MONGODB_DB: "jx_portal_other",
  JX_PORTAL_URL: "https://play.jazaix.com/",
  JX_ADMIN_API_TOKEN: "token-value-abc",
  RESEND_API_KEY: "re_key_value",
  JX_EMAIL_FROM: "Jazaix <hello@updates.jazaix.com>",
  JX_EMAIL_REPLY_TO: "support@jazaix.com",
};

test("the names are exactly the ones in .env.example, required first", async () => {
  const fs = await import("node:fs");
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const names = [...example.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]);
  assert.deepEqual([...names].sort(), [...ENV_NAMES].sort());
  assert.deepEqual(REQUIRED_ENV_NAMES, ["AUTH_SECRET", "AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JX_DEVELOPER_EMAILS", "MONGODB_URI"]);
  assert.deepEqual(OPTIONAL_ENV_NAMES, ["MONGODB_DB", "JX_PORTAL_URL", "JX_ADMIN_API_TOKEN", "RESEND_API_KEY", "JX_EMAIL_FROM", "JX_EMAIL_REPLY_TO", "JX_CLIPS_API_URL"]);
});

test("JX_CLIPS_API_URL: optional, an http(s) origin without its trailing slash; anything else is named, never a value", () => {
  assert.equal(validateEnv(REQUIRED).config.clipsApiUrl, null);
  assert.equal(validateEnv({ ...REQUIRED, JX_CLIPS_API_URL: "https://clips-api.jazaix.com/" }).config.clipsApiUrl, "https://clips-api.jazaix.com");
  assert.equal(validateEnv({ ...REQUIRED, JX_CLIPS_API_URL: " http://127.0.0.1:6116 " }).config.clipsApiUrl, "http://127.0.0.1:6116");
  const bad = validateEnv({ ...REQUIRED, JX_CLIPS_API_URL: "clips-api.jazaix.com" });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.missing, ["JX_CLIPS_API_URL (not an http(s) URL)"]);
  assert.equal(validateEnv({ ...REQUIRED, JX_CLIPS_API_URL: "ftp://x" }).ok, false);
  assert.equal(clipsApiUrlIfSet({}), null);
  assert.equal(clipsApiUrlIfSet({ JX_CLIPS_API_URL: "" }), null);
  assert.equal(clipsApiUrlIfSet({ JX_CLIPS_API_URL: "https://clips-api.jazaix.com//" }), "https://clips-api.jazaix.com");
  assert.equal(clipsApiUrlIfSet({ JX_CLIPS_API_URL: "nope" }), null);
});

test("the required six alone validate: Mongo on, portal link off, email off, db name defaulted", () => {
  const r = validateEnv(REQUIRED);
  assert.equal(r.ok, true);
  assert.equal(r.config.mongoUri, REQUIRED.MONGODB_URI);
  assert.equal(r.config.mongoDbName, DEFAULT_MONGODB_DB);
  assert.equal(DEFAULT_MONGODB_DB, "jx_portal");
  assert.equal(r.config.portal, null);
  assert.equal(r.config.email, null);
});

test("a complete env validates: portal URL trimmed of its trailing slash, email config with reply-to", () => {
  const r = validateEnv(FULL);
  assert.equal(r.ok, true);
  assert.deepEqual(r.config.portal, { url: "https://play.jazaix.com", token: "token-value-abc" });
  assert.deepEqual(r.config.email, { resendApiKey: "re_key_value", from: FULL.JX_EMAIL_FROM, replyTo: "support@jazaix.com" });
  assert.equal(r.config.mongoDbName, "jx_portal_other");
});

test("RESEND_API_KEY alone turns email on with the portal's default From", () => {
  const r = validateEnv({ ...REQUIRED, RESEND_API_KEY: "re_x" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.config.email, { resendApiKey: "re_x", from: DEFAULT_EMAIL_FROM, replyTo: null });
});

test("the portal pair is both or neither, and the odd one out is named", () => {
  const a = validateEnv({ ...REQUIRED, JX_PORTAL_URL: "https://play.jazaix.com" });
  assert.equal(a.ok, false);
  assert.deepEqual(a.missing, ["JX_ADMIN_API_TOKEN (JX_PORTAL_URL is set: both or neither)"]);
  const b = validateEnv({ ...REQUIRED, JX_ADMIN_API_TOKEN: "tok" });
  assert.equal(b.ok, false);
  assert.deepEqual(b.missing, ["JX_PORTAL_URL (JX_ADMIN_API_TOKEN is set: both or neither)"]);
  assert.equal(portalLinked({ ...REQUIRED, JX_PORTAL_URL: "https://play.jazaix.com" }), false);
  assert.equal(portalLinked(FULL), true);
  assert.equal(portalLinked(REQUIRED), false);
});

test("missing names are listed, every one of them, and values never appear", () => {
  const r = validateEnv({ ...FULL, AUTH_SECRET: "", MONGODB_URI: undefined, JX_DEVELOPER_EMAILS: "   " });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["AUTH_SECRET", "JX_DEVELOPER_EMAILS", "MONGODB_URI"]);
  let err;
  try { readEnv({ ...FULL, GOOGLE_CLIENT_SECRET: "" }); } catch (x) { err = x; }
  assert.ok(err instanceof EnvError);
  assert.deepEqual(err.missing, ["GOOGLE_CLIENT_SECRET"]);
  assert.match(err.message, /GOOGLE_CLIENT_SECRET/);
  for (const v of Object.values(FULL)) assert.equal(err.message.includes(v), false, `value leaked: ${v}`);
});

test("an empty env lists the six required names and nothing optional", () => {
  const r = validateEnv({});
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [...REQUIRED_ENV_NAMES]);
});

test("a malformed portal URL or Mongo URI is reported by name", () => {
  const a = validateEnv({ ...FULL, JX_PORTAL_URL: "play.jazaix.com" });
  assert.equal(a.ok, false);
  assert.deepEqual(a.missing, ["JX_PORTAL_URL (not a URL)"]);
  const b = validateEnv({ ...REQUIRED, MONGODB_URI: "localhost:27018" });
  assert.equal(b.ok, false);
  assert.deepEqual(b.missing, ["MONGODB_URI (not a mongodb:// or mongodb+srv:// URI)"]);
  assert.equal(validateEnv({ ...REQUIRED, MONGODB_URI: "mongodb+srv://u:p@cluster0.example.mongodb.net/jx_portal" }).ok, true);
});

test("portalUrlIfSet and mongoIfSet give the config or null, never throw", () => {
  assert.equal(portalUrlIfSet({ JX_PORTAL_URL: "https://play.jazaix.com/api" }), "https://play.jazaix.com");
  assert.equal(portalUrlIfSet({ JX_PORTAL_URL: "nope" }), null);
  assert.equal(portalUrlIfSet({}), null);
  assert.deepEqual(mongoIfSet({ MONGODB_URI: "mongodb://h/x" }), { uri: "mongodb://h/x", dbName: "jx_portal" });
  assert.deepEqual(mongoIfSet({ MONGODB_URI: "mongodb://h/x", MONGODB_DB: "other" }), { uri: "mongodb://h/x", dbName: "other" });
  assert.equal(mongoIfSet({ MONGODB_URI: "nope" }), null);
  assert.equal(mongoIfSet({}), null);
});

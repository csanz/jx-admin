/**
 * Source pin: every route handler under src/app/api goes through the admin gate (src/lib/require-admin.ts).
 * Two exceptions, by name: Auth.js's own endpoints (how one signs in at all) and /api/health (no auth by design,
 * and it must not leak config). Anything else without the import fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const API = path.join(ROOT, "src/app/api");
const EXEMPT = new Set(["auth/[...nextauth]/route.ts", "health/route.ts"]);

function routeFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

test("every src/app/api/**/route.ts imports the admin gate (except the two named exceptions)", () => {
  const files = routeFiles(API).map((f) => path.relative(API, f)).sort();
  assert.ok(files.length >= 8, `expected the known routes, found ${files.length}`);
  const expected = ["auth/[...nextauth]/route.ts", "health/route.ts", "jbox/hold/route.ts", "jbox/refund/route.ts", "jbox/report/route.ts", "me/route.ts", "users/route.ts", "waitlist/route.ts"];
  assert.deepEqual(files, expected);
  for (const rel of files) {
    const src = fs.readFileSync(path.join(API, rel), "utf8");
    if (EXEMPT.has(rel)) {
      assert.doesNotMatch(src, /require-admin/, `${rel} is exempt and must not pretend to be gated`);
      continue;
    }
    assert.match(src, /from "@\/lib\/require-admin"/, `${rel} must import the gate`);
    assert.match(src, /requireAdminApi\(req, \{ write: (true|false) \}\)/, `${rel} must call requireAdminApi`);
    for (const m of src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)) {
      const method = m[1];
      const fn = src.slice(m.index, src.indexOf("\n}", m.index));
      assert.match(fn, /requireAdminApi\(req, \{ write: (true|false) \}\)/, `${rel} ${method} must call requireAdminApi`);
      if (method !== "GET") assert.match(fn, /write: true/, `${rel} ${method} is a write and must pass write: true`);
      else assert.match(fn, /write: false/, `${rel} GET passes write: false`);
    }
  }
});

test("the health route never reads the token, the secret or the Mongo URI", () => {
  const src = fs.readFileSync(path.join(API, "health/route.ts"), "utf8");
  assert.doesNotMatch(src, /JX_ADMIN_API_TOKEN|AUTH_SECRET|GOOGLE_CLIENT|MONGODB_URI|readEnv/);
});

test("the repo modules have no framework imports (node runs them directly)", () => {
  const dir = path.join(ROOT, "src/lib/repo");
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(src, /from "(next|next\/[^"]*|react|next-auth[^"]*)"/, `${f} must not import a framework`);
    assert.doesNotMatch(src, /process\.env/, `${f} must not read env; it takes a Db`);
  }
});

test("the money mutations are never ported: refund and hold go through the portal link", () => {
  for (const rel of ["jbox/refund/route.ts", "jbox/hold/route.ts"]) {
    const src = fs.readFileSync(path.join(API, rel), "utf8");
    assert.match(src, /proxyToPortal\("\/api\/admin\/jbox\/(refund|hold)"/, `${rel} must call the portal`);
    assert.doesNotMatch(src, /mongoDb|lib\/mongo|lib\/repo/, `${rel} must not touch the database`);
  }
  const repoDir = path.join(ROOT, "src/lib/repo");
  for (const f of fs.readdirSync(repoDir)) {
    const src = fs.readFileSync(path.join(repoDir, f), "utf8");
    assert.doesNotMatch(src, /collection\("wallets"\)\.(updateOne|findOneAndUpdate|insertOne|bulkWrite)|collection\("credit_transactions"\)\.(insertOne|updateOne)/, `${f} must not write money rows`);
  }
});

test("no browser-facing module imports the portal client", () => {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  };
  for (const f of walk(path.join(ROOT, "src"))) {
    const src = fs.readFileSync(f, "utf8");
    if (/^\s*["']use client["']/m.test(src)) {
      assert.doesNotMatch(src, /lib\/portal|lib\/env|lib\/auth|lib\/mongo|lib\/repo|JX_ADMIN_API_TOKEN|MONGODB_URI/, `${path.relative(ROOT, f)} is a client module and must not touch the portal client, the database, env or auth`);
    }
  }
});

const EM_DASH = String.fromCharCode(0x2014);

test("no em dash anywhere in the repo's own files", () => {
  const skip = new Set(["node_modules", ".next", ".git", "package-lock.json"]);
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  for (const f of walk(ROOT)) {
    const src = fs.readFileSync(f, "utf8");
    assert.equal(src.includes(EM_DASH), false, `${path.relative(ROOT, f)} contains an em dash`);
  }
});

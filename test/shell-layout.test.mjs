/**
 * Source pins for the console shell and the sidebar tree:
 *   - every page under src/app renders inside the shell: it lives under the (console) route group, whose layout
 *     renders <Shell>; only /sign-in sits outside it; the root layout renders no chrome of its own;
 *   - every console page renders through the admin gate;
 *   - /waitlist redirects to /users/waitlist (next.config.ts), and no page is left at the old route;
 *   - the sidebar tree (src/lib/nav.ts) lists the sections and routes the README documents, and each one has a page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NAV, OVERVIEW, activeHref, allNavItems, navTrail } from "../src/lib/nav.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const APP = path.join(ROOT, "src/app");
const GROUP = "(console)";

function pages(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name === "page.tsx") out.push(path.relative(APP, p));
  }
  return out;
}

test("every page except sign-in lives in the (console) group, whose layout renders the shell", () => {
  const all = pages(APP).sort();
  assert.ok(all.length >= 9, `expected the console pages, found ${all.length}`);
  const outside = all.filter((p) => !p.startsWith(`${GROUP}${path.sep}`));
  assert.deepEqual(outside, ["sign-in/page.tsx"]);
  const layout = fs.readFileSync(path.join(APP, GROUP, "layout.tsx"), "utf8");
  assert.match(layout, /import \{ Shell \} from "@\/components\/Shell"/);
  assert.match(layout, /<Shell>\{children\}<\/Shell>/);
  const shell = fs.readFileSync(path.join(ROOT, "src/components/Shell.tsx"), "utf8");
  assert.match(shell, /<SidebarFrame/);
  const root = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
  assert.doesNotMatch(root, /Shell|SidebarFrame|TopBar/, "the root layout carries no chrome (sign-in stays plain)");
  assert.equal(fs.existsSync(path.join(ROOT, "src/components/TopBar.tsx")), false, "the old top bar is gone");
});

test("every console page renders through the admin gate", () => {
  for (const p of pages(path.join(APP, GROUP))) {
    const src = fs.readFileSync(path.join(APP, p), "utf8");
    assert.match(src, /return gatedPage\(/, `${p} must render through gatedPage`);
  }
});

test("/waitlist redirects to /users/waitlist and no page is left at the old route", async () => {
  assert.equal(fs.existsSync(path.join(APP, "waitlist")), false);
  assert.equal(fs.existsSync(path.join(APP, GROUP, "waitlist")), false);
  const { default: config } = await import("../next.config.ts");
  const redirects = await config.redirects();
  const r = redirects.find((x) => x.source === "/waitlist");
  assert.ok(r, "a /waitlist redirect exists");
  assert.equal(r.destination, "/users/waitlist");
  assert.equal(r.permanent, true);
});

test("the sidebar tree: Users (List, Waitlist), Games (Overview, List, Rooms), Assets (Registry), JBux (Purchases, Catalog, Sellers, Wallets, Ledger), Audit", () => {
  assert.deepEqual(
    NAV.map((s) => [s.label, s.items.map((i) => `${i.label} ${i.href}`)]),
    [
      ["Users", ["List /users", "Waitlist /users/waitlist"]],
      ["Games", ["Overview /games/overview", "List /games", "Rooms /games/rooms"]],
      ["Assets", ["Registry /assets"]],
      ["JBux", ["Purchases /jbux", "Catalog /jbux/catalog", "Sellers /jbux/sellers", "Wallets /jbux/wallets", "Ledger /jbux/ledger"]],
      ["Audit", ["Admin actions /audit"]],
    ],
  );
  assert.equal(OVERVIEW.href, "/");
  // every link in the tree has a page in the console group
  for (const item of allNavItems()) {
    const file = path.join(APP, GROUP, item.href.replace(/^\//, ""), "page.tsx");
    assert.ok(fs.existsSync(file), `${item.href} has no page (${path.relative(ROOT, file)})`);
  }
  // the README documents the same routes
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  for (const item of allNavItems()) assert.ok(readme.includes(`\`${item.href}\``), `README Navigation must list ${item.href}`);
});

test("activeHref and navTrail: the longest matching item wins, detail pages light their list", () => {
  assert.equal(activeHref("/"), "/");
  assert.equal(activeHref("/users"), "/users");
  assert.equal(activeHref("/users/waitlist"), "/users/waitlist");
  assert.equal(activeHref("/users/waitlist?status=approved"), "/users/waitlist");
  assert.equal(activeHref("/games/last-minute"), "/games");
  assert.equal(activeHref("/games/"), "/games");
  assert.equal(activeHref("/gamesx"), null);
  assert.equal(activeHref("/games/rooms/lm-dev"), "/games/rooms");
  assert.equal(activeHref("/games/overview?activity=7"), "/games/overview");
  assert.equal(activeHref("/jbux/sellers/jazaix"), "/jbux/sellers");
  assert.equal(activeHref("/jbux"), "/jbux");
  assert.equal(activeHref("/users/6ae204d8c05a94f95f234732"), "/users");
  assert.equal(activeHref("/sign-in"), null);
  assert.deepEqual(navTrail("/games/last-minute"), { section: "Games", item: "List" });
  assert.deepEqual(navTrail("/users/waitlist"), { section: "Users", item: "Waitlist" });
  assert.deepEqual(navTrail("/audit"), { section: "Audit", item: "Admin actions" });
});

test("the favicon is the orange Jazaix mark, referenced from the root layout", () => {
  const root = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
  assert.match(root, /icons: \{ icon: "\/favicon\.ico", apple: "\/apple-touch-icon\.png" \}/);
  const ico = fs.readFileSync(path.join(ROOT, "public/favicon.ico"));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], "favicon.ico is an ICO file");
  const png = fs.readFileSync(path.join(ROOT, "public/apple-touch-icon.png"));
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG");
  assert.equal(fs.existsSync(path.join(APP, "favicon.ico")), false, "no app/favicon.ico overriding it");
});

test("only an admin gets the sidebar: the shell gates first, a non-admin gets the plain forbidden page with no tree", () => {
  const shell = fs.readFileSync(path.join(ROOT, "src/components/Shell.tsx"), "utf8");
  assert.match(shell, /const g = await requireAdminPage\(\)/, "the shell runs the gate itself");
  assert.match(shell, /if \(g\.kind === "signed-out"\) redirect\(SIGN_IN_PAGE\)/);
  assert.match(shell, /if \(g\.kind === "not-admin"\) \{\s*return \(\s*<PlainFrame bare>\s*<Forbidden \/>/, "a non-admin gets the bare plain frame + Forbidden");
  assert.match(shell, /if \(g\.kind === "config-error"\) \{\s*return \(\s*<PlainFrame>\s*<ConfigError /);
  // the sidebar frame is mounted once, after every non-admin branch has returned, and the children with it
  const sidebarAt = shell.indexOf("<SidebarFrame");
  const forbiddenAt = shell.indexOf("<Forbidden");
  assert.ok(sidebarAt > forbiddenAt && forbiddenAt > 0, "SidebarFrame renders only on the admin path");
  assert.equal(shell.match(/<SidebarFrame/g).length, 1);
  assert.match(shell, /<SidebarFrame account=\{account\} theme=\{theme\} signOut=\{signOutAction\}>\s*\{children\}\s*<\/SidebarFrame>/);
  assert.doesNotMatch(shell.slice(0, sidebarAt).replace(/^\s*\*.*$/gm, ""), /\{children\}/, "children never render before the admin branch");
  // the sidebar frame always shows the tree (no showNav switch to get wrong) and the plain frame never imports it
  const frame = fs.readFileSync(path.join(ROOT, "src/components/SidebarFrame.tsx"), "utf8");
  assert.doesNotMatch(frame, /showNav/);
  assert.match(frame, /<nav aria-label="Sections"/);
  const plain = fs.readFileSync(path.join(ROOT, "src/components/PlainFrame.tsx"), "utf8");
  assert.doesNotMatch(plain, /nav\.ts|SidebarFrame|NAV\b|OVERVIEW/, "the plain frame has no section tree");
  // the wording the owner asked for, and the sign-in page uses the same plain frame
  const gate = fs.readFileSync(path.join(ROOT, "src/components/AdminGate.tsx"), "utf8");
  const forbidden = gate.slice(gate.indexOf("export function Forbidden"), gate.indexOf("export function ConfigError"));
  assert.match(forbidden, /Access forbidden/);
  assert.match(forbidden, /href=\{HOME_URL\}/, "a link back to the home page");
  assert.doesNotMatch(forbidden, /admin|email|message|Sign out/i, "the forbidden page gives nothing away");
  assert.doesNotMatch(gate, /Not an admin/);
  const signIn = fs.readFileSync(path.join(APP, "sign-in/page.tsx"), "utf8");
  assert.match(signIn, /<PlainFrame>/);
  // the gate decision is cached per request, so the shell and the page share one database read
  const req = fs.readFileSync(path.join(ROOT, "src/lib/require-admin.ts"), "utf8");
  assert.match(req, /import \{ cache \} from "react"/);
  assert.match(req, /export const requireAdminPage = cache\(/);
});

test("server pages never call a helper exported from a 'use client' module (roleLabel lives in src/lib/roles.ts)", () => {
  const roles = fs.readFileSync(path.join(ROOT, "src/lib/roles.ts"), "utf8");
  assert.match(roles, /export const roleLabel/);
  assert.doesNotMatch(roles, /"use client"/);
  const control = fs.readFileSync(path.join(ROOT, "src/components/RoleControl.tsx"), "utf8");
  assert.match(control, /^"use client";/);
  assert.doesNotMatch(control, /export const roleLabel|export function roleLabel/);
  // every server page that uses roleLabel imports it from the plain module
  for (const p of pages(path.join(APP, GROUP))) {
    const src = fs.readFileSync(path.join(APP, p), "utf8");
    if (/roleLabel\(/.test(src)) assert.match(src, /import \{ roleLabel \} from "@\/lib\/roles"/, `${p} imports roleLabel from @/lib/roles`);
    assert.doesNotMatch(src, /import \{[^}]*\broleLabel\b[^}]*\} from "@\/components\/RoleControl"/, `${p} must not import roleLabel from the client module`);
  }
  // the Sellers list: the seller's name opens the seller's sales, not the user page
  const sellers = fs.readFileSync(path.join(APP, GROUP, "jbux/sellers/page.tsx"), "utf8");
  assert.match(sellers, /<PersonCell person=\{s\.person\} portalUrl=\{portalUrl\} href=\{sellerHref\} \/>/);
  assert.match(sellers, /href=\{`\/users\/\$\{s\.person\.id\}`\}[^>]*>User page</);
});

test("the unconfigured page and the API say nothing about what is missing; the names go to the server log only (owner 2026-11-18)", () => {
  const gate = fs.readFileSync(path.join(ROOT, "src/components/AdminGate.tsx"), "utf8");
  const cfg = gate.slice(gate.indexOf("export function ConfigError"));
  assert.match(cfg, /The console is unavailable right now/);
  assert.match(cfg, /href=\{HOME_URL\}/, "a link back to the home page, like the forbidden page");
  assert.doesNotMatch(cfg, /missing|\.map\(|MONGODB|AUTH_|GOOGLE_|JX_|env\.example|README/, "no variable names, no hints");
  assert.match(gate, /if \(g\.kind === "config-error"\) return <ConfigError \/>;/);
  assert.match(fs.readFileSync(path.join(ROOT, "src/components/Shell.tsx"), "utf8"), /<PlainFrame>\s*<ConfigError \/>/);
  const req = fs.readFileSync(path.join(ROOT, "src/lib/require-admin.ts"), "utf8");
  assert.doesNotMatch(req, /e\.missing\.join/, "the API answer never lists the names");
  assert.match(req, /jsonError\("config-missing", 503, "The console is not configured\."\)/);
  assert.match(req, /console\.error\(`\[jx-admin\] \$\{e\.message\}`\)/, "the server log keeps them");
});

test("the mark is the portal's own logo file through a mask, never a traced vector", () => {
  const brand = fs.readFileSync(path.join(ROOT, "src/components/Brand.tsx"), "utf8");
  assert.match(brand, /className=\{`jx-mark \$\{className\}`\}/);
  assert.doesNotMatch(brand, /JX_MARK_PATH|<path|<svg/, "no hand-traced vector");
  const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  assert.match(css, /\.jx-mark \{[\s\S]*?mask: url\("\/images\/logo\/logo-icon-dark\.png"\) no-repeat center \/ contain;[\s\S]*?aspect-ratio: 1250 \/ 1068;/);
  assert.ok(fs.existsSync(path.join(ROOT, "public/images/logo/logo-icon-dark.png")), "the portal's icon file is in public/");
  assert.equal(fs.existsSync(path.join(ROOT, "public/brand/jx-mark-v2.svg")), false, "the wrong vector is gone");
  // byte-identical to the portal's file when the portal checkout is beside this repo
  const portalPng = path.resolve(ROOT, "../jx-portal/public/images/logo/logo-icon-dark.png");
  if (fs.existsSync(portalPng)) assert.ok(fs.readFileSync(portalPng).equals(fs.readFileSync(path.join(ROOT, "public/images/logo/logo-icon-dark.png"))), "same bytes as the portal's logo");
});

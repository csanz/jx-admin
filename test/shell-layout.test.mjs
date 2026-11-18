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

test("the sidebar tree: Users (List, Waitlist), Games (List, Rooms), Assets (Registry), JBux (Purchases, Catalog, Sellers, Wallets, Ledger), Audit", () => {
  assert.deepEqual(
    NAV.map((s) => [s.label, s.items.map((i) => `${i.label} ${i.href}`)]),
    [
      ["Users", ["List /users", "Waitlist /users/waitlist"]],
      ["Games", ["List /games", "Rooms /games/rooms"]],
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

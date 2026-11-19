/**
 * Source pins for the owner's 2026-11-17 corrections:
 *   - the theme tokens equal the portal's (jx-portal/src/app/globals.css), dark and light, and the admin accent is the
 *     notice orange;
 *   - the lockup uses the portal's mark (currentColor) in the admin colour, the assets live in this repo;
 *   - one header band height for the sidebar logo row and the page header crumb row;
 *   - avatars never show a broken image (onError fallback);
 *   - no inner horizontal scroll container anywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { avatarSrc, initialOf } from "../src/lib/avatar.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PORTAL_CSS = path.resolve(ROOT, "../jx-portal/src/app/globals.css");

/** The --color-* / --font-* declarations of the @theme block and of the [data-theme="light"] block. */
function tokens(css) {
  const block = (re) => {
    const m = css.match(re);
    assert.ok(m, `block ${re} found`);
    const out = {};
    for (const d of m[1].matchAll(/--((?:color|font)-[a-z0-9-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
    return out;
  };
  return { dark: block(/@theme\s*\{([\s\S]*?)\n\}/), light: block(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/) };
}

test("the theme tokens are the portal's, value for value, dark and light", { skip: fs.existsSync(PORTAL_CSS) ? false : "jx-portal is not checked out next to jx-admin" }, () => {
  const portal = tokens(fs.readFileSync(PORTAL_CSS, "utf8"));
  const admin = tokens(read("src/app/globals.css"));
  assert.ok(Object.keys(portal.dark).length >= 15);
  for (const theme of ["dark", "light"]) {
    for (const [k, v] of Object.entries(portal[theme])) assert.equal(admin[theme][k], v, `${theme} --${k}`);
  }
  assert.equal(portal.dark["color-notice"], "#f25a1a");
  assert.equal(portal.light["color-notice"], "#c2410c");
});

test("the admin accent is the notice orange in both themes; the fonts load like the portal's", () => {
  const css = read("src/app/globals.css");
  const admin = tokens(css);
  assert.equal(admin.dark["color-admin"], "var(--color-notice)");
  assert.equal(admin.light["color-admin"], "var(--color-notice)");
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /Geist\(\{ subsets: \["latin"\], variable: "--font-sans" \}\)/);
  assert.match(layout, /JetBrains_Mono\(\{ subsets: \["latin"\], variable: "--font-mono" \}\)/);
  assert.match(layout, /font-mono antialiased/);
  // no component draws with the green accent: primary actions, links, focus and the active item are the admin colour
  for (const f of files(path.join(ROOT, "src"))) {
    if (!f.endsWith(".tsx")) continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /(?:bg|text|border|ring|outline)-accent\b/, `${path.relative(ROOT, f)} uses the portal's green accent`);
  }
});

test("the lockup: the portal's own logo file as the mark (masked, admin coloured), wordmark + assets copied into public/", () => {
  const brand = read("src/components/Brand.tsx");
  assert.match(brand, /jx-mark \$\{className\}/, "the mark is the masked logo file (test/shell-layout.test.mjs pins the file and the rule)");
  assert.match(brand, /text-admin/);
  assert.match(brand, /jx-wordmark/);
  assert.ok(fs.existsSync(path.join(ROOT, "public/brand/jazaix-wordmark.png")));
  assert.match(read("src/components/SidebarFrame.tsx"), /<JxMark className="h-8 w-auto text-admin" \/>/, "the rail draws the mark alone, in the admin colour");
  assert.match(read("src/components/PlainFrame.tsx"), /<Brand plain \/>/);
  assert.match(read("src/app/sign-in/page.tsx"), /<PlainFrame>/);
  assert.doesNotMatch(brand + read("src/app/sign-in/page.tsx") + read("src/components/PlainFrame.tsx"), /play\.jazaix\.com/, "no hotlinking the portal");
});

test("one header band: the rail logo row (pt-6 + the 40 px mark-and-toggle row + pb-4 = 80 px), the page crumb row and the plain strip share h-header; the title row is the account row", () => {
  assert.match(read("src/app/globals.css"), /--spacing-header: 5rem;/);
  const frame = read("src/components/SidebarFrame.tsx");
  assert.match(frame, /pt-6 pb-4 shrink-0 flex/);
  assert.match(frame, /<JxMark className="h-8 w-auto text-admin" \/>/);
  assert.doesNotMatch(frame, /py-6/, "no top padding above the page header band");
  assert.match(read("src/components/PageHeader.tsx"), /h-header pt-6 pb-4 flex items-center/);
  assert.match(read("src/components/PageHeader.tsx"), /min-h-10 flex flex-wrap items-center/, "the title row is the rail account row (40 px), centred");
  assert.doesNotMatch(read("src/components/PageHeader.tsx"), /border-b/, "the band has no border, like the rail's logo row");
  assert.match(read("src/components/PlainFrame.tsx"), /h-header pl-6 pr-3 flex items-center justify-between/);
});

test("avatars: absolute https kept, portal paths resolved against the portal, else the fallback; onError swaps", () => {
  assert.equal(avatarSrc("https://lh3.googleusercontent.com/a/x", null), "https://lh3.googleusercontent.com/a/x");
  assert.equal(avatarSrc("/api/images/u/1/k-96.webp", "https://play.jazaix.com/"), "https://play.jazaix.com/api/images/u/1/k-96.webp");
  assert.equal(avatarSrc("/api/images/u/1/k-96.webp", null), null);
  assert.equal(avatarSrc("//evil.example/x.png", "https://play.jazaix.com"), null);
  assert.equal(avatarSrc("javascript:alert(1)", null), null);
  assert.equal(avatarSrc("", null), null);
  assert.equal(avatarSrc(null, null), null);
  assert.equal(initialOf("", "@chris"), "C");
  assert.equal(initialOf(null, ""), "?");
  const comp = read("src/components/Avatar.tsx");
  assert.match(comp, /^"use client";/);
  assert.match(comp, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(comp, /src && !failed/);
  assert.match(comp, /initialOf\(label\)/);
  // no raw <img> for a user picture anywhere else
  for (const f of files(path.join(ROOT, "src"))) {
    if (!f.endsWith(".tsx") || f.endsWith("Avatar.tsx")) continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /<img\b/, `${path.relative(ROOT, f)} renders a raw <img>; use <Avatar>`);
  }
});

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}

test("no inner horizontal scroll container in src/app or src/components (tables fit the pane)", () => {
  for (const f of [...files(path.join(ROOT, "src/app")), ...files(path.join(ROOT, "src/components"))]) {
    if (!/\.(tsx|ts|css)$/.test(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /overflow-x-auto|overflow-x-scroll|\boverflow-auto\b|\boverflow-scroll\b/, `${path.relative(ROOT, f)} has a scroll container`);
    if (/<table\b/.test(src)) assert.match(src, /table-fixed/, `${path.relative(ROOT, f)}: tables use a fixed layout so they fit`);
  }
  assert.match(read("src/components/ListBits.tsx"), /w-full table-fixed/);
});

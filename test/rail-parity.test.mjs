/**
 * The admin's left rail is the portal's (owner 2026-11-17: same size, colour, icons and place; only the logo colour
 * differs). These pins compare the geometry and colour strings in src/components/SidebarFrame.tsx, rail-row.tsx and
 * ThemeToggle.tsx with the portal's LeftRail.tsx, AppShell.tsx and rail-row.ts when jx-portal is checked out next to
 * this repo; without it, the strings are pinned to the values copied on 2026-11-17.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PORTAL = path.resolve(ROOT, "../jx-portal/src/components");
const portal = (f) => (fs.existsSync(path.join(PORTAL, f)) ? fs.readFileSync(path.join(PORTAL, f), "utf8") : null);

const frame = read("src/components/SidebarFrame.tsx");
const row = read("src/components/rail-row.tsx");
const toggle = read("src/components/ThemeToggle.tsx");

/** The portal's string for a pin, or the copied value when the portal is not there. */
function fromPortal(file, re, fallback) {
  const src = portal(file);
  if (!src) return fallback;
  const m = src.match(re);
  assert.ok(m, `${file} still has ${re}`);
  return m[1] ?? m[0];
}

test("rail rows: the portal's railRow, expanded and collapsed, and its icon (20 px, stroke 1.6)", () => {
  const expanded = fromPortal("rail-row.ts", /: "(flex items-center gap-3\.5 [^"]+)"/, "flex items-center gap-3.5 w-full h-10 px-3 rounded-lg");
  const collapsed = fromPortal("rail-row.ts", /\? "(flex items-center justify-center [^"]+)"/, "flex items-center justify-center w-10 h-10 mx-auto rounded-lg");
  assert.ok(row.includes(`"${expanded}"`), `expanded row = ${expanded}`);
  assert.ok(row.includes(`"${collapsed}"`), `collapsed row = ${collapsed}`);
  assert.match(row, /size = 20/);
  assert.match(row, /strokeWidth="1\.6"/);
  assert.match(frame, /railRow\(effectiveCollapsed\)/);
  assert.match(toggle, /railRow\(collapsed\)/);
});

test("the aside, the widths, the logo row, the account chip, the nav, the dividers and the footer are the portal's", () => {
  const rail = portal("LeftRail.tsx");
  const pins = [
    [/className=\{`(fixed md:sticky top-0 left-0 h-screen md:h-\[100dvh\] bg-surface flex flex-col font-mono z-50 transition-all duration-200) /, "fixed md:sticky top-0 left-0 h-screen md:h-[100dvh] bg-surface flex flex-col font-mono z-50 transition-all duration-200"],
    [/"(md:w-\[72px\])"/, "md:w-[72px]"],
    [/"(md:w-\[240px\])"/, "md:w-[240px]"],
    [/"(w-\[260px\] translate-x-0)"/, "w-[260px] translate-x-0"],
    [/"(w-\[260px\] -translate-x-full md:translate-x-0)"/, "w-[260px] -translate-x-full md:translate-x-0"],
    [/`(pt-6 pb-4 shrink-0 flex) /, "pt-6 pb-4 shrink-0 flex"],
    [/"(flex-col items-center gap-2)" : "(items-center justify-between pl-6 pr-3)"/, null],
    [/className="(h-8 w-auto)"/, "h-8 w-auto"],
    [/className="(hidden md:inline-flex items-center justify-center w-10 h-10 rounded-lg text-text-muted hover:text-text hover:bg-bg\/60 transition-colors cursor-pointer)"/, "hidden md:inline-flex items-center justify-center w-10 h-10 rounded-lg text-text-muted hover:text-text hover:bg-bg/60 transition-colors cursor-pointer"],
    [/"(M4 4h16v16H4zM9 4v16M13 10l2 2-2 2)"/, "M4 4h16v16H4zM9 4v16M13 10l2 2-2 2"],
    [/"(M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2)"/, "M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2"],
    [/className="(px-3 pb-1 shrink-0)"/, "px-3 pb-1 shrink-0"],
    [/`\$\{railRow\(effectiveCollapsed\)\} (w-full text-text hover:bg-bg\/60 transition-colors)`/, "w-full text-text hover:bg-bg/60 transition-colors"],
    [/className="(flex-1 overflow-y-auto px-3 space-y-1)"/, "flex-1 overflow-y-auto px-3 space-y-1"],
    [/className="(h-px bg-border-subtle mx-2 my-3)"/, "h-px bg-border-subtle mx-2 my-3"],
    [/\? "(bg-bg text-text)"/, "bg-bg text-text"],
    [/: "(text-text-muted hover:text-text hover:bg-bg\/60)"/, "text-text-muted hover:text-text hover:bg-bg/60"],
    [/className="(p-3 pb-4 space-y-1 shrink-0)"/, "p-3 pb-4 space-y-1 shrink-0"],
    [/className="(text-sm)">\{item\.label\}/, "text-sm"],
  ];
  for (const [re, fallback] of pins) {
    let want = fallback;
    if (rail) {
      const m = rail.match(re);
      assert.ok(m, `the portal rail still has ${re}`);
      want = m.length > 2 ? m.slice(1) : m[1];
    } else if (want === null) want = ["flex-col items-center gap-2", "items-center justify-between pl-6 pr-3"];
    for (const w of [].concat(want)) assert.ok(frame.includes(w), `rail has "${w}"`);
  }
  // the account avatar is the portal's 28 px circle; the theme row shows the portal's labels
  assert.match(frame, /size=\{28\}/);
  assert.match(toggle, /"Light mode" : "Dark mode"/);
  // the only difference: the mark in the admin colour where the portal draws its logo image
  assert.match(frame, /<JxMark className="h-8 w-auto text-admin" \/>/);
  assert.doesNotMatch(frame, /jx-wordmark|ADMIN|Admin<\/span>/, "no wordmark or ADMIN tag in the rail");
  assert.doesNotMatch(frame, /text-admin(?!")/, "the admin colour is on the mark only");
  // the collapse key is the admin's own (the portal's is jx.leftrail.collapsed)
  assert.match(frame, /"jx\.admin\.leftrail\.collapsed"/);
});

test("the mobile top bar and the content column are the portal's AppShell", () => {
  const shell = portal("AppShell.tsx");
  const pins = [
    [/className="(flex min-h-screen bg-bg)"/, "flex min-h-screen bg-bg"],
    [/className="(flex-1 min-w-0 flex flex-col)"/, "flex-1 min-w-0 flex flex-col"],
    [/className="(md:hidden sticky top-0 z-30 h-12 bg-bg\/90 backdrop-blur-sm border-b border-border-subtle flex items-center px-3)"/, "md:hidden sticky top-0 z-30 h-12 bg-bg/90 backdrop-blur-sm border-b border-border-subtle flex items-center px-3"],
    [/className="(p-2 text-text-muted hover:text-text rounded cursor-pointer)"/, "p-2 text-text-muted hover:text-text rounded cursor-pointer"],
    [/className="(fixed inset-0 bg-black\/50 z-40 md:hidden)"/, "fixed inset-0 bg-black/50 z-40 md:hidden"],
  ];
  for (const [re, fallback] of pins) {
    let want = fallback;
    if (shell) {
      const m = shell.match(re) ?? portal("LeftRail.tsx")?.match(re);
      assert.ok(m, `the portal shell still has ${re}`);
      want = m[1];
    }
    assert.ok(frame.includes(want), `rail has "${want}"`);
  }
  assert.doesNotMatch(frame, /min-\[900px\]|w-60|border-r/, "the old 900 px / 240 px / bordered sidebar is gone");
});

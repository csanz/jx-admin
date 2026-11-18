/**
 * THE SIDEBAR TREE: the one place the console's sections are declared. A new section (or a sub-item) is added here
 * and nowhere else: the sidebar, the active highlight and every page header's crumb read this module.
 * Pure data and helpers, no JSX, no framework imports (node runs it in the tests). `icon` is the 24-box stroke path
 * drawn by src/components/rail-row.tsx, the portal's icon style (Games, Users and Assets are the portal's own paths).
 */

export type NavItem = { label: string; href: string };
export type NavSection = { label: string; icon: string; items: NavItem[] };

export const OVERVIEW: NavItem & { icon: string } = { label: "Overview", href: "/", icon: "M3 3v18h18M7 15l4-4 4 3 5-6" };

export const NAV: NavSection[] = [
  {
    label: "Users",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    items: [
      { label: "List", href: "/users" },
      { label: "Waitlist", href: "/users/waitlist" },
    ],
  },
  {
    label: "Games",
    icon: "M3 4.5A1.5 1.5 0 0 1 4.5 3h6A1.5 1.5 0 0 1 12 4.5v6A1.5 1.5 0 0 1 10.5 12h-6A1.5 1.5 0 0 1 3 10.5zM12 4.5A1.5 1.5 0 0 1 13.5 3h6A1.5 1.5 0 0 1 21 4.5v6A1.5 1.5 0 0 1 19.5 12h-6A1.5 1.5 0 0 1 12 10.5zM3 13.5A1.5 1.5 0 0 1 4.5 12h6A1.5 1.5 0 0 1 12 13.5v6A1.5 1.5 0 0 1 10.5 21h-6A1.5 1.5 0 0 1 3 19.5zM12 13.5A1.5 1.5 0 0 1 13.5 12h6A1.5 1.5 0 0 1 21 13.5v6A1.5 1.5 0 0 1 19.5 21h-6A1.5 1.5 0 0 1 12 19.5z",
    items: [
      { label: "List", href: "/games" },
      { label: "Rooms", href: "/games/rooms" },
    ],
  },
  {
    label: "Assets",
    icon: "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
    items: [{ label: "Registry", href: "/assets" }],
  },
  {
    label: "JBux",
    icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v12M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5",
    items: [
      { label: "Purchases", href: "/jbux" },
      { label: "Catalog", href: "/jbux/catalog" },
      { label: "Sellers", href: "/jbux/sellers" },
      { label: "Wallets", href: "/jbux/wallets" },
      { label: "Ledger", href: "/jbux/ledger" },
    ],
  },
  {
    label: "Audit",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 12h6M9 16h6",
    items: [{ label: "Admin actions", href: "/audit" }],
  },
];

/** Every link in the tree, the overview first. */
export function allNavItems(): NavItem[] {
  return [OVERVIEW, ...NAV.flatMap((s) => s.items)];
}

function pathOnly(pathname: string): string {
  const p = (pathname || "/").split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p;
}

/**
 * The item to highlight for a path: the longest href that is the path itself or a parent of it, so
 * /games/last-minute lights "Games > List" and /users/waitlist lights "Waitlist", not "Users > List".
 * The overview ("/") only matches "/" itself.
 */
export function activeHref(pathname: string): string | null {
  const p = pathOnly(pathname);
  if (p === "/") return "/";
  let best: string | null = null;
  for (const item of NAV.flatMap((s) => s.items)) {
    if (p === item.href || p.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/** The section (by label) the active item belongs to, or null (the overview, or outside the tree). */
export function activeSection(pathname: string): string | null {
  const href = activeHref(pathname);
  if (!href || href === "/") return null;
  return NAV.find((s) => s.items.some((i) => i.href === href))?.label ?? null;
}

/** The section and item a path belongs to (for the page header crumb), or null outside the tree. */
export function navTrail(pathname: string): { section: string; item: string } | null {
  const href = activeHref(pathname);
  if (!href) return null;
  if (href === "/") return { section: "Jazaix admin", item: OVERVIEW.label };
  for (const s of NAV) {
    const item = s.items.find((i) => i.href === href);
    if (item) return { section: s.label, item: item.label };
  }
  return null;
}

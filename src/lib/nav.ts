/**
 * THE SIDEBAR TREE: the one place the console's sections are declared. A new section (or a sub-item) is added here
 * and nowhere else: the sidebar, the active highlight and every page header's crumb read this module.
 * Pure data and helpers, no JSX, no framework imports (node runs it in the tests).
 */

export type NavItem = { label: string; href: string };
export type NavSection = { label: string; items: NavItem[] };

export const OVERVIEW: NavItem = { label: "Overview", href: "/" };

export const NAV: NavSection[] = [
  {
    label: "Users",
    items: [
      { label: "List", href: "/users" },
      { label: "Waitlist", href: "/users/waitlist" },
    ],
  },
  {
    label: "Games",
    items: [
      { label: "List", href: "/games" },
      { label: "Rooms", href: "/games/rooms" },
    ],
  },
  { label: "Assets", items: [{ label: "Registry", href: "/assets" }] },
  {
    label: "JBux",
    items: [
      { label: "Purchases", href: "/jbux" },
      { label: "Catalog", href: "/jbux/catalog" },
      { label: "Sellers", href: "/jbux/sellers" },
      { label: "Wallets", href: "/jbux/wallets" },
      { label: "Ledger", href: "/jbux/ledger" },
    ],
  },
  { label: "Audit", items: [{ label: "Admin actions", href: "/audit" }] },
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

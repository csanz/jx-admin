"use client";

/**
 * THE LEFT RAIL, the portal's (jx-portal src/components/LeftRail.tsx + AppShell.tsx) with the admin's tree in it.
 * Owner, 2026-11-17: "the left menu for the main website ... same size, same colour, same icon, same location ...
 * the only difference is that the logo is a different colour". So: the same aside (surface, 240 px, 72 px collapsed,
 * 260 px drawer under md), the same logo row (pt-6 pb-4, the mark at h-8, the panel toggle, Ctrl/Cmd+B), the same
 * account chip, the same rows (rail-row.tsx), the same dividers, the same footer (theme row), the same mobile top
 * bar. The admin's additions sit inside that geometry: a section's sub-items open under it (indented to the label)
 * while that section is active, and a Sign out row sits under the theme row. The mark is in the admin colour.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NAV, OVERVIEW, activeHref, activeSection } from "@/lib/nav";
import { Avatar } from "./Avatar";
import { JxMark } from "./Brand";
import { RailIcon, railLink, railRow } from "./rail-row";
import { ThemeToggle } from "./ThemeToggle";

const COLLAPSE_KEY = "jx.admin.leftrail.collapsed";

export type RailAccount = { label: string; href: string; avatar: string | null };

export function SidebarFrame({
  account,
  theme,
  signOut,
  children,
}: {
  account: RailAccount;
  theme: "dark" | "light";
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const active = activeHref(pathname);
  const openSection = activeSection(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* no storage: stay expanded */
    }
    setHydrated(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* no storage */
      }
      return next;
    });
  };

  // Ctrl/Cmd+B toggles the rail (the portal's chord). Skipped while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the drawer closes on every navigation
  useEffect(() => setMobileOpen(false), [pathname]);

  // Until localStorage is read, render expanded (no layout shift on hydration).
  const effectiveCollapsed = hydrated ? collapsed : false;
  const widthClass = effectiveCollapsed ? "md:w-[72px]" : "md:w-[240px]";
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen bg-bg">
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={closeMobile} aria-hidden="true" />}

      <aside
        id="jx-sidebar"
        className={`fixed md:sticky top-0 left-0 h-screen md:h-[100dvh] bg-surface flex flex-col font-mono z-50 transition-all duration-200 ${widthClass} ${
          mobileOpen ? "w-[260px] translate-x-0" : "w-[260px] -translate-x-full md:translate-x-0"
        }`}
      >
        {/* Logo + collapse toggle, the portal's row: the mark (admin colour) above the chevron when collapsed. */}
        <div className={`pt-6 pb-4 shrink-0 flex ${effectiveCollapsed ? "flex-col items-center gap-2" : "items-center justify-between pl-6 pr-3"}`}>
          <Link href="/" onClick={closeMobile} className="inline-flex items-center justify-center" aria-label="Jazaix admin home">
            <JxMark className="h-8 w-auto text-admin" />
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-lg text-text-muted hover:text-text hover:bg-bg/60 transition-colors cursor-pointer"
            aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!effectiveCollapsed}
            title={`${effectiveCollapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
          >
            <RailIcon size={18} d={effectiveCollapsed ? "M4 4h16v16H4zM9 4v16M13 10l2 2-2 2" : "M4 4h16v16H4zM9 4v16M16 10l-2 2 2 2"} />
          </button>
        </div>

        {/* The account chip, top of the rail: the admin's own user page. */}
        <div className="px-3 pb-1 shrink-0">
          <Link
            href={account.href}
            onClick={closeMobile}
            data-testid="rail-account"
            className={`${railRow(effectiveCollapsed)} w-full text-text hover:bg-bg/60 transition-colors`}
            title={account.label}
          >
            <Avatar src={account.avatar} label={account.label} size={28} />
            {!effectiveCollapsed && <span className="text-sm truncate">{account.label}</span>}
          </Link>
        </div>

        <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 space-y-1">
          <div className="h-px bg-border-subtle mx-2 my-3" aria-hidden />
          <Link
            href={OVERVIEW.href}
            onClick={closeMobile}
            className={railLink(effectiveCollapsed, active === OVERVIEW.href)}
            title={effectiveCollapsed ? OVERVIEW.label : undefined}
            aria-current={active === OVERVIEW.href ? "page" : undefined}
          >
            <span className="shrink-0"><RailIcon d={OVERVIEW.icon} /></span>
            {!effectiveCollapsed && <span className="text-sm">{OVERVIEW.label}</span>}
          </Link>
          {NAV.map((s) => {
            const open = openSection === s.label;
            const first = s.items[0];
            return (
              <div key={s.label} className="space-y-1">
                <Link
                  href={first.href}
                  onClick={closeMobile}
                  className={railLink(effectiveCollapsed, open)}
                  title={effectiveCollapsed ? s.label : undefined}
                  aria-current={open && effectiveCollapsed ? "page" : undefined}
                >
                  <span className="shrink-0"><RailIcon d={s.icon} /></span>
                  {!effectiveCollapsed && <span className="text-sm">{s.label}</span>}
                </Link>
                {open && !effectiveCollapsed && (
                  <ul className="space-y-1">
                    {s.items.map((i) => (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={closeMobile}
                          className={`flex items-center h-8 pl-[46px] pr-3 rounded-lg text-sm no-underline transition-colors ${
                            active === i.href ? "bg-bg text-text" : "text-text-muted hover:text-text hover:bg-bg/60"
                          }`}
                          aria-current={active === i.href ? "page" : undefined}
                        >
                          {i.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="h-px bg-border-subtle mx-2 my-3" aria-hidden />
        </nav>

        {/* Footer: the theme row (the portal's), then Sign out in the same row. */}
        <div className="p-3 pb-4 space-y-1 shrink-0">
          <ThemeToggle initial={theme} collapsed={effectiveCollapsed} />
          <form action={signOut}>
            <button
              type="submit"
              className={`${railRow(effectiveCollapsed)} text-text-muted hover:text-text hover:bg-bg/60 transition-colors cursor-pointer`}
              title={effectiveCollapsed ? "Sign out" : undefined}
            >
              <span className="shrink-0"><RailIcon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></span>
              {!effectiveCollapsed && <span className="text-sm">Sign out</span>}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar, the portal's: only under md; desktop relies on the rail. */}
        <div className="md:hidden sticky top-0 z-30 h-12 bg-bg/90 backdrop-blur-sm border-b border-border-subtle flex items-center px-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 text-text-muted hover:text-text rounded cursor-pointer"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="jx-sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
        <main className="flex-1 min-w-0">
          {/* No top padding: every page starts with PageHeader, whose crumb row is as tall as the rail's logo row
              (h-header, centred), so the crumb sits on the mark's line. */}
          <div className="px-4 pb-10 sm:px-8 min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}

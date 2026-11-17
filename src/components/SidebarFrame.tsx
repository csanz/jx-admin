"use client";

/**
 * The shell's interactive part: the left sidebar (the tree from src/lib/nav.ts, the active item highlighted, each
 * section expanded by default and collapsible), the content pane in the middle, and under 900 px a drawer behind a
 * menu button. The account block (theme, email, Sign out) comes in as `footer` from the server Shell.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NAV, OVERVIEW, activeHref } from "@/lib/nav";

export function SidebarFrame({ showNav, footer, children }: { showNav: boolean; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const active = activeHref(pathname);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // the drawer closes on every navigation
  useEffect(() => setOpen(false), [pathname]);
  // Escape closes the drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (href: string, indent: boolean) =>
    `block rounded-md py-1.5 ${indent ? "pl-6 pr-3" : "px-3"} text-sm no-underline ${
      active === href ? "bg-surface-light text-accent" : "text-text-muted hover:text-text hover:bg-surface-light/60"
    }`;

  return (
    <div className="min-h-screen">
      {/* Under 900 px: a slim strip with the menu button and the mark. */}
      <div className="min-[900px]:hidden sticky top-0 z-30 h-12 px-4 flex items-center gap-3 bg-bg/95 backdrop-blur-sm border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the menu"
          aria-expanded={open}
          aria-controls="jx-sidebar"
          className="px-2 py-1 text-sm text-text-muted border border-border rounded-md hover:text-text cursor-pointer"
        >
          Menu
        </button>
        <Brand />
      </div>

      {open && <div className="min-[900px]:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="jx-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-60 flex flex-col bg-surface border-r border-border-subtle transition-transform min-[900px]:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle shrink-0">
          <Brand />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the menu" className="min-[900px]:hidden px-2 py-1 text-xs text-text-subtle hover:text-text cursor-pointer">
            Close
          </button>
        </div>
        {showNav && (
          <nav aria-label="Sections" className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
            <Link href={OVERVIEW.href} className={linkClass(OVERVIEW.href, false)} aria-current={active === OVERVIEW.href ? "page" : undefined}>
              {OVERVIEW.label}
            </Link>
            {NAV.map((s) => {
              const isOpen = !collapsed[s.label];
              const listId = `nav-${s.label.toLowerCase()}`;
              return (
                <div key={s.label}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [s.label]: isOpen }))}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    className="w-full flex items-center justify-between px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-text-subtle hover:text-text cursor-pointer"
                  >
                    <span>{s.label}</span>
                    <span aria-hidden="true">{isOpen ? "-" : "+"}</span>
                  </button>
                  {isOpen && (
                    <ul id={listId} className="mt-0.5 space-y-0.5">
                      {s.items.map((i) => (
                        <li key={i.href}>
                          <Link href={i.href} className={linkClass(i.href, true)} aria-current={active === i.href ? "page" : undefined}>
                            {i.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        )}
        {!showNav && <div className="flex-1" />}
        <div className="shrink-0 border-t border-border-subtle px-4 py-3">{footer}</div>
      </aside>

      <main className="min-[900px]:pl-60">
        <div className="px-4 py-6 sm:px-8 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-baseline gap-2 no-underline">
      <span className="font-sans font-bold text-text tracking-tight text-[17px]">Jazaix</span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-accent">Admin</span>
    </Link>
  );
}

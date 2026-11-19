import Link from "next/link";
import type { ReactNode } from "react";
import { activeHref, navTrail } from "@/lib/nav";

/**
 * The page header every console page shows, lined up with the rail (owner 2026-11-19: "the alignment at the top, in
 * the menu and the main body"):
 *   band   the first row is the HEADER BAND, the rail's logo row exactly: `h-header` (--spacing-header in globals.css
 *          = 80 px: the portal's pt-6, the 40 px row that holds the mark and the panel toggle, pb-4), the same
 *          pt-6 / pb-4, the crumb centred in the 40 px inside it, so the section crumb sits on the mark's centre line
 *          (44 px) on every page; no border, like the rail's row.
 *   title  the next row is the rail's account row: 40 px, centred, so the page title sits on the account chip's line
 *          (100 px). It grows when a long title or the controls wrap.
 * `path` is the page's own route; on a detail page (for example /games/<slug>) the item in the crumb links back to its
 * list, and `crumbs` can add deeper steps. No hooks, so client and server components both use it.
 */
export function PageHeader({ path, title, children, crumbs = [] }: { path: string; title: string; children?: ReactNode; crumbs?: Array<{ label: string; href?: string }> }) {
  const trail = navTrail(path);
  const itemHref = activeHref(path);
  return (
    <header className="mb-6">
      <div className="h-header pt-6 pb-4 flex items-center">
        <p className="min-w-0 truncate text-[11px] leading-none text-text-subtle uppercase tracking-[0.16em]">
          {trail ? trail.section : "Jazaix admin"}
          {trail && trail.item !== "Overview" && (
            <>
              <span className="mx-1.5" aria-hidden="true">/</span>
              {itemHref && itemHref !== path ? (
                <Link href={itemHref} className="text-text-subtle hover:text-text no-underline">{trail.item}</Link>
              ) : (
                <span>{trail.item}</span>
              )}
            </>
          )}
          {crumbs.map((c, i) => (
            <span key={i}>
              <span className="mx-1.5" aria-hidden="true">/</span>
              {c.href ? <Link href={c.href} className="text-text-subtle hover:text-text no-underline">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </p>
      </div>
      <div className="min-h-10 flex flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0 text-2xl text-text font-semibold font-sans tracking-tight break-words">{title}</h1>
        {children}
      </div>
    </header>
  );
}

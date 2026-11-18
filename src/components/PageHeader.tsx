import Link from "next/link";
import type { ReactNode } from "react";
import { activeHref, navTrail } from "@/lib/nav";

/**
 * The page header every console page shows. Its first row is the HEADER BAND: the same height as the rail's logo
 * row (the `h-header` token, --spacing-header in globals.css = the portal's pt-6 + 32 px mark + pb-4), vertically
 * centred and, like the rail's logo row, without a border, so the section crumb sits on the mark's line on every page. The title (and any controls) follow below the band.
 * `path` is the page's own route; on a detail page (for example /games/<slug>) the item in the crumb links back to its
 * list, and `crumbs` can add deeper steps. No hooks, so client and server components both use it.
 */
export function PageHeader({ path, title, children, crumbs = [] }: { path: string; title: string; children?: ReactNode; crumbs?: Array<{ label: string; href?: string }> }) {
  const trail = navTrail(path);
  const itemHref = activeHref(path);
  return (
    <header className="mb-6">
      <div className="h-header flex items-center">
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
      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <h1 className="min-w-0 text-2xl text-text font-semibold font-sans tracking-tight break-words">{title}</h1>
        {children}
      </div>
    </header>
  );
}

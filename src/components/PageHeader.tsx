import Link from "next/link";
import type { ReactNode } from "react";
import { activeHref, navTrail } from "@/lib/nav";

/**
 * The page header every console page shows: the section crumb (from the sidebar tree, src/lib/nav.ts) and the title.
 * `path` is the page's own route; on a detail page under an item (for example /games/<slug>) the item in the crumb
 * links back to its list. No hooks, so client and server components both use it.
 */
export function PageHeader({ path, title, children }: { path: string; title: string; children?: ReactNode }) {
  const trail = navTrail(path);
  const itemHref = activeHref(path);
  return (
    <header className="flex flex-wrap items-end justify-between gap-2 mb-6">
      <div className="min-w-0">
        {trail && (
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">
            {trail.section}
            {trail.item !== "Overview" && (
              <>
                <span className="mx-1.5" aria-hidden="true">/</span>
                {itemHref && itemHref !== path ? (
                  <Link href={itemHref} className="text-text-subtle hover:text-text no-underline">{trail.item}</Link>
                ) : (
                  <span>{trail.item}</span>
                )}
              </>
            )}
          </p>
        )}
        <h1 className="text-2xl text-text font-semibold font-sans tracking-tight truncate">{title}</h1>
      </div>
      {children}
    </header>
  );
}


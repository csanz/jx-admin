import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small server-side pieces the lists share: the table frame, a truncating cell, the "more" link, the pager, a count
 * line. NO INNER SCROLL CONTAINERS (owner 2026-11-17): a table takes the full width of the content pane with a fixed
 * layout, so its columns share the width and long values wrap or truncate (with the full value as a title tooltip);
 * the page never scrolls sideways. test/no-inner-scroll.test.mjs pins it.
 */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl">
      <table className="w-full table-fixed text-sm">{children}</table>
    </div>
  );
}

export const TH = "px-3 py-2.5 font-normal truncate";
export const TD = "px-3 py-2.5 align-top break-words [overflow-wrap:anywhere]";
export const HEAD_ROW = "text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border";
export const BODY_ROW = "border-b border-border-subtle last:border-0";

/** One line, cut with an ellipsis, the full text in the tooltip. */
export function Clip({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`block truncate ${className}`} title={text}>
      {text}
    </span>
  );
}

/** The "more" control of a cumulative list: a link to the same list with one more page. */
export function MoreLink({ href, shown, total, step }: { href: string; shown: number; total: number; step: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <Link href={href} scroll={false} className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:text-text no-underline">
        Show {Math.min(step, total - shown)} more
      </Link>
      <p className="text-xs text-text-subtle">
        {shown.toLocaleString()} of {total.toLocaleString()}
      </p>
    </div>
  );
}

/**
 * Previous / next with "page n of m" for a server-paged list. `hrefFor(page)` builds the link (keeping the other
 * query values). Renders nothing when everything fits on one page.
 */
export function Pager({ page, pageCount, total, hrefFor, noun = "rows" }: { page: number; pageCount: number; total: number; hrefFor: (page: number) => string; noun?: string }) {
  if (pageCount <= 1) return <p className="mt-3 text-xs text-text-subtle">{total.toLocaleString()} {noun}</p>;
  const btn = "px-3 py-1.5 text-sm border border-border rounded-md no-underline";
  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} scroll={false} className={`${btn} text-text-muted hover:text-text`}>Previous</Link>
      ) : (
        <span className={`${btn} text-text-subtle opacity-50`} aria-disabled="true">Previous</span>
      )}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} scroll={false} className={`${btn} text-text-muted hover:text-text`}>Next</Link>
      ) : (
        <span className={`${btn} text-text-subtle opacity-50`} aria-disabled="true">Next</span>
      )}
      <p className="text-xs text-text-subtle">
        Page {page.toLocaleString()} of {pageCount.toLocaleString()}, {total.toLocaleString()} {noun}
      </p>
    </nav>
  );
}

/** A query string from the set values only (empty ones left out). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && !(k === "page" && v === 1)) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

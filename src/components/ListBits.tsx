import Link from "next/link";
import type { ReactNode } from "react";

/** Small server-side pieces the lists share: the table frame, the "more" link, a count line. */

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export const TH = "px-4 py-2.5 font-normal whitespace-nowrap";
export const TD = "px-4 py-2.5 align-top";
export const HEAD_ROW = "text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border";
export const BODY_ROW = "border-b border-border-subtle last:border-0";

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

/** A query string from the set values only (empty ones left out). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && !(k === "page" && v === 1)) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

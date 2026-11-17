import Link from "next/link";
import type { ReactNode } from "react";
import { num } from "@/lib/format";
import { PLATFORM_SELLER_NAME } from "@/lib/repo/jbux-sales";

/** Pieces the JBux pages share: a split shown as real/test/promo, the env picker note, a small stat tile. */

export type SplitLike = { real: number; test: number; promo: number };

/** "real/test/promo" with the real pot emphasised (it is the only real money). */
export function SplitText({ split }: { split: SplitLike }) {
  return (
    <span className="tabular-nums" title={`real ${split.real}, test ${split.test}, promo ${split.promo}`}>
      <span className={split.real ? "text-text" : "text-text-subtle"}>{num(split.real)}</span>
      <span className="text-text-subtle">/{num(split.test)}/{num(split.promo)}</span>
    </span>
  );
}

export function Tile({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2.5 min-w-0">
      <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">{label}</p>
      <div className="mt-1 text-sm text-text tabular-nums">{children}</div>
      {note && <div className="mt-0.5 text-[11px] text-text-subtle">{note}</div>}
    </div>
  );
}

/** The env switch every JBux page shows: the env in use, and links to the others (all = every env). */
export function EnvSwitch({ env, path, extra = {} }: { env: string; path: string; extra?: Record<string, string> }) {
  const opts = ["all", "prod", "staging", "dev", "local"];
  const cur = env || "all";
  return (
    <p className="text-xs text-text-subtle">
      Env:{" "}
      {opts.map((o, i) => {
        const q = new URLSearchParams({ ...extra, env: o }).toString();
        return (
          <span key={o}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            {o === cur ? <span className="text-admin" aria-current="true">{o}</span> : <Link href={`${path}?${q}`} className="text-text-muted hover:text-text">{o}</Link>}
          </span>
        );
      })}
    </p>
  );
}

export const SELECT = "w-full px-2 py-1.5 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";
export const FILTER_LABEL = "block text-[11px] uppercase tracking-[0.12em] text-text-subtle mb-1";
export const PRIMARY_BUTTON = "px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover cursor-pointer";

/** The note on every sellers page: these are gross figures, attributed, with no payouts defined. */
export function GrossNote() {
  return (
    <p className="mb-4 text-xs text-text-muted border-l-2 border-notice pl-3">
      Gross figures. There is no seller ledger: a purchase debits the buyer only, and each sale is attributed to the
      creator of the item&apos;s game (catalog item, its game, the game&apos;s creator); platform-wide items count for{" "}
      {PLATFORM_SELLER_NAME}. The platform share and payouts are not defined yet (owner decision pending), so nothing here
      is an amount owed. Refunded receipts are left out.
    </p>
  );
}


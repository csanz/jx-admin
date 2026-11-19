import Link from "next/link";
import { ACTIVITY_RANGES, ACTIVITY_RANGE_LABEL, type ActivityRange } from "@/lib/repo/analytics";

/**
 * The 1 week / 1 month / 1 year switch of the activity pages (a user's page, the games overview): links, the current
 * range outlined in the admin colour, the page's other query params kept by `hrefFor`. No hooks (server pages use it).
 */
export function RangeSwitch({ days, hrefFor, label = "Range" }: { days: ActivityRange; hrefFor: (n: ActivityRange) => string; label?: string }) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-xs" data-testid="activity-range">
      {ACTIVITY_RANGES.map((n) => (
        <Link
          key={n}
          href={hrefFor(n)}
          scroll={false}
          aria-current={n === days ? "true" : undefined}
          className={`px-2.5 py-1 rounded-md border no-underline ${n === days ? "border-admin text-admin" : "border-border text-text-muted hover:text-text"}`}
        >
          {ACTIVITY_RANGE_LABEL[n]}
        </Link>
      ))}
    </nav>
  );
}

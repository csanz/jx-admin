import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { AuditTable } from "@/components/AuditTable";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { readEnv } from "@/lib/env";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage, type Loaded } from "@/lib/page-load";
import { recentAuditActions } from "@/lib/repo/audit";
import { getJbuxReport } from "@/lib/repo/jbux-report";
import { waitlistCounts } from "@/lib/repo/waitlist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const RECENT_ACTIONS = 10;

function Tile({ label, href, value }: { label: string; href: string; value: Loaded<number> }) {
  return (
    <Link href={href} className="block no-underline bg-surface border border-border rounded-lg px-3 py-2.5 hover:border-text-subtle transition-colors">
      {value.ok ? (
        <p className="text-xl text-text font-semibold font-sans tabular-nums">{num(value.value)}</p>
      ) : (
        <p className="text-sm text-danger" title={value.message}>unavailable</p>
      )}
      <p className="text-[11px] text-text-muted">{label}</p>
    </Link>
  );
}

/** The overview: the four counts as one row of small tiles, then the newest admin actions. */
export default function OverviewPage() {
  return gatedPage(async () => {
    const env = readEnv();
    const [counts, report, users, recent] = await Promise.all([
      loadForPage("overview waitlist", async () => waitlistCounts(await mongoDb())),
      loadForPage("overview jbux", async () => getJbuxReport(await mongoDb())),
      loadForPage("overview users", async () => (await mongoDb()).collection("users").countDocuments({ role: { $ne: "bot" } })),
      loadForPage("overview audit", async () => recentAuditActions(await mongoDb(), RECENT_ACTIONS)),
    ]);
    const pick = <T,>(l: Loaded<T>, f: (v: T) => number): Loaded<number> => (l.ok ? { ok: true, value: f(l.value) } : l);
    const anyDown = [counts, report, users].find((l) => !l.ok);
    return (
      <>
        <PageHeader path="/" title="Overview" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="waiting on the waitlist" href="/users/waitlist" value={pick(counts, (c) => c.waiting)} />
          <Tile label="approved" href="/users/waitlist" value={pick(counts, (c) => c.approved)} />
          <Tile label="accounts (bots excluded)" href="/users" value={users} />
          <Tile label="real JBux in wallets" href="/jbux" value={pick(report, (r) => r.wallets.real)} />
        </div>
        {anyDown && !anyDown.ok && <p className="mt-2 text-xs text-danger">Some counts could not be loaded: {anyDown.message}.</p>}
        <p className="mt-3 text-xs text-text-subtle">
          Database <span className="font-mono">{env.mongoDbName}</span>.{" "}
          {env.portal ? "Refund and hold go through the portal link." : <span className="text-notice">Portal link not set: refund and hold are disabled.</span>}
        </p>

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h2 className="text-lg text-text font-semibold">Recent admin actions</h2>
            <Link href="/audit" className="text-xs text-accent hover:text-accent-hover">All admin actions</Link>
          </div>
          {recent.ok ? <AuditTable rows={recent.value} empty="No admin actions recorded yet." /> : <LoadError what="the admin actions" message={recent.message} />}
        </section>
      </>
    );
  });
}

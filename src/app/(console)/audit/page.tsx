import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { AuditTable } from "@/components/AuditTable";
import { LoadError } from "@/components/LoadError";
import { MoreLink, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { AUDIT_ACTIONS, AUDIT_ACTOR_MAX, AUDIT_PAGE_SIZE, listAuditActions } from "@/lib/repo/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin actions" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The audit trail (`admin_actions`): newest first, 100 at a time with "more", filter by actor and action. */
export default function AuditPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("admin actions", async () => listAuditActions(await mongoDb(), { actor: one(sp.actor), action: one(sp.action), page: one(sp.page) }));
    const actor = r.ok ? r.value.actor : one(sp.actor).slice(0, AUDIT_ACTOR_MAX);
    const action = r.ok ? r.value.action : "";
    const filtered = Boolean(actor || action);
    return (
      <>
        <PageHeader path="/audit" title="Admin actions" />
        <form method="get" action="/audit" className="flex flex-wrap items-center gap-2 mb-4" role="search">
          <input
            type="search"
            name="actor"
            defaultValue={actor}
            placeholder="Actor email"
            maxLength={AUDIT_ACTOR_MAX}
            aria-label="Filter by actor"
            className="w-full sm:w-72 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
          <select
            name="action"
            defaultValue={action}
            aria-label="Filter by action"
            className="px-2 py-1.5 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent"
          >
            <option value="">every action</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-accent text-accent-ink rounded-md hover:bg-accent-hover cursor-pointer">
            Filter
          </button>
          {filtered && <Link href="/audit" className="text-xs text-text-subtle hover:text-text">Clear</Link>}
          {r.ok && <p className="text-xs text-text-subtle">{num(r.value.total)} {r.value.total === 1 ? "action" : "actions"}</p>}
        </form>
        {!r.ok ? (
          <LoadError what="the admin actions" message={r.message} />
        ) : (
          <>
            <AuditTable rows={r.value.rows} empty={filtered ? "No action matches that filter." : "No admin actions recorded yet."} />
            {r.value.hasMore && (
              <MoreLink href={`/audit${qs({ actor, action, page: r.value.page + 1 })}`} shown={r.value.rows.length} total={r.value.total} step={AUDIT_PAGE_SIZE} />
            )}
          </>
        )}
      </>
    );
  });
}

import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { Tile } from "@/components/JbuxBits";
import { BODY_ROW, HEAD_ROW, Pager, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { PersonCell } from "@/components/PersonCell";
import { portalUrlIfSet } from "@/lib/env";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { listWallets, type WalletSort } from "@/lib/repo/jbux-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallets" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SORT_LABEL: Record<WalletSort, string> = { real: "Real", balance: "Balance", promo: "Promo", test: "Test", updated: "Updated" };

/** JBUX > WALLETS: every wallet with its pots (sort by real balance by default), and what is outstanding. Read only. */
export default function WalletsPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("wallets", async () => listWallets(await mongoDb(), { sort: one(sp.sort), page: one(sp.page) }));
    const portalUrl = portalUrlIfSet();
    const sort = r.ok ? r.value.sort : "real";
    return (
      <>
        <PageHeader path="/jbux/wallets" title="Wallets" />
        {!r.ok ? (
          <LoadError what="the wallets" message={r.message} />
        ) : (
          <>
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-5 mb-4">
              <Tile label="Wallets">{num(r.value.totals.count)}</Tile>
              <Tile label="Real JBux held">{num(r.value.totals.real)}</Tile>
              <Tile label="Promo outstanding" note="the platform's promo liability">{num(r.value.totals.promo)}</Tile>
              <Tile label="Test outstanding" note="not money">{num(r.value.totals.test)}</Tile>
              <Tile label="On hold">{num(r.value.totals.onHold)}</Tile>
            </div>
            <p className="mb-3 text-xs text-text-subtle">
              Sort:{" "}
              {(Object.keys(SORT_LABEL) as WalletSort[]).map((s, i) => (
                <span key={s}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {s === sort ? <span className="text-admin" aria-current="true">{SORT_LABEL[s]}</span> : <Link href={`/jbux/wallets${qs({ sort: s === "real" ? null : s })}`} className="text-text-muted hover:text-text">{SORT_LABEL[s]}</Link>}
                </span>
              ))}
              . Holds are set on the Ledger page.
            </p>
            {r.value.rows.length === 0 ? (
              <p className="text-sm text-text-subtle">No wallets yet.</p>
            ) : (
              <>
                <TableFrame>
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th className={`${TH} w-[30%]`}>User</th>
                      <th className={`${TH} text-right`}>Real</th>
                      <th className={`${TH} text-right`}>Test</th>
                      <th className={`${TH} text-right`}>Promo</th>
                      <th className={`${TH} text-right`}>Balance</th>
                      <th className={TH}>On hold</th>
                      <th className={TH}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.value.rows.map((w) => (
                      <tr key={w.id} className={BODY_ROW}>
                        <td className={`${TD} text-xs`}><PersonCell person={w.user} portalUrl={portalUrl} /></td>
                        <td className={`${TD} text-xs text-right tabular-nums ${w.real ? "text-text" : "text-text-subtle"}`}>{num(w.real)}</td>
                        <td className={`${TD} text-xs text-right tabular-nums text-text-muted`}>{num(w.test)}</td>
                        <td className={`${TD} text-xs text-right tabular-nums text-text-muted`}>{num(w.promo)}</td>
                        <td className={`${TD} text-xs text-right tabular-nums`}>{num(w.balance)}</td>
                        <td className={`${TD} text-xs ${w.hold ? "text-notice" : "text-text-subtle"}`}>{w.hold ?? "no"}</td>
                        <td className={`${TD} text-xs text-text-muted`}>{shortWhen(w.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableFrame>
                <Pager page={r.value.page} pageCount={r.value.pageCount} total={r.value.total} noun="wallets" hrefFor={(p) => `/jbux/wallets${qs({ sort: sort === "real" ? null : sort, page: p })}`} />
              </>
            )}
          </>
        )}
      </>
    );
  });
}

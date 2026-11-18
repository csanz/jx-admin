import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { EnvSwitch, GrossNote } from "@/components/JbuxBits";
import { BODY_ROW, HEAD_ROW, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { PersonCell } from "@/components/PersonCell";
import { portalUrlIfSet } from "@/lib/env";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { defaultJbuxEnv, listSellers, parseEnv } from "@/lib/repo/jbux-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sellers" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** JBUX > SELLERS: one row per creator who has items in the catalog, with gross sales by pot. */
export default function SellersPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const env = parseEnv(one(sp.env) || undefined, defaultJbuxEnv(process.env.NODE_ENV, process.env.JX_JBUX_DEFAULT_ENV));
    const envParam = env || "all";
    const r = await loadForPage("sellers", async () => listSellers(await mongoDb(), { env }));
    const portalUrl = portalUrlIfSet();
    return (
      <>
        <PageHeader path="/jbux/sellers" title="Sellers">
          <EnvSwitch env={env} path="/jbux/sellers" />
        </PageHeader>
        <GrossNote />
        {!r.ok ? (
          <LoadError what="the sellers" message={r.message} />
        ) : r.value.length === 0 ? (
          <p className="text-sm text-text-subtle">No catalog items, so no sellers.</p>
        ) : (
          <TableFrame>
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} w-[20%]`}>Seller</th>
                <th className={TH}>Games</th>
                <th className={`${TH} w-[9%] text-right`}>On sale</th>
                <th className={`${TH} w-[10%] text-right`}>Purchases</th>
                <th className={`${TH} w-[9%] text-right`}>Real</th>
                <th className={`${TH} w-[9%] text-right`}>Test</th>
                <th className={`${TH} w-[9%] text-right`}>Promo</th>
                <th className={`${TH} w-[12%]`}>Last sale</th>
              </tr>
            </thead>
            <tbody>
              {r.value.map((s) => {
                const sellerHref = `/jbux/sellers/${s.key}${qs({ env: envParam })}`;
                return (
                <tr key={s.key} className={BODY_ROW}>
                  <td className={`${TD} text-xs`}>
                    {/* The name opens the seller's sales by item; the user page is the small link under it. */}
                    {s.person ? (
                      <PersonCell person={s.person} portalUrl={portalUrl} href={sellerHref} />
                    ) : (
                      <Link href={sellerHref} className="text-text hover:text-admin no-underline">{s.name}</Link>
                    )}
                    <span className="block text-[11px]">
                      <Link href={sellerHref} className="text-admin hover:text-admin-hover">Sales by item</Link>
                      {s.person && (
                        <>
                          <span className="text-text-subtle"> · </span>
                          <Link href={`/users/${s.person.id}`} className="text-text-subtle hover:text-text no-underline">User page</Link>
                        </>
                      )}
                    </span>
                  </td>
                  <td className={`${TD} text-xs text-text-muted`}>
                    {s.games.length === 0 ? <span className="text-text-subtle">platform-wide</span> : s.games.map((g, i) => (
                      <span key={g.slug}>{i > 0 && ", "}<Link href={`/games/${encodeURIComponent(g.slug)}`} className="text-text-muted hover:text-admin no-underline">{g.name || g.slug}</Link></span>
                    ))}
                  </td>
                  <td className={`${TD} text-xs text-right tabular-nums`}>{num(s.itemsOnSale)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums`}>{num(s.purchases)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums ${s.split.real ? "text-text" : "text-text-subtle"}`}>{num(s.split.real)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums text-text-muted`}>{num(s.split.test)}</td>
                  <td className={`${TD} text-xs text-right tabular-nums text-text-muted`}>{num(s.split.promo)}</td>
                  <td className={`${TD} text-xs text-text-muted`}>{s.lastSale ? shortWhen(s.lastSale) : "never"}</td>
                </tr>
                );
              })}
            </tbody>
          </TableFrame>
        )}
      </>
    );
  });
}

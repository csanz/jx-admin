import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { EnvSwitch, SplitText } from "@/components/JbuxBits";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { CATALOG_SALES_MAX, catalogWithSales, defaultJbuxEnv, parseEnv, type CatalogSort } from "@/lib/repo/jbux-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SORT_LABEL: Record<CatalogSort, string> = { gross: "JBux gross", sales: "Sales", sku: "Sku" };

/** JBUX > CATALOG: every priced item (the `catalog` collection) with its sales; a row opens the item's receipts. */
export default function JbuxCatalogPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const env = parseEnv(one(sp.env) || undefined, defaultJbuxEnv(process.env.NODE_ENV, process.env.JX_JBUX_DEFAULT_ENV));
    const envParam = env || "all";
    const r = await loadForPage("catalog", async () => catalogWithSales(await mongoDb(), { env, sort: one(sp.sort) }));
    const sort = r.ok ? r.value.sort : "gross";
    return (
      <>
        <PageHeader path="/jbux/catalog" title="Catalog">
          <EnvSwitch env={env} path="/jbux/catalog" extra={sort !== "gross" ? { sort } : {}} />
        </PageHeader>
        <p className="mb-3 text-xs text-text-subtle">
          The JBux shop&apos;s items (assets with a price). Sales leave refunded receipts out. Sort:{" "}
          {(Object.keys(SORT_LABEL) as CatalogSort[]).map((s, i) => (
            <span key={s}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {s === sort ? <span className="text-admin" aria-current="true">{SORT_LABEL[s]}</span> : <Link href={`/jbux/catalog${qs({ sort: s, env: envParam })}`} className="text-text-muted hover:text-text">{SORT_LABEL[s]}</Link>}
            </span>
          ))}
        </p>
        {!r.ok ? (
          <LoadError what="the catalog" message={r.message} />
        ) : r.value.rows.length === 0 ? (
          <p className="text-sm text-text-subtle">The catalog is empty.</p>
        ) : (
          <>
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={`${TH} w-[22%]`}>Item</th>
                  <th className={`${TH} w-[9%]`}>Kind</th>
                  <th className={`${TH} w-[11%]`}>Game</th>
                  <th className={`${TH} w-[7%] text-right`}>Price</th>
                  <th className={`${TH} w-[8%]`}>Enabled</th>
                  <th className={`${TH} w-[8%]`}>Cosmetic</th>
                  <th className={`${TH} w-[7%] text-right`}>Sales</th>
                  <th className={`${TH} w-[13%]`} title="real/test/promo">JBux gross</th>
                  <th className={TH}>Last sale</th>
                </tr>
              </thead>
              <tbody>
                {r.value.rows.map((x) => (
                  <tr key={x.sku} className={BODY_ROW}>
                    <td className={`${TD} text-xs`}>
                      <Link href={`/jbux${qs({ sku: x.sku, env: envParam })}`} className="block truncate text-text hover:text-admin no-underline" title={`${x.name || x.sku}: open its receipts`}>{x.name || x.sku}</Link>
                      <Clip text={x.sku} className="font-mono text-[11px] text-text-subtle" />
                    </td>
                    <td className={`${TD} text-xs text-text-muted`}><Clip text={x.kind || "n/a"} /></td>
                    <td className={`${TD} text-xs text-text-muted`}><Clip text={x.gameId ?? "platform-wide"} /></td>
                    <td className={`${TD} text-xs text-right tabular-nums`}>{num(x.price)}</td>
                    <td className={`${TD} text-xs ${x.enabled ? "text-success" : "text-text-subtle"}`}>{x.enabled ? "yes" : "no"}</td>
                    <td className={`${TD} text-xs text-text-muted`}>{x.cosmetic ? "yes" : "no"}</td>
                    <td className={`${TD} text-xs text-right tabular-nums`}>{num(x.sales)}</td>
                    <td className={`${TD} text-xs`}><SplitText split={x.split} /></td>
                    <td className={`${TD} text-xs text-text-muted`}>{x.lastSale ? shortWhen(x.lastSale) : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <p className="mt-3 text-xs text-text-subtle">
              {num(r.value.rows.length)} of {num(r.value.total)} items{r.value.total > CATALOG_SALES_MAX ? ` (the first ${CATALOG_SALES_MAX})` : ""}. Read only.
            </p>
          </>
        )}
      </>
    );
  });
}

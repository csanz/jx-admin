import { gatedPage } from "@/components/AdminGate";
import { LoadError } from "@/components/LoadError";
import { BODY_ROW, Clip, HEAD_ROW, MoreLink, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { CATALOG_TABLE_COLUMNS, catalogExtraLines, listCatalog } from "@/lib/repo/catalog";
import { PAGE_SIZE } from "@/lib/repo/paging";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The cosmetics catalog (`catalog`), read only, 50 at a time with "more". The table shows sku, name, kind, game,
 * price, enabled, cosmetic and created; every other field of the row is in the "+n" tooltip and its details.
 */
export default function CatalogPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("catalog", async () => listCatalog(await mongoDb(), { page: one(sp.page) }));
    return (
      <>
        <PageHeader path="/assets/catalog" title="Catalog">
          {r.ok && <p className="text-xs text-text-subtle">{num(r.value.total)} {r.value.total === 1 ? "item" : "items"}</p>}
        </PageHeader>
        <p className="mb-4 text-xs text-text-muted border-l-2 border-notice pl-3">
          The asset registry (jxasset) is not built yet, so this section shows the cosmetics catalog only (the JBux shop&apos;s items). Read only.
        </p>
        {!r.ok ? (
          <LoadError what="the catalog" message={r.message} />
        ) : r.value.rows.length === 0 ? (
          <p className="text-sm text-text-subtle">The catalog is empty.</p>
        ) : (
          <>
            <CatalogTable rows={r.value.rows} />
            {r.value.hasMore && <MoreLink href={`/assets/catalog${qs({ page: r.value.page + 1 })}`} shown={r.value.rows.length} total={r.value.total} step={PAGE_SIZE} />}
          </>
        )}
      </>
    );
  });
}

function CatalogTable({ rows }: { rows: Array<{ id: string; fields: Record<string, string> }> }) {
  return (
    <TableFrame>
      <thead>
        <tr className={HEAD_ROW}>
          {CATALOG_TABLE_COLUMNS.map(([f, label]) => (
            <th key={f} className={`${TH} ${f === "name" ? "w-[22%]" : f === "sku" ? "w-[20%]" : ""} ${f === "priceCredits" ? "text-right" : ""}`}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const extra = catalogExtraLines(row);
          return (
            <tr key={row.id} className={BODY_ROW}>
              {CATALOG_TABLE_COLUMNS.map(([f]) => {
                const v = row.fields[f] ?? "";
                if (f === "sku") {
                  return (
                    <td key={f} className={`${TD} text-xs`}>
                      <Clip text={v || "n/a"} className="font-mono text-text" />
                      {extra.length > 0 && (
                        <details className="text-[11px] text-text-subtle">
                          <summary className="cursor-pointer" title={extra.join("\n")}>+{extra.length} more fields</summary>
                          <ul className="mt-1 space-y-0.5 font-mono break-words [overflow-wrap:anywhere]">
                            {extra.map((l) => <li key={l}>{l}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>
                  );
                }
                if (f === "createdAt") return <td key={f} className={`${TD} text-xs text-text-muted`}>{v ? shortWhen(v) : "n/a"}</td>;
                return (
                  <td key={f} className={`${TD} text-xs ${f === "name" ? "text-text" : "text-text-muted"} ${f === "priceCredits" ? "text-right tabular-nums" : ""}`}>
                    <Clip text={v || (f === "gameId" ? "platform-wide" : "n/a")} />
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </TableFrame>
  );
}

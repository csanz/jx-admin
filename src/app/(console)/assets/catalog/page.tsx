import { gatedPage } from "@/components/AdminGate";
import { LoadError } from "@/components/LoadError";
import { BODY_ROW, HEAD_ROW, MoreLink, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { listCatalog } from "@/lib/repo/catalog";
import { PAGE_SIZE } from "@/lib/repo/paging";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The cosmetics catalog (`catalog`), read only, every field the documents carry, 50 at a time with "more". */
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
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  {r.value.columns.map((c) => (
                    <th key={c} className={`${TH} font-mono normal-case tracking-normal`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.value.rows.map((row) => (
                  <tr key={row.id} className={BODY_ROW}>
                    {r.value.columns.map((c) => (
                      <td key={c} className={`${TD} text-xs ${c === "name" || c === "sku" ? "text-text" : "text-text-muted"} ${c === "name" ? "" : "whitespace-nowrap"}`}>
                        {row.fields[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            {r.value.hasMore && <MoreLink href={`/assets/catalog${qs({ page: r.value.page + 1 })}`} shown={r.value.rows.length} total={r.value.total} step={PAGE_SIZE} />}
          </>
        )}
      </>
    );
  });
}

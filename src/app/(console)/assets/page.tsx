import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assets" };

/** ASSETS > REGISTRY: the asset registry (jxasset) is not built yet; the priced items live under JBux > Catalog. */
export default function AssetsPage() {
  return gatedPage(() => (
    <>
      <PageHeader path="/assets" title="Asset registry" />
      <div className="bg-surface border border-border rounded-xl p-4 max-w-2xl">
        <p className="text-sm text-text">The asset registry is coming.</p>
        <p className="mt-2 text-sm text-text-muted">
          The registry (jxasset, jx-docs/prds/jxasset.md) is not built yet. The items that have a price, the JBux
          shop&apos;s catalog, are under{" "}
          <Link href="/jbux/catalog" className="text-admin hover:text-admin-hover">JBux &gt; Catalog</Link>, with their sales.
        </p>
      </div>
    </>
  ));
}

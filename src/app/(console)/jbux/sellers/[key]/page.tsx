import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { EnvSwitch, GrossNote, SplitText, Tile } from "@/components/JbuxBits";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { PersonCell } from "@/components/PersonCell";
import { portalUrlIfSet } from "@/lib/env";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { defaultJbuxEnv, getSeller, parseEnv } from "@/lib/repo/jbux-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seller" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** One seller's sales by item (gross, by pot); each item opens its receipts. */
export default function SellerPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SP }) {
  return gatedPage(async () => {
    const { key } = await params;
    const sp = await searchParams;
    const env = parseEnv(one(sp.env) || undefined, defaultJbuxEnv(process.env.NODE_ENV, process.env.JX_JBUX_DEFAULT_ENV));
    const envParam = env || "all";
    const path = `/jbux/sellers/${key}`;
    const r = await loadForPage("seller", async () => getSeller(await mongoDb(), key, { env }));
    if (!r.ok) {
      return (
        <>
          <PageHeader path={path} title="Seller" />
          <LoadError what="this seller" message={r.message} />
        </>
      );
    }
    if (!r.value) {
      return (
        <>
          <PageHeader path={path} title="Seller not found" />
          <p className="text-sm text-text-muted">No seller with that key. <Link href="/jbux/sellers" className="text-admin hover:text-admin-hover">Back to the sellers</Link></p>
        </>
      );
    }
    const { seller: s, items } = r.value;
    return (
      <>
        <PageHeader path={path} title={s.person?.name || s.name}>
          <EnvSwitch env={env} path={path} />
        </PageHeader>
        <GrossNote />
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5 mb-6">
          <Tile label="Seller">{s.person ? <PersonCell person={s.person} portalUrl={portalUrlIfSet()} /> : s.name}</Tile>
          <Tile label="Items on sale">{num(s.itemsOnSale)}</Tile>
          <Tile label="Purchases">{num(s.purchases)}</Tile>
          <Tile label="Gross" note="real/test/promo"><SplitText split={s.split} /></Tile>
          <Tile label="Last sale">{s.lastSale ? shortWhen(s.lastSale) : "never"}</Tile>
        </div>
        <TableFrame>
          <thead>
            <tr className={HEAD_ROW}>
              <th className={`${TH} w-[28%]`}>Item</th>
              <th className={TH}>Game</th>
              <th className={`${TH} w-[9%] text-right`}>Price</th>
              <th className={`${TH} w-[9%] text-right`}>Sales</th>
              <th className={`${TH} w-[16%]`} title="real/test/promo">Gross</th>
              <th className={`${TH} w-[14%]`}>Last sale</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.sku} className={BODY_ROW}>
                <td className={`${TD} text-xs`}>
                  <Link href={`/jbux${qs({ sku: x.sku, env: envParam })}`} className="block truncate text-text hover:text-admin no-underline" title={x.name || x.sku}>{x.name || x.sku}</Link>
                  <Clip text={x.sku} className="font-mono text-[11px] text-text-subtle" />
                </td>
                <td className={`${TD} text-xs text-text-muted`}><Clip text={x.gameId ?? "platform-wide"} /></td>
                <td className={`${TD} text-xs text-right tabular-nums`}>{num(x.price)}</td>
                <td className={`${TD} text-xs text-right tabular-nums`}>{num(x.sales)}</td>
                <td className={`${TD} text-xs`}><SplitText split={x.split} /></td>
                <td className={`${TD} text-xs text-text-muted`}>{x.lastSale ? shortWhen(x.lastSale) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </>
    );
  });
}

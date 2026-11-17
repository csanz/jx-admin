import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { EnvSwitch, FILTER_LABEL, PRIMARY_BUTTON, SELECT, SplitText, Tile } from "@/components/JbuxBits";
import { BODY_ROW, Clip, HEAD_ROW, Pager, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { PersonCell } from "@/components/PersonCell";
import { Section } from "@/components/DetailBits";
import { portalUrlIfSet } from "@/lib/env";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { FUNDINGS, RECEIPT_STATES, defaultJbuxEnv, getPurchases, parseEnv, type TopRow } from "@/lib/repo/jbux-sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchases" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function TopList({ title, rows, hrefFor }: { title: string; rows: TopRow[]; hrefFor: (key: string) => string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3 min-w-0">
      <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em] mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No sales in the range.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.key || i} className="flex items-baseline gap-2 min-w-0 text-sm">
              <span className="text-text-subtle tabular-nums w-4 shrink-0">{i + 1}</span>
              <Link href={hrefFor(r.key)} className="min-w-0 flex-1 truncate text-text hover:text-admin no-underline" title={r.label}>{r.label}</Link>
              <span className="shrink-0 text-xs text-text-muted tabular-nums">{num(r.gross)} JBux · {num(r.sales)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * JBUX > PURCHASES, the section's landing: KPI tiles (today, 7 and 30 days), the top items and games in the date
 * range, then every receipt newest first with filters (game, kind, funding, state, env, sku, date range), 50 a page.
 * The env defaults to prod on a production deployment and to every env elsewhere.
 */
export default function PurchasesPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const env = parseEnv(one(sp.env) || undefined, defaultJbuxEnv(process.env.NODE_ENV));
    const f = { game: one(sp.game), kind: one(sp.kind), funding: one(sp.funding), state: one(sp.state), sku: one(sp.sku), buyer: one(sp.buyer), from: one(sp.from), to: one(sp.to) };
    const r = await loadForPage("purchases", async () => getPurchases(await mongoDb(), { ...f, env, page: one(sp.page) }));
    const portalUrl = portalUrlIfSet();
    const envParam = env || "all";
    const keep = (extra: Record<string, string | number | null>) => qs({ ...f, env: envParam, ...extra });
    return (
      <>
        <PageHeader path="/jbux" title="Purchases">
          <EnvSwitch env={env} path="/jbux" extra={Object.fromEntries(Object.entries(f).filter(([, v]) => v))} />
        </PageHeader>
        {!r.ok ? (
          <LoadError what="the purchases" message={r.message} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {r.value.kpis.map((k) => (
                <div key={k.key} className="bg-surface border border-border rounded-xl p-3 min-w-0">
                  <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">{k.label}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Tile label="Purchases">{num(k.purchases)}</Tile>
                    <Tile label="Real revenue" note="real pot only">{num(k.realRevenue)} JBux</Tile>
                    <Tile label="Spent" note="real/test/promo"><SplitText split={k.spent} /></Tile>
                    <Tile label="Refunds">{num(k.refunds)}</Tile>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-subtle">Spent and revenue leave refunded receipts out. Days are UTC.</p>

            <Section title="Top in the range" note={`${r.value.range.fromKey} to ${r.value.range.toKey} (${r.value.range.days} days)`}>
              <div className="grid gap-2 sm:grid-cols-2">
                <TopList title="Items by JBux" rows={r.value.topItems} hrefFor={(sku) => `/jbux${keep({ sku, page: null })}`} />
                <TopList title="Games by JBux" rows={r.value.topGames} hrefFor={(g) => `/jbux${keep({ game: g, page: null })}`} />
              </div>
            </Section>

            <Section title="Receipts" note={`${num(r.value.receipts.total)} match, newest first`}>
              <form method="get" action="/jbux" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-3 items-end">
                <input type="hidden" name="env" value={envParam} />
                {f.sku && <input type="hidden" name="sku" value={f.sku} />}
                {f.buyer && <input type="hidden" name="buyer" value={f.buyer} />}
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-game">Game</label>
                  <select id="f-game" name="game" defaultValue={f.game} className={SELECT}>
                    <option value="">all</option>
                    {r.value.options.games.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-kind">Kind</label>
                  <select id="f-kind" name="kind" defaultValue={f.kind} className={SELECT}>
                    <option value="">all</option>
                    {r.value.options.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-funding">Funding</label>
                  <select id="f-funding" name="funding" defaultValue={f.funding} className={SELECT}>
                    <option value="">any pot</option>
                    {FUNDINGS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-state">State</label>
                  <select id="f-state" name="state" defaultValue={f.state} className={SELECT}>
                    <option value="">any</option>
                    {RECEIPT_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-from">From</label>
                  <input id="f-from" type="date" name="from" defaultValue={r.value.range.fromKey} className={SELECT} />
                </div>
                <div>
                  <label className={FILTER_LABEL} htmlFor="f-to">To</label>
                  <input id="f-to" type="date" name="to" defaultValue={r.value.range.toKey} className={SELECT} />
                </div>
                <div className="flex items-center gap-3 col-span-2">
                  <button type="submit" className={PRIMARY_BUTTON}>Filter</button>
                  <Link href={`/jbux?env=${envParam}`} className="text-xs text-text-subtle hover:text-text">Clear</Link>
                </div>
              </form>
              {(f.sku || f.buyer) && (
                <p className="mb-2 text-xs text-text-muted">
                  {f.sku && <>Item <span className="font-mono text-text">{f.sku}</span>. </>}
                  {f.buyer && <>Buyer <span className="font-mono text-text">{f.buyer}</span>. </>}
                  <Link href={`/jbux${keep({ sku: null, buyer: null, page: null })}`} className="text-admin hover:text-admin-hover">Show all</Link>
                </p>
              )}
              {r.value.receipts.rows.length === 0 ? (
                <p className="text-sm text-text-subtle">
                  No purchases match{env ? ` in env ${env}` : ""}.{" "}
                  {env && <Link href={`/jbux${qs({ ...f, env: "all" })}`} className="text-admin hover:text-admin-hover">Show every env</Link>}
                </p>
              ) : (
                <>
                  <TableFrame>
                    <thead>
                      <tr className={HEAD_ROW}>
                        <th className={`${TH} w-[11%]`}>When</th>
                        <th className={`${TH} w-[18%]`}>Buyer</th>
                        <th className={TH}>Item</th>
                        <th className={`${TH} w-[9%]`}>Kind</th>
                        <th className={`${TH} w-[11%]`}>Game</th>
                        <th className={`${TH} w-[7%] text-right`}>Price</th>
                        <th className={`${TH} w-[11%]`} title="real/test/promo">Split</th>
                        <th className={`${TH} w-[8%]`}>State</th>
                        <th className={`${TH} w-[6%]`}>Env</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.value.receipts.rows.map((x) => (
                        <tr key={x.id} className={BODY_ROW}>
                          <td className={`${TD} text-xs text-text-muted`} title={x.at ?? ""}>{shortWhen(x.at)}</td>
                          <td className={`${TD} text-xs`}><PersonCell person={x.buyer} portalUrl={portalUrl} /></td>
                          <td className={`${TD} text-xs`}>
                            <Clip text={x.itemName || x.sku} className="text-text" />
                            <Link href={`/jbux${keep({ sku: x.sku, page: null })}`} className="block truncate font-mono text-[11px] text-text-subtle hover:text-text no-underline" title={x.sku}>{x.sku}</Link>
                          </td>
                          <td className={`${TD} text-xs text-text-muted`}><Clip text={x.kind || "n/a"} /></td>
                          <td className={`${TD} text-xs`}>
                            {x.gameId ? <Link href={`/games/${encodeURIComponent(x.gameId)}`} className="block truncate text-text-muted hover:text-admin no-underline" title={x.gameName || x.gameId}>{x.gameName || x.gameId}</Link> : <span className="text-text-subtle">n/a</span>}
                          </td>
                          <td className={`${TD} text-xs text-right tabular-nums`}>{num(x.price)}</td>
                          <td className={`${TD} text-xs`}><SplitText split={x.split} /></td>
                          <td className={`${TD} text-xs ${x.state === "refunded" ? "text-danger" : "text-text-muted"}`}>{x.state || "n/a"}</td>
                          <td className={`${TD} text-xs text-text-muted`}>{x.env || "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableFrame>
                  <Pager page={r.value.receipts.page} pageCount={r.value.receipts.pageCount} total={r.value.receipts.total} noun="receipts" hrefFor={(p) => `/jbux${keep({ page: p })}`} />
                </>
              )}
            </Section>
          </>
        )}
      </>
    );
  });
}

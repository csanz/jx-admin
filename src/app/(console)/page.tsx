import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { AuditTable } from "@/components/AuditTable";
import { LineChartPanel } from "@/components/charts/LineChartPanel";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { readEnv } from "@/lib/env";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage, type Loaded } from "@/lib/page-load";
import { RangeSwitch } from "@/components/RangeSwitch";
import { getAnalytics } from "@/lib/repo/analytics";
import { recentAuditActions } from "@/lib/repo/audit";
import { getJbuxReport } from "@/lib/repo/jbux-report";
import { waitlistCounts } from "@/lib/repo/waitlist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const RECENT_ACTIONS = 5;
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const hours = (h: number) => `${num(Math.round(h * 10) / 10)} h`;

function Tile({ label, href, value }: { label: string; href: string; value: Loaded<number> }) {
  return (
    <Link href={href} className="flex items-baseline gap-2 min-w-0 no-underline bg-surface border border-border rounded-lg px-3 py-2 hover:border-text-subtle transition-colors">
      {value.ok ? (
        <span className="text-base text-text font-semibold font-sans tabular-nums">{num(value.value)}</span>
      ) : (
        <span className="text-sm text-danger" title={value.message}>unavailable</span>
      )}
      <span className="text-[11px] text-text-muted truncate">{label}</span>
    </Link>
  );
}

/**
 * THE OVERVIEW, an analytics home: the four counts as one compact row, the range switch (1 week / 1 month / 1 year,
 * the same RangeSwitch as the Games and Users overviews so the three pages line up), eight line
 * charts of usage aggregated on the server (src/lib/repo/analytics.ts), the per-game table for the range, then the
 * newest admin actions.
 */
export default function OverviewPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const env = readEnv();
    const [counts, report, users, recent, analytics] = await Promise.all([
      loadForPage("overview waitlist", async () => waitlistCounts(await mongoDb())),
      loadForPage("overview jbux", async () => getJbuxReport(await mongoDb())),
      loadForPage("overview users", async () => (await mongoDb()).collection("users").countDocuments({ role: { $ne: "bot" } })),
      loadForPage("overview audit", async () => recentAuditActions(await mongoDb(), RECENT_ACTIONS)),
      loadForPage("overview analytics", async () => getAnalytics(await mongoDb(), { range: one(sp.range) })),
    ]);
    const pick = <T,>(l: Loaded<T>, f: (v: T) => number): Loaded<number> => (l.ok ? { ok: true, value: f(l.value) } : l);
    const anyDown = [counts, report, users].find((l) => !l.ok);
    const days = analytics.ok ? analytics.value.days : 30;
    return (
      <>
        <PageHeader path="/" title="Overview">
          <RangeSwitch days={days} hrefFor={(n) => (n === 30 ? "/" : `/?range=${n}`)} />
        </PageHeader>

        {analytics.ok && (
          <p className="mb-2 text-xs text-text-subtle">
            {analytics.value.from} to {analytics.value.to} (UTC days). Bot sessions and bot accounts are left out.
          </p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Tile label="waiting on the waitlist" href="/users/waitlist" value={pick(counts, (c) => c.waiting)} />
          <Tile label="approved" href="/users/waitlist" value={pick(counts, (c) => c.approved)} />
          <Tile label="accounts (bots excluded)" href="/users" value={users} />
          <Tile label="real JBux in wallets" href="/jbux/wallets" value={pick(report, (r) => r.wallets.real)} />
        </div>
        {anyDown && !anyDown.ok && <p className="mt-2 text-xs text-danger">Some counts could not be loaded: {anyDown.message}.</p>}

        {!analytics.ok ? (
          <div className="mt-6"><LoadError what="the analytics" message={analytics.message} /></div>
        ) : (
          (() => {
            const a = analytics.value;
            const fb = "from daily_stats";
            return (
              <>
                <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
                  <LineChartPanel title="Players per day" total={`${num(a.players.total)} in the range`} points={a.players.points} series={[{ key: "players", label: "players" }]} note={a.players.fallback ? fb : "distinct player ids"} />
                  <LineChartPanel title="Sessions per day" total={num(a.sessions.total)} points={a.sessions.points} series={[{ key: "seated", label: "seated" }, { key: "watching", label: "watching" }]} note={a.sessions.fallback ? fb : undefined} />
                  <LineChartPanel title="Play time per day" total={hours(a.playHours.total)} points={a.playHours.points} series={[{ key: "playH", label: "hours" }]} decimals={1} note={a.playHours.fallback ? fb : undefined} />
                  <LineChartPanel title="Rounds per day" total={num(a.rounds.total)} points={a.rounds.points} series={[{ key: "rounds", label: "rounds" }]} note={a.rounds.fallback ? fb : undefined} />
                  <LineChartPanel title="Peak concurrent per day" total={`max ${num(a.peak.max)}`} points={a.peak.points} series={[{ key: "peak", label: "peak" }]} note="the busiest game's peak, from daily_stats" />
                  <LineChartPanel title="New accounts per day" total={num(a.accounts.total)} points={a.accounts.points} series={[{ key: "accounts", label: "accounts" }]} />
                  <LineChartPanel
                    title="JBux spent per day"
                    total={`${num(a.jbux.total.real)} real · ${num(a.jbux.total.purchases)} purchases`}
                    points={a.jbux.points}
                    series={[{ key: "real", label: "real" }, { key: "test", label: "test" }, { key: "promo", label: "promo" }]}
                    note={`test ${num(a.jbux.total.test)}, promo ${num(a.jbux.total.promo)}; every env`}
                  />
                  <LineChartPanel
                    title="Client errors per day"
                    total={`${num(a.errors.total.withErrors)} of ${num(a.errors.total.reports)} reports`}
                    points={a.errors.points}
                    series={[{ key: "withErrors", label: "with errors" }, { key: "reports", label: "all reports" }]}
                  />
                </div>

                <section className="mt-8">
                  <h2 className="text-lg text-text font-semibold mb-2">Games in the range</h2>
                  {a.games.length === 0 ? (
                    <p className="text-sm text-text-subtle">No activity in the range.</p>
                  ) : (
                    <TableFrame>
                      <thead>
                        <tr className={HEAD_ROW}>
                          <th className={`${TH} w-[24%]`}>Game</th>
                          <th className={`${TH} text-right`}>Players</th>
                          <th className={`${TH} text-right`}>Sessions</th>
                          <th className={`${TH} text-right`}>Play hours</th>
                          <th className={`${TH} text-right`}>Rounds</th>
                          <th className={`${TH} text-right`}>Peak</th>
                          <th className={`${TH} text-right`}>Purchases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.games.map((g) => (
                          <tr key={g.game} className={BODY_ROW}>
                            <td className={TD}>
                              <Link href={`/games/${encodeURIComponent(g.game)}`} className="block truncate text-text hover:text-admin no-underline" title={g.game}>{g.name}</Link>
                              {g.name !== g.game && <Clip text={g.game} className="font-mono text-[11px] text-text-subtle" />}
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>{num(g.players)}</td>
                            <td className={`${TD} text-right tabular-nums text-text-muted`}>{num(g.sessions)}</td>
                            <td className={`${TD} text-right tabular-nums text-text-muted`}>{num(Math.round(g.playHours * 10) / 10)}</td>
                            <td className={`${TD} text-right tabular-nums text-text-muted`}>{num(g.rounds)}</td>
                            <td className={`${TD} text-right tabular-nums text-text-muted`}>{num(g.peak)}</td>
                            <td className={`${TD} text-right tabular-nums text-text-muted`}>{num(g.purchases)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableFrame>
                  )}
                </section>
              </>
            );
          })()
        )}

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h2 className="text-sm text-text font-semibold">Recent admin actions</h2>
            <Link href="/audit" className="text-xs text-admin hover:text-admin-hover">All admin actions</Link>
          </div>
          {recent.ok ? <AuditTable rows={recent.value} empty="No admin actions recorded yet." /> : <LoadError what="the admin actions" message={recent.message} />}
        </section>
        <p className="mt-3 text-xs text-text-subtle">
          Database <span className="font-mono">{env.mongoDbName}</span>.{" "}
          {env.portal ? "Refund and hold go through the portal link." : <span className="text-notice">Portal link not set: refund and hold are disabled.</span>}
        </p>
      </>
    );
  });
}

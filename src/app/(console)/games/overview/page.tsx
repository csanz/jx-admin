import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { LineChartPanel } from "@/components/charts/LineChartPanel";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { RangeSwitch } from "@/components/RangeSwitch";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { ACTIVITY_DEFAULT } from "@/lib/repo/analytics";
import { TOP_GAMES, getGamesOverview } from "@/lib/repo/games-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Games overview" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const hours = (h: number) => `${num(Math.round(h * 10) / 10)} h`;

/**
 * GAMES > OVERVIEW (owner 2026-11-18): the activity of the games for 1 week / 1 month / 1 year: players and sessions
 * per day across every game, the most active games ranked for the range, and a players-per-day line for each of the
 * top 10. Aggregated on the server (src/lib/repo/games-overview.ts); bot sessions left out.
 */
export default function GamesOverviewPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("games overview", async () => getGamesOverview(await mongoDb(), { range: one(sp.activity) }));
    const days = r.ok ? r.value.days : ACTIVITY_DEFAULT;
    const hrefFor = (n: number) => (n === ACTIVITY_DEFAULT ? "/games/overview" : `/games/overview?activity=${n}`);
    return (
      <>
        <PageHeader path="/games/overview" title="Games overview">
          <RangeSwitch days={days} hrefFor={hrefFor} />
        </PageHeader>
        {!r.ok ? (
          <LoadError what="the games overview" message={r.message} />
        ) : (
          (() => {
            const a = r.value;
            return (
              <>
                <p className="mb-2 text-xs text-text-subtle">
                  {a.from} to {a.to} (UTC days), every game. Bot sessions are left out.
                </p>
                <div className="grid gap-3 min-[900px]:grid-cols-2" data-testid="games-overall">
                  <LineChartPanel title="Players per day" total={`${num(a.players.total)} in the range`} points={a.players.points} series={[{ key: "players", label: "players" }]} note="distinct player ids, every game" curve="linear" />
                  <LineChartPanel title="Sessions per day" total={num(a.sessions.total)} points={a.sessions.points} series={[{ key: "seated", label: "seated" }, { key: "watching", label: "watching" }]} note={`${hours(a.playHours.total)} of play`} curve="linear" />
                </div>

                <section className="mt-8 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                    <h2 className="text-lg text-text font-semibold">Most active games</h2>
                    <p className="text-xs text-text-subtle">{num(a.games.length)} with activity in the range, by players then sessions</p>
                  </div>
                  {a.games.length === 0 ? (
                    <p className="text-sm text-text-subtle">No activity in the range.</p>
                  ) : (
                    <TableFrame>
                      <thead>
                        <tr className={HEAD_ROW}>
                          <th className={`${TH} w-10 text-right`}>#</th>
                          <th className={`${TH} w-[28%]`}>Game</th>
                          <th className={`${TH} text-right`}>Players</th>
                          <th className={`${TH} text-right`}>Sessions</th>
                          <th className={`${TH} text-right`}>Play hours</th>
                          <th className={`${TH} text-right`}>Rounds</th>
                          <th className={`${TH} text-right`}>Peak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.games.map((g, i) => (
                          <tr key={g.game} className={BODY_ROW} data-testid={`game-rank-${g.game}`}>
                            <td className={`${TD} text-right tabular-nums text-text-subtle`}>{i + 1}</td>
                            <td className={TD}>
                              <Link href={`/games/${encodeURIComponent(g.game)}`} className="block truncate text-text hover:text-admin no-underline" title={g.game}>{g.name}</Link>
                              {g.name !== g.game && <Clip text={g.game} className="font-mono text-[11px] text-text-subtle" />}
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>{num(g.players)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{num(g.sessions)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{hours(g.playHours)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{num(g.rounds)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{num(g.peak)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableFrame>
                  )}
                </section>

                <section className="mt-8 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                    <h2 className="text-lg text-text font-semibold">Top {Math.min(TOP_GAMES, a.top.length) || TOP_GAMES} games, players per day</h2>
                    <p className="text-xs text-text-subtle">one line per game, busiest first</p>
                  </div>
                  {a.top.length === 0 ? (
                    <p className="text-sm text-text-subtle">No activity in the range.</p>
                  ) : (
                    <div className="grid gap-3 min-[900px]:grid-cols-2" data-testid="games-top">
                      {a.top.map((g, i) => (
                        <LineChartPanel
                          key={g.game}
                          title={`${i + 1}. ${g.name}`}
                          total={`${num(g.players)} players`}
                          points={g.points}
                          series={[{ key: "players", label: "players" }]}
                          note={`${num(g.sessions)} sessions, ${hours(g.playHours)}`}
                          curve="linear"
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            );
          })()
        )}
      </>
    );
  });
}

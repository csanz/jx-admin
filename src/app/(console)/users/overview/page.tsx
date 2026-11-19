import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { LineChartPanel } from "@/components/charts/LineChartPanel";
import { Tile } from "@/components/JbuxBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { RangeSwitch } from "@/components/RangeSwitch";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { ACTIVITY_DEFAULT, ACTIVITY_RANGE_LABEL } from "@/lib/repo/analytics";
import { LAST_SEEN_LABEL, getUsersOverview, type LastSeenBucket } from "@/lib/repo/users-overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users overview" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** The list link for a last-seen bucket: the same window as the filter row's presets, where there is one. */
const LIST_HREF: Record<LastSeenBucket, string> = {
  today: "/users?active=1d&sort=active&dir=desc",
  week: "/users?active=7d&sort=active&dir=desc",
  month: "/users?active=30d&sort=active&dir=desc",
  older: "/users?sort=active&dir=asc",
  never: "/users?sort=active&dir=asc",
};

/**
 * USERS > OVERVIEW (owner 2026-11-19: "the same thing in overview with player traffic across the board on the users
 * section"): the accounts in numbers for 1 week / 1 month / 1 year, new accounts per day, players per day across
 * every game (accounts and guests), and every account by when it was last seen. Aggregated on the server
 * (src/lib/repo/users-overview.ts); bots left out.
 */
export default function UsersOverviewPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("users overview", async () => getUsersOverview(await mongoDb(), { range: one(sp.activity) }));
    const days = r.ok ? r.value.days : ACTIVITY_DEFAULT;
    const hrefFor = (n: number) => (n === ACTIVITY_DEFAULT ? "/users/overview" : `/users/overview?activity=${n}`);
    return (
      <>
        <PageHeader path="/users/overview" title="Users overview">
          <RangeSwitch days={days} hrefFor={hrefFor} />
        </PageHeader>
        {!r.ok ? (
          <LoadError what="the users overview" message={r.message} />
        ) : (
          (() => {
            const a = r.value;
            const range = ACTIVITY_RANGE_LABEL[a.days];
            return (
              <>
                <p className="mb-2 text-xs text-text-subtle">
                  {a.from} to {a.to} (UTC days). Bots are left out everywhere on this page.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2" data-testid="users-tiles">
                  <Tile label="accounts" note={<Link href="/users" className="text-admin no-underline hover:underline">the list</Link>}>{num(a.accounts)}</Tile>
                  <Tile label={`new, ${range}`} note="sign-ups in the range">{num(a.newAccounts.total)}</Tile>
                  <Tile label={`active, ${range}`} note="signed in or played in the range">{num(a.active)}</Tile>
                  <Tile label="returning" note="active, created before the range">{num(a.returning)}</Tile>
                  <Tile label="on the waitlist" note={<Link href="/users/waitlist" className="text-admin no-underline hover:underline">the waitlist</Link>}>{num(a.waitlist)}</Tile>
                  <Tile label="never active" note="no sign-in or play on record">{num(a.neverActive)}</Tile>
                </div>

                <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2" data-testid="users-charts">
                  <LineChartPanel title="New accounts per day" total={`${num(a.newAccounts.total)} in the range`} points={a.newAccounts.points} series={[{ key: "accounts", label: "accounts" }]} note="from each account's creation date" curve="linear" />
                  <LineChartPanel
                    title="Players per day, every game"
                    total={`${num(a.players.total)} in the range`}
                    points={a.players.points}
                    series={[{ key: "accounts", label: "accounts" }, { key: "guests", label: "guests" }]}
                    note={`${num(a.players.accounts)} accounts, ${num(a.players.guests)} guests (distinct ids, the games overview's count)`}
                    curve="linear"
                  />
                </div>

                <section className="mt-8 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                    <h2 className="text-lg text-text font-semibold">Last seen</h2>
                    <p className="text-xs text-text-subtle">every account by its latest sign-in or play; a week is 7 days, a month 30</p>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 grid gap-2" data-testid="users-last-seen">
                    {a.lastSeen.map((row) => (
                      <div key={row.bucket} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3 text-sm" data-testid={`last-seen-${row.bucket}`}>
                        <Link href={LIST_HREF[row.bucket]} className="text-text no-underline hover:text-admin">{LAST_SEEN_LABEL[row.bucket]}</Link>
                        <div className="h-2 rounded-full bg-border-subtle overflow-hidden" aria-hidden>
                          <div className="h-full rounded-full bg-admin" style={{ width: pct(row.share) }} />
                        </div>
                        <span className="text-right tabular-nums text-text-muted">{num(row.count)} <span className="text-text-subtle">({pct(row.share)})</span></span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            );
          })()
        )}
      </>
    );
  });
}

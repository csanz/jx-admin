import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { LoadError } from "@/components/LoadError";
import { BODY_ROW, Clip, HEAD_ROW, MoreLink, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { GAME_QUERY_MAX, listGames, type GameSort } from "@/lib/repo/games";
import { PAGE_SIZE } from "@/lib/repo/paging";

export const dynamic = "force-dynamic";
export const metadata = { title: "Games" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SORT_LABEL: Record<GameSort, string> = { plays: "Plays", rounds: "Rounds", updated: "Updated" };

/** Games, read only: search (slug, name, creator), sort by plays / rounds / updated, 50 at a time with "more". */
export default function GamesPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const r = await loadForPage("games", async () => listGames(await mongoDb(), { q: one(sp.q), sort: one(sp.sort), page: one(sp.page) }));
    const q = r.ok ? r.value.q : one(sp.q).slice(0, GAME_QUERY_MAX);
    const sort: GameSort = r.ok ? r.value.sort : "updated";
    const sortParam = (s: GameSort) => (s === "updated" ? null : s);
    return (
      <>
        <PageHeader path="/games" title="Games" />
        <form method="get" action="/games" className="flex flex-wrap items-center gap-2 mb-3" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search slug, name or creator"
            maxLength={GAME_QUERY_MAX}
            aria-label="Search games"
            className="w-full sm:w-96 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-admin"
          />
          {sort !== "updated" && <input type="hidden" name="sort" value={sort} />}
          <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover cursor-pointer">
            Search
          </button>
          {q && (
            <Link href={`/games${qs({ sort: sortParam(sort) })}`} className="text-xs text-text-subtle hover:text-text">
              Clear
            </Link>
          )}
          {r.ok && (
            <p className="text-xs text-text-subtle">
              {num(r.value.total)} {r.value.total === 1 ? "game" : "games"}
            </p>
          )}
        </form>
        <p className="mb-4 text-xs text-text-subtle">
          Sort:{" "}
          {(Object.keys(SORT_LABEL) as GameSort[]).map((s, i) => (
            <span key={s}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {s === sort ? (
                <span className="text-admin" aria-current="true">{SORT_LABEL[s]}</span>
              ) : (
                <Link href={`/games${qs({ q, sort: sortParam(s) })}`} className="text-text-muted hover:text-text">
                  {SORT_LABEL[s]}
                </Link>
              )}
            </span>
          ))}
        </p>
        {!r.ok ? (
          <LoadError what="the games" message={r.message} />
        ) : (
          <>
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={`${TH} w-[34%]`}>Game</th>
                  <th className={TH}>Creator</th>
                  <th className={TH}>Access</th>
                  <th className={`${TH} text-right`}>Plays</th>
                  <th className={`${TH} text-right`}>Rounds</th>
                  <th className={TH}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {r.value.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-subtle">{q ? "No game matches that search." : "No games yet."}</td>
                  </tr>
                )}
                {r.value.rows.map((g) => (
                  <tr key={g.id} className={BODY_ROW}>
                    <td className={TD}>
                      <Link href={`/games/${encodeURIComponent(g.slug)}`} className="text-text hover:text-admin no-underline">
                        {g.emoji && <span className="mr-2" aria-hidden="true">{g.emoji}</span>}
                        {g.name || g.slug}
                      </Link>
                      <p className="text-xs text-text-subtle font-mono">{g.slug}</p>
                    </td>
                    <td className={`${TD} text-text-muted`}><Clip text={g.creator || "n/a"} /></td>
                    <td className={`${TD} text-text-muted`}>{g.access || "n/a"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(g.plays)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(g.rounds)}</td>
                    <td className={`${TD} text-xs text-text-muted`}>{shortWhen(g.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            {r.value.hasMore && (
              <MoreLink
                href={`/games${qs({ q, sort: sortParam(sort), page: r.value.page + 1 })}`}
                shown={r.value.rows.length}
                total={r.value.total}
                step={PAGE_SIZE}
              />
            )}
          </>
        )}
      </>
    );
  });
}

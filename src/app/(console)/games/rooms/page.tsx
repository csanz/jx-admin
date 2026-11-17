import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { LoadError } from "@/components/LoadError";
import { Pager, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { RoomsTable } from "@/components/RoomsTable";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { listRooms, roomFilterOptions } from "@/lib/repo/rooms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rooms" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const select = "px-2 py-1.5 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";

/** Every room across the games, most recently updated first, filter by game and state, 25 a page. Read only. */
export default function RoomsPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const sp = await searchParams;
    const [r, opts] = await Promise.all([
      loadForPage("rooms", async () => listRooms(await mongoDb(), { game: one(sp.game), state: one(sp.state), page: one(sp.page) })),
      loadForPage("room filters", async () => roomFilterOptions(await mongoDb())),
    ]);
    const game = r.ok ? r.value.game : "";
    const state = r.ok ? r.value.state : "";
    const games = opts.ok ? opts.value.games : [];
    const states = opts.ok ? opts.value.states : [];
    return (
      <>
        <PageHeader path="/games/rooms" title="Rooms">
          {r.ok && <p className="text-xs text-text-subtle">{num(r.value.total)} {r.value.total === 1 ? "room" : "rooms"}</p>}
        </PageHeader>
        <form method="get" action="/games/rooms" className="flex flex-wrap items-center gap-2 mb-4">
          <label className="text-xs text-text-subtle" htmlFor="f-game">Game</label>
          <select id="f-game" name="game" defaultValue={game} className={select}>
            <option value="">all games</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label className="text-xs text-text-subtle" htmlFor="f-state">State</label>
          <select id="f-state" name="state" defaultValue={state} className={select}>
            <option value="">any state</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover cursor-pointer">Filter</button>
          {(game || state) && <Link href="/games/rooms" className="text-xs text-text-subtle hover:text-text">Clear</Link>}
        </form>
        {!r.ok ? (
          <LoadError what="the rooms" message={r.message} />
        ) : r.value.rows.length === 0 ? (
          <p className="text-sm text-text-subtle">{game || state ? "No room matches that filter." : "No rooms yet."}</p>
        ) : (
          <>
            <RoomsTable rows={r.value.rows} showGame />
            <Pager page={r.value.page} pageCount={r.value.pageCount} total={r.value.total} noun="rooms" hrefFor={(p) => `/games/rooms${qs({ game, state, page: p })}`} />
          </>
        )}
      </>
    );
  });
}

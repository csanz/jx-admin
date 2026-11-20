import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { ClipsTable } from "@/components/ClipsTable";
import { LoadError } from "@/components/LoadError";
import { Pager, qs } from "@/components/ListBits";
import { PageHeader } from "@/components/PageHeader";
import { CLIPS_PAGE_SIZE, loadClips, parseClipsQuery } from "@/lib/clips";
import { clipsApiUrlIfSet, portalUrlIfSet } from "@/lib/env";
import { num } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { gameSlugs } from "@/lib/repo/games";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clips" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const select = "px-2 py-1.5 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";

/**
 * CONTENT > CLIPS (owner 2026-11-20): every clip in the clips pipeline, newest first, filter by game and featured,
 * 25 a page. Read only, from the clips API's public list (src/lib/clips.ts, the URL from src/lib/env.ts). Without that
 * URL the page says clips are not connected and nothing more.
 */
export default function ClipsPage({ searchParams }: { searchParams: SP }) {
  return gatedPage(async () => {
    const q = parseClipsQuery(await searchParams);
    const api = clipsApiUrlIfSet();
    const [r, games] = await Promise.all([
      loadClips(api, q),
      api ? loadForPage("game slugs", async () => gameSlugs(await mongoDb())) : Promise.resolve({ ok: true as const, value: [] as string[] }),
    ]);
    const slugs = games.ok ? games.value : [];
    if (q.game && !slugs.includes(q.game)) slugs.push(q.game);
    const filtered = Boolean(q.game || q.featured);
    const hrefFor = (page: number) => `/content/clips${qs({ game: q.game, featured: q.featured ? 1 : "", page })}`;
    return (
      <>
        <PageHeader path="/content/clips" title="Clips">
          {r.ok && <p className="text-xs text-text-subtle" data-testid="clips-count">{num(r.value.total)} {r.value.total === 1 ? "clip" : "clips"}</p>}
        </PageHeader>
        {!r.ok && r.kind === "off" ? (
          <div className="bg-surface border border-border rounded-xl p-4 max-w-2xl" data-testid="clips-off">
            <p className="text-sm text-text">{r.message}</p>
            <p className="mt-2 text-sm text-text-muted">The clips list is not available here yet.</p>
          </div>
        ) : (
          <>
            <form method="get" action="/content/clips" className="flex flex-wrap items-center gap-2 mb-4">
              <label className="text-xs text-text-subtle" htmlFor="f-game">Game</label>
              <select id="f-game" name="game" defaultValue={q.game} className={select} data-testid="filter-game">
                <option value="">all games</option>
                {slugs.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <label className="text-xs text-text-subtle" htmlFor="f-featured">Featured</label>
              <select id="f-featured" name="featured" defaultValue={q.featured ? "1" : ""} className={select} data-testid="filter-featured">
                <option value="">all clips</option>
                <option value="1">featured only</option>
              </select>
              <button type="submit" className="px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover cursor-pointer">Filter</button>
              {filtered && <Link href="/content/clips" className="text-xs text-text-subtle hover:text-text">Clear</Link>}
            </form>
            {!r.ok ? (
              <LoadError what="the clips" message={r.message} />
            ) : r.value.rows.length === 0 ? (
              <>
                <p className="text-sm text-text-subtle" data-testid="clips-empty">
                  {r.value.total > 0 ? "Nothing on this page." : filtered ? "No clip matches that filter." : "No clips yet."}
                </p>
                {r.value.total > 0 && (
                  <Link href={hrefFor(1)} className="mt-3 inline-block px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:text-text no-underline">Back to page 1</Link>
                )}
              </>
            ) : (
              <>
                <ClipsTable rows={r.value.rows} portalUrl={portalUrlIfSet()} />
                <Pager page={r.value.page} pageCount={r.value.pageCount} total={r.value.total} noun="clips" hrefFor={hrefFor} />
                {r.value.rows.length < Math.min(CLIPS_PAGE_SIZE, r.value.total - (r.value.page - 1) * CLIPS_PAGE_SIZE) && (
                  <p className="mt-2 text-xs text-text-subtle">Some records on this page were not clips and are left out.</p>
                )}
              </>
            )}
          </>
        )}
      </>
    );
  });
}

import Link from "next/link";
import type { ReactNode } from "react";
import { gatedPage } from "@/components/AdminGate";
import { PlayerIdLink } from "@/components/DetailBits";
import { GameMembersControl } from "@/components/GameMembersControl";
import { LoadError } from "@/components/LoadError";
import { BODY_ROW, HEAD_ROW, Pager, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { RoomsTable } from "@/components/RoomsTable";
import { PageHeader } from "@/components/PageHeader";
import { portalUrlIfSet } from "@/lib/env";
import { num, shortWhen, when } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { getGameDetail } from "@/lib/repo/games";
import { listRooms } from "@/lib/repo/rooms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game" };

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
        <h2 className="text-lg text-text font-semibold">{title}</h2>
        {note && <p className="text-xs text-text-subtle">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">{label}</dt>
      <dd className="mt-0.5 text-sm text-text break-words">{children}</dd>
    </div>
  );
}

const dash = (s: string) => s || "n/a";

/** One game: its fields and counters (read only), its PEOPLE (the owner, and the admins and contributors the console can
 * set, owner 2026-11-18), its keys (count, label, created; never a key value), its join requests and its rooms (25 a
 * page, ?page=n, each room opens its own page). */
export default function GamePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return gatedPage(async () => {
    const { slug: raw } = await params;
    const sp = await searchParams;
    const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
    let slug = raw;
    try {
      slug = decodeURIComponent(raw);
    } catch {
      /* a malformed escape: look the raw text up (it matches no slug) */
    }
    const r = await loadForPage("game", async () => getGameDetail(await mongoDb(), slug));
    if (!r.ok) {
      return (
        <>
          <PageHeader path={`/games/${raw}`} title={slug} />
          <LoadError what="this game" message={r.message} />
        </>
      );
    }
    if (!r.value) {
      return (
        <>
          <PageHeader path={`/games/${raw}`} title="Game not found" />
          <p className="text-sm text-text-muted">
            No game has the slug <span className="font-mono">{slug}</span>.{" "}
            <Link href="/games" className="text-admin hover:text-admin-hover">Back to the games</Link>
          </p>
        </>
      );
    }
    const { game: g, keys, joinRequests, members } = r.value;
    const rooms = await loadForPage("game rooms", async () => listRooms(await mongoDb(), { game: g.slug, page: pageParam }));
    const c = g.counters;
    return (
      <>
        <PageHeader path={`/games/${raw}`} title={`${g.emoji ? `${g.emoji} ` : ""}${g.name || g.slug}`}>
          <p className="text-xs text-text-subtle">Read only, except People</p>
        </PageHeader>

        <div className="bg-surface border border-border rounded-xl p-4">
          {g.description && <p className="text-sm text-text-muted mb-4 max-w-3xl">{g.description}</p>}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Slug"><span className="font-mono">{g.slug}</span></Field>
            <Field label="Name">{dash(g.name)}</Field>
            <Field label="Emoji">{dash(g.emoji)}</Field>
            <Field label="Creator">
              {dash(g.creator.name)}
              {g.creator.id && <span className="block text-[11px] text-text-subtle font-mono">{g.creator.id}</span>}
            </Field>
            <Field label="Access">{dash(g.access)}</Field>
            <Field label="Tags">{g.tags.length ? g.tags.join(", ") : "none"}</Field>
            <Field label="Client URL">
              {g.clientUrl ? <a href={g.clientUrl} target="_blank" rel="noreferrer" className="text-admin hover:text-admin-hover break-all">{g.clientUrl}</a> : "n/a"}
            </Field>
            <Field label="Discord URL">
              {g.discordUrl ? <a href={g.discordUrl} target="_blank" rel="noreferrer" className="text-admin hover:text-admin-hover break-all">{g.discordUrl}</a> : "n/a"}
            </Field>
            <Field label="Studio enabled">{g.studioEnabled ? "yes" : "no"}</Field>
            <Field label="Created">{when(g.createdAt)}</Field>
            <Field label="Updated">{when(g.updatedAt)}</Field>
            <Field label="Id"><span className="font-mono text-xs">{g.id}</span></Field>
          </dl>
        </div>

        <Section title="People" note={`${num(members.items.length)} besides the owner. An admin does everything the owner can on this game.`}>
          <GameMembersControl slug={g.slug} gameName={g.name || g.slug} members={members} portalUrl={portalUrlIfSet()} />
        </Section>

        <Section title="Counters">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {(
              [
                ["likes", c.likes], ["dislikes", c.dislikes], ["favorites", c.favorites], ["views", c.views],
                ["plays", c.plays], ["peeks", c.peeks], ["rounds completed", c.roundsCompleted],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="bg-surface border border-border rounded-lg px-3 py-2">
                <p className="text-lg text-text font-semibold font-sans tabular-nums">{num(v)}</p>
                <p className="text-[11px] text-text-muted">{label}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Keys" note={`${num(keys.count)} ${keys.count === 1 ? "key" : "keys"}. Key values are never shown here.`}>
          {keys.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No keys.</p>
          ) : (
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>Label</th>
                  <th className={TH}>Environment</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Created</th>
                </tr>
              </thead>
              <tbody>
                {keys.items.map((k, i) => (
                  <tr key={i} className={BODY_ROW}>
                    <td className={TD}>{dash(k.label)}</td>
                    <td className={`${TD} text-text-muted`}>{dash(k.environment)}</td>
                    <td className={`${TD} text-text-muted`}>{dash(k.status)}</td>
                    <td className={`${TD} text-text-muted `}>{shortWhen(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Section>

        <Section title="Join requests" note={`${num(joinRequests.count)} in all${joinRequests.count > joinRequests.items.length ? `, newest ${joinRequests.items.length} shown` : ""}`}>
          {joinRequests.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No join requests.</p>
          ) : (
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>Who</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Asked</th>
                  <th className={TH}>Decided</th>
                  <th className={TH}>Decided by</th>
                </tr>
              </thead>
              <tbody>
                {joinRequests.items.map((j) => (
                  <tr key={j.id} className={BODY_ROW}>
                    <td className={TD}>
                      {j.email ?? "unknown user"}
                      <PlayerIdLink id={j.userId} />
                    </td>
                    <td className={`${TD} ${j.status === "pending" ? "text-notice" : "text-text-muted"}`}>{dash(j.status)}</td>
                    <td className={`${TD} text-text-muted `}>{shortWhen(j.createdAt)}</td>
                    <td className={`${TD} text-text-muted `}>{shortWhen(j.decidedAt)}</td>
                    <td className={`${TD} text-text-muted`}>{j.decidedBy ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Section>

        <Section title="Rooms" note={rooms.ok ? `${num(rooms.value.total)} in all, most recently updated first` : undefined}>
          {!rooms.ok ? (
            <LoadError what="the rooms" message={rooms.message} />
          ) : rooms.value.rows.length === 0 ? (
            <p className="text-sm text-text-subtle">No rooms.</p>
          ) : (
            <>
              <RoomsTable rows={rooms.value.rows} />
              <Pager
                page={rooms.value.page}
                pageCount={rooms.value.pageCount}
                total={rooms.value.total}
                noun="rooms"
                hrefFor={(p) => `/games/${encodeURIComponent(g.slug)}${qs({ page: p })}`}
              />
              <p className="mt-1 text-xs text-text-subtle">
                <Link href={`/games/rooms${qs({ game: g.slug })}`} className="text-admin hover:text-admin-hover">All rooms of this game with filters</Link>
              </p>
            </>
          )}
        </Section>
      </>
    );
  });
}

import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { FieldList, PlayerIdLink, Section, cappedNote } from "@/components/DetailBits";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { duration, num, shortWhen } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { getRoomDetail } from "@/lib/repo/rooms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Room" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * One room, read only: every field of its document, then everything that names it by room_id: sessions
 * (game_sessions), matches with their timeline, the server event log (newest or oldest first), the latest live
 * snapshots as formatted JSON, and client reports. Each list is capped and labelled with its count.
 */
export default function RoomPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: SP }) {
  return gatedPage(async () => {
    const { roomId: raw } = await params;
    let roomId = raw;
    try {
      roomId = decodeURIComponent(raw);
    } catch {
      /* a malformed escape matches no room */
    }
    const sp = await searchParams;
    const order = (Array.isArray(sp.events) ? sp.events[0] : sp.events) === "oldest" ? "oldest" : "newest";
    const path = `/games/rooms/${raw}`;
    const r = await loadForPage("room", async () => getRoomDetail(await mongoDb(), roomId, { eventsOrder: order }));
    if (!r.ok) {
      return (
        <>
          <PageHeader path={path} title={roomId} />
          <LoadError what="this room" message={r.message} />
        </>
      );
    }
    if (!r.value) {
      return (
        <>
          <PageHeader path={path} title="Not a room id" />
          <p className="text-sm text-text-muted">
            That is not a room id. <Link href="/games/rooms" className="text-admin hover:text-admin-hover">Back to the rooms</Link>
          </p>
        </>
      );
    }
    const d = r.value;
    const row = d.row;
    return (
      <>
        <PageHeader path={path} title={row?.name ? `${row.name} (${d.roomId})` : d.roomId}>
          {row?.game && (
            <Link href={`/games/${encodeURIComponent(row.game)}`} className="text-xs text-admin hover:text-admin-hover">
              Game {row.game}
            </Link>
          )}
        </PageHeader>

        {row && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
            {(
              [
                ["state", row.state || "n/a"],
                ["phase", row.phase || "n/a"],
                ["players", `${row.players}/${row.max ?? "n/a"}`],
                ["watchers", String(row.watchers)],
                ["worker", row.hasWorker ? "yes" : "no"],
                ["updated", shortWhen(row.updatedAt)],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="bg-surface border border-border rounded-lg px-3 py-2 min-w-0">
                <p className="text-sm text-text font-semibold truncate" title={v}>{v}</p>
                <p className="text-[11px] text-text-muted">{label}</p>
              </div>
            ))}
          </div>
        )}

        <Section title="Room document" note={d.fields ? `${d.fields.length} fields` : undefined}>
          {d.fields ? <FieldList fields={d.fields} /> : <p className="text-sm text-text-subtle">No room document with this id (the logs below may still name it).</p>}
        </Section>

        <Section title="Sessions" note={cappedNote(d.sessions.count, d.sessions.items.length)}>
          {d.sessions.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No sessions.</p>
          ) : (
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={`${TH} w-[24%]`}>Player</th>
                  <th className={`${TH} w-[9%]`}>Role</th>
                  <th className={`${TH} w-[8%]`}>Seated</th>
                  <th className={TH}>Joined</th>
                  <th className={TH}>Left</th>
                  <th className={`${TH} w-[10%] text-right`}>Duration</th>
                  <th className={`${TH} w-[8%] text-right`}>Conn</th>
                </tr>
              </thead>
              <tbody>
                {d.sessions.items.map((s) => (
                  <tr key={s.id} className={BODY_ROW}>
                    <td className={TD}>
                      <Clip text={s.name || "n/a"} className="text-text" />
                      <PlayerIdLink id={s.playerId} />
                    </td>
                    <td className={`${TD} text-xs text-text-muted`}>{s.role || "n/a"}</td>
                    <td className={`${TD} text-xs text-text-muted`}>{s.seated ? "yes" : "no"}</td>
                    <td className={`${TD} text-xs text-text-muted`}>{shortWhen(s.joinedAt)}</td>
                    <td className={`${TD} text-xs text-text-muted`}>{s.open ? <span className="text-success">still in</span> : shortWhen(s.leftAt)}</td>
                    <td className={`${TD} text-xs text-right tabular-nums`}>{duration(s.durationS)}</td>
                    <td className={`${TD} text-xs text-right text-text-muted tabular-nums`}>{s.connId || "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Section>

        <Section title="Matches" note={cappedNote(d.matches.count, d.matches.items.length)}>
          {d.matches.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No matches recorded.</p>
          ) : (
            <ul className="space-y-2">
              {d.matches.items.map((m) => (
                <li key={m.id} className="bg-surface border border-border rounded-xl px-4 py-3 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="text-text">{shortWhen(m.at)}</span>
                    <span className="text-xs text-text-muted font-mono break-all">{m.roundId || "no round id"}</span>
                    <span className="text-xs text-text-muted">{num(m.players)} {m.players === 1 ? "player" : "players"}</span>
                  </div>
                  {m.playerNames.length > 0 && <p className="mt-1 text-xs text-text-subtle break-words">{m.playerNames.join(", ")}</p>}
                  {m.timeline === null ? (
                    <p className="mt-1 text-xs text-text-subtle">No timeline.</p>
                  ) : (
                    <details className="mt-1">
                      <summary className="text-xs text-text-muted cursor-pointer">Timeline ({num(m.timeline.length)} entries)</summary>
                      <ol className="mt-1 space-y-0.5 text-xs text-text-muted font-mono list-decimal pl-6">
                        {m.timeline.map((t, i) => <li key={i} className="break-words [overflow-wrap:anywhere]">{t}</li>)}
                      </ol>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Event log"
          note={`server_events, ${cappedNote(d.events.count, d.events.items.length, order)}`}
          right={
            <Link href={`${path}${order === "newest" ? "?events=oldest" : ""}`} scroll={false} className="text-admin hover:text-admin-hover">
              {order === "newest" ? "Show oldest first" : "Show newest first"}
            </Link>
          }
        >
          {d.events.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No server events.</p>
          ) : (
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>When</th>
                  <th className={TH}>Event</th>
                  <th className={`${TH} text-right`}>Players</th>
                </tr>
              </thead>
              <tbody>
                {d.events.items.map((e) => (
                  <tr key={e.id} className={BODY_ROW}>
                    <td className={`${TD} text-xs text-text-muted`} title={e.at ?? ""}>{shortWhen(e.at)}</td>
                    <td className={`${TD} text-xs text-text`}>{e.type || "n/a"}</td>
                    <td className={`${TD} text-xs text-right tabular-nums`}>{e.playerCount ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Section>

        <Section title="Live snapshots" note={cappedNote(d.snapshots.count, d.snapshots.items.length, "latest")}>
          {d.snapshots.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No snapshots.</p>
          ) : (
            <div className="space-y-2">
              {d.snapshots.items.map((s, i) => (
                <details key={s.id} open={i === 0} className="bg-surface border border-border rounded-xl min-w-0">
                  <summary className="px-4 py-2 text-sm text-text-muted cursor-pointer">
                    <span className="text-text">{s.kind || "snapshot"}</span> saved {shortWhen(s.savedAt)}
                    {s.cut && <span className="ml-2 text-xs text-notice">cut to the first 20,000 characters</span>}
                  </summary>
                  <pre className="px-4 pb-3 text-xs text-text-muted font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{s.text}</pre>
                </details>
              ))}
            </div>
          )}
        </Section>

        <Section title="Client reports" note={cappedNote(d.reports.count, d.reports.items.length)}>
          {d.reports.items.length === 0 ? (
            <p className="text-sm text-text-subtle">No client reports.</p>
          ) : (
            <TableFrame>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={`${TH} w-[14%]`}>Received</th>
                  <th className={`${TH} w-[14%]`}>Name</th>
                  <th className={TH}>Device</th>
                  <th className={`${TH} w-[11%]`}>Reason</th>
                  <th className={`${TH} w-[8%] text-right`}>Errors</th>
                  <th className={`${TH} w-[10%] text-right`}>Session</th>
                </tr>
              </thead>
              <tbody>
                {d.reports.items.map((c) => (
                  <tr key={c.id} className={BODY_ROW}>
                    <td className={`${TD} text-xs text-text-muted`}>{shortWhen(c.at)}</td>
                    <td className={`${TD} text-xs`}><Clip text={c.name || "n/a"} /></td>
                    <td className={`${TD} text-xs text-text-muted`}><Clip text={c.device || "n/a"} /></td>
                    <td className={`${TD} text-xs text-text-muted`}>{c.reason || "n/a"}</td>
                    <td className={`${TD} text-xs text-right tabular-nums ${c.errors ? "text-danger" : "text-text-muted"}`}>{c.errors}</td>
                    <td className={`${TD} text-xs text-right tabular-nums`}>{c.sessionMs === null ? "n/a" : duration(c.sessionMs / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Section>
      </>
    );
  });
}

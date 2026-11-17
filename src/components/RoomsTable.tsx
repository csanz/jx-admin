import Link from "next/link";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH } from "@/components/ListBits";
import { shortWhen } from "@/lib/format";
import type { RoomRow } from "@/lib/repo/rooms";

export function roomHref(roomId: string): string {
  return `/games/rooms/${encodeURIComponent(roomId)}`;
}

/** A room id that links to the room's page. */
export function RoomLink({ roomId, className = "" }: { roomId: string; className?: string }) {
  if (!roomId) return <span className="text-text-subtle">n/a</span>;
  return (
    <Link href={roomHref(roomId)} className={`block truncate font-mono text-admin hover:text-admin-hover no-underline ${className}`} title={roomId}>
      {roomId}
    </Link>
  );
}

const yes = (b: boolean) => (b ? "yes" : "no");

/** The rooms table: the columns that matter, fitted to the pane; each room id opens the room's page. */
export function RoomsTable({ rows, showGame = false }: { rows: RoomRow[]; showGame?: boolean }) {
  return (
    <TableFrame>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-[18%]`}>Room</th>
          <th className={TH}>Name</th>
          {showGame && <th className={`${TH} w-[11%]`}>Game</th>}
          <th className={`${TH} w-[8%]`}>State</th>
          <th className={`${TH} w-[9%]`}>Phase</th>
          <th className={`${TH} w-[7%] text-right`} title="players / max">Players</th>
          <th className={`${TH} w-[6%] text-right`}>Round</th>
          <th className={`${TH} w-[7%]`} title="has_worker">Worker</th>
          <th className={`${TH} w-[6%]`}>Test</th>
          <th className={`${TH} w-[13%]`}>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.roomId} className={BODY_ROW}>
            <td className={TD}><RoomLink roomId={r.roomId} className="text-xs" /></td>
            <td className={TD}><Clip text={r.name || "n/a"} className={r.name ? "text-text" : "text-text-subtle"} /></td>
            {showGame && <td className={`${TD} text-text-muted text-xs`}><Clip text={r.game || "n/a"} /></td>}
            <td className={`${TD} text-xs ${r.state === "open" ? "text-success" : "text-text-muted"}`}>{r.state || "n/a"}</td>
            <td className={`${TD} text-xs text-text-muted`}><Clip text={r.phase || "n/a"} /></td>
            <td className={`${TD} text-xs text-right tabular-nums`} title={`${r.players} players, ${r.watchers} watchers`}>
              {r.players}
              <span className="text-text-subtle">/{r.max ?? "n/a"}</span>
            </td>
            <td className={`${TD} text-xs text-right text-text-muted tabular-nums`}>{r.round || "n/a"}</td>
            <td className={`${TD} text-xs text-text-muted`}>{yes(r.hasWorker)}</td>
            <td className={`${TD} text-xs ${r.test ? "text-notice" : "text-text-muted"}`}>{yes(r.test)}</td>
            <td className={`${TD} text-xs text-text-muted`} title={r.updatedAt ?? ""}>{shortWhen(r.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

import Link from "next/link";
import { BODY_ROW, Clip, HEAD_ROW, TableFrame, TD, TH } from "@/components/ListBits";
import { Poster } from "@/components/Poster";
import { duration, num, shortWhen } from "@/lib/format";
import { clipPersonLabel, clipShareUrl, type ClipPerson, type ClipRow } from "@/lib/clips";

/** The words for a clip's tags (the portal's CLIP_TAG_WORDS, jx-portal src/lib/game-clips-core.ts). */
const TAG_WORDS: Readonly<Record<string, string>> = { headshot: "HEADSHOT", "long-shot": "LONG SHOT", "final-kill": "FINAL KILL", airborne: "AIRBORNE", sliding: "SLIDING" };

/** A player in a clip: the name, linking to the user page when they were signed in; bots marked. */
function Person({ p }: { p: ClipPerson | null }) {
  if (!p) return <span className="text-text-subtle">n/a</span>;
  const label = clipPersonLabel(p);
  if (p.userId) {
    return (
      <Link href={`/users/${p.userId}`} className="block truncate text-text hover:text-admin no-underline" title={label}>{label}</Link>
    );
  }
  return <Clip text={label} className={p.bot ? "text-text-subtle" : "text-text-muted"} />;
}

const pill = "inline-block rounded px-1.5 py-0.5 text-[10px] leading-4 tracking-[0.08em] uppercase border border-border text-text-muted";

/**
 * The clips table (Content > Clips): poster, game, who shot whom, what the shot was, who saved it, whether it stays,
 * when. Each poster opens the clip's share page on the portal (or the video itself when the portal URL is unknown).
 * Fitted to the pane, no inner scroll.
 */
export function ClipsTable({ rows, portalUrl }: { rows: ClipRow[]; portalUrl: string | null }) {
  return (
    <TableFrame>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-[12%]`}>Clip</th>
          <th className={`${TH} w-[11%]`}>Game</th>
          <th className={`${TH} w-[13%]`}>Shooter</th>
          <th className={`${TH} w-[13%]`}>Hit</th>
          <th className={`${TH} w-[15%]`}>Shot</th>
          <th className={`${TH} w-[6%] text-right`}>Saves</th>
          <th className={`${TH} w-[9%]`}>Featured</th>
          <th className={`${TH} w-[11%]`}>Stays</th>
          <th className={`${TH} w-[10%]`}>Made</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = clipShareUrl(portalUrl, r) ?? r.clip;
          const shot = [...r.tags.map((t) => TAG_WORDS[t] ?? t.replace(/-/g, " ").toUpperCase())];
          if (!r.tags.length && r.headshot) shot.push(TAG_WORDS.headshot);
          return (
            <tr key={r.clipId} className={BODY_ROW} data-testid="clip-row">
              <td className={TD}>
                <a href={href} target="_blank" rel="noreferrer" className="block no-underline group" title={r.clipId}>
                  <Poster src={r.poster} />
                  <span className="mt-1 block truncate font-mono text-[11px] text-admin group-hover:text-admin-hover">{r.clipId}</span>
                </a>
                <span className="block text-[11px] text-text-subtle tabular-nums">{duration(r.durationS)}{r.gif ? ", gif" : ""}</span>
              </td>
              <td className={`${TD} text-xs`}>
                {r.game ? (
                  <Link href={`/games/${encodeURIComponent(r.game)}`} className="block truncate text-text-muted hover:text-admin no-underline" title={r.game}>{r.game}</Link>
                ) : (
                  <span className="text-text-subtle">n/a</span>
                )}
              </td>
              <td className={`${TD} text-xs`}><Person p={r.killer} /></td>
              <td className={`${TD} text-xs`}><Person p={r.victim} /></td>
              <td className={`${TD} text-xs`}>
                <span className="flex flex-wrap gap-1">
                  {shot.map((t) => <span key={t} className={pill}>{t}</span>)}
                  {r.score !== null && <span className={`${pill} text-text`} title="score">{num(r.score)}</span>}
                  {r.distanceM !== null && <span className="text-text-subtle self-center">{Math.round(r.distanceM)} m</span>}
                </span>
              </td>
              <td className={`${TD} text-xs text-right tabular-nums text-text-muted`}>{r.savedBy}</td>
              <td className={`${TD} text-xs ${r.featured ? "text-success" : "text-text-muted"}`}>{r.featured ? "yes" : "no"}</td>
              <td className={`${TD} text-xs ${r.kept ? "text-text-muted" : "text-notice"}`} title={r.expiresAt ?? ""}>
                {r.kept ? "kept" : `until ${shortWhen(r.expiresAt)}`}
              </td>
              <td className={`${TD} text-xs text-text-muted`} title={r.renderedAt ?? r.createdAt ?? ""}>{shortWhen(r.renderedAt ?? r.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableFrame>
  );
}

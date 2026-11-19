import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { Avatar } from "@/components/Avatar";
import { FieldList, Section } from "@/components/DetailBits";
import { BODY_ROW, Clip, HEAD_ROW, Pager, TableFrame, TD, TH, qs } from "@/components/ListBits";
import { LoadError } from "@/components/LoadError";
import { PageHeader } from "@/components/PageHeader";
import { RoleControl } from "@/components/RoleControl";
import { roleLabel } from "@/lib/roles";
import { RoomLink } from "@/components/RoomsTable";
import { avatarSrc } from "@/lib/avatar";
import { portalUrlIfSet } from "@/lib/env";
import { duration, num, shortWhen, when } from "@/lib/format";
import { mongoDb } from "@/lib/mongo";
import { loadForPage } from "@/lib/page-load";
import { getUserDetail } from "@/lib/repo/user-detail";
import { ACTIVITY_DEFAULT, ACTIVITY_RANGES, ACTIVITY_RANGE_LABEL, getUserActivity } from "@/lib/repo/user-activity";
import { LineChartPanel } from "@/components/charts/LineChartPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "User" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * One user: the header (avatar, name, role, waitlist state) with the set-role control, the wallet summary, the
 * sign-ins the portal records, the activity line (plays per day over 1 week / 1 month / 1 year, ?activity=), the
 * play history and the game sessions (each newest first, 50 a page), then every field of the users row with
 * secret-looking fields redacted.
 */
export default function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  return gatedPage(async (actor) => {
    const { id } = await params;
    const sp = await searchParams;
    const plays = one(sp.plays);
    const sessions = one(sp.sessions);
    const activity = one(sp.activity);
    const path = `/users/${id}`;
    const r = await loadForPage("user", async () => {
      const db = await mongoDb();
      const detail = await getUserDetail(db, id, { playsPage: plays, sessionsPage: sessions });
      return detail && { detail, activity: await getUserActivity(db, detail.user.id, { range: activity }) };
    });
    if (!r.ok) {
      return (
        <>
          <PageHeader path={path} title="User" />
          <LoadError what="this user" message={r.message} />
        </>
      );
    }
    if (!r.value) {
      return (
        <>
          <PageHeader path={path} title="User not found" />
          <p className="text-sm text-text-muted">
            No user has that id. <Link href="/users" className="text-admin hover:text-admin-hover">Back to the users</Link>
          </p>
        </>
      );
    }
    const d = r.value.detail;
    const act = r.value.activity;
    const u = d.user;
    const label = u.name || u.username || u.email || u.id;
    const privileged = u.role === "admin" || u.role === "developer" || u.role === "bot";
    const href = (p: { plays?: number; sessions?: number; activity?: number }) =>
      `${path}${qs({
        activity: (p.activity ?? act.days) !== ACTIVITY_DEFAULT ? (p.activity ?? act.days) : null,
        plays: p.plays ?? (d.plays.page > 1 ? d.plays.page : null),
        sessions: p.sessions ?? (d.sessions.page > 1 ? d.sessions.page : null),
      })}`;
    return (
      <>
        <PageHeader path={path} title={label} />

        <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
          <Avatar src={avatarSrc(u.image || u.imageSmall, portalUrlIfSet())} label={label} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-text break-words">
              {u.name || "n/a"}
              {u.username && <span className="ml-2 text-text-muted">@{u.username}</span>}
            </p>
            <p className="text-xs text-text-subtle break-words">{u.email || "no email"}</p>
            <p className="mt-1 text-xs text-text-muted">
              Role <span className={u.role === "admin" ? "text-admin" : "text-text"}>{roleLabel(u.role)}</span>
              <span className="mx-2" aria-hidden="true">·</span>
              Waitlist{" "}
              {privileged ? <span className="text-text-subtle">always has access</span> : u.access === "waitlist" ? <span className="text-notice">waiting</span> : <span className="text-success">approved</span>}
            </p>
          </div>
          <div className="ml-auto">
            <RoleControl key={u.role} user={u} adminEmail={actor.email} adminId={actor.id} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-surface border border-border rounded-lg px-3 py-2">
            <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">Signed up (first sign-in)</p>
            <p className="mt-0.5 text-sm text-text">{when(d.signIns.first)}</p>
          </div>
          <div className="bg-surface border border-border rounded-lg px-3 py-2">
            <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">Latest sign-in</p>
            <p className="mt-0.5 text-sm text-text">{when(d.signIns.latest)}</p>
          </div>
          <div className="bg-surface border border-border rounded-lg px-3 py-2 sm:col-span-2">
            <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">Wallet</p>
            {d.wallet ? (
              <p className="mt-0.5 text-sm text-text tabular-nums">
                {num(d.wallet.balance)} JBux
                <span className="text-text-subtle"> (real {num(d.wallet.real)} · test {num(d.wallet.test)} · promo {num(d.wallet.promo)})</span>
                {d.wallet.hold && <span className="ml-2 text-notice">on hold: {d.wallet.hold}</span>}
                <span className="block text-[11px] text-text-subtle">updated {shortWhen(d.wallet.updatedAt)}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-text-subtle">No wallet.</p>
            )}
          </div>
        </div>
        {d.signIns.onlyLatestStored && (
          <p className="mt-2 text-xs text-text-subtle">
            Sign-ins: the portal keeps only the first (createdAt) and the latest (lastLoginAt) sign-in; it uses JWT sessions
            with no sessions or accounts collection, so there is no sign-in history. The play history and game sessions
            below are the dated record of when this person played.
          </p>
        )}

        <Section
          title="Activity"
          note={`${num(act.total)} ${act.total === 1 ? "play" : "plays"} on ${num(act.activeDays)} of the last ${act.days} days`}
          right={
            <nav aria-label="Activity range" className="flex items-center gap-1" data-testid="activity-range">
              {ACTIVITY_RANGES.map((n) => (
                <Link
                  key={n}
                  href={href({ activity: n })}
                  scroll={false}
                  aria-current={n === act.days ? "true" : undefined}
                  className={`px-2.5 py-1 rounded-md border no-underline ${n === act.days ? "border-admin text-admin" : "border-border text-text-muted hover:text-text"}`}
                >
                  {ACTIVITY_RANGE_LABEL[n]}
                </Link>
              ))}
            </nav>
          }
        >
          <LineChartPanel title="Plays per day" total={act.peak ? `busiest day ${num(act.peak)}` : "no plays in the range"} points={act.points} series={[{ key: "plays", label: "plays" }]} note="a play is one sitting in a game, from the play history; UTC days" curve="linear" />
        </Section>

        <Section title="Play history" note={`${num(d.plays.total)} in all, newest first`}>
          {d.plays.rows.length === 0 ? (
            <p className="text-sm text-text-subtle">No plays recorded.</p>
          ) : (
            <>
              <TableFrame>
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={`${TH} w-[30%]`}>Played</th>
                    <th className={TH}>Game</th>
                  </tr>
                </thead>
                <tbody>
                  {d.plays.rows.map((p) => (
                    <tr key={p.id} className={BODY_ROW}>
                      <td className={`${TD} text-xs text-text-muted`}>{shortWhen(p.playedAt)}</td>
                      <td className={TD}>
                        {p.gameSlug ? (
                          <Link href={`/games/${encodeURIComponent(p.gameSlug)}`} className="text-text hover:text-admin no-underline">{p.gameName || p.gameSlug}</Link>
                        ) : (
                          <span className="font-mono text-xs text-text-subtle">{p.gameId || "n/a"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
              <Pager page={d.plays.page} pageCount={d.plays.pageCount} total={d.plays.total} noun="plays" hrefFor={(p) => href({ plays: p })} />
            </>
          )}
        </Section>

        <Section title="Game sessions" note={`${num(d.sessions.total)} in all, newest first`}>
          {d.sessions.rows.length === 0 ? (
            <p className="text-sm text-text-subtle">No game sessions.</p>
          ) : (
            <>
              <TableFrame>
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={`${TH} w-[16%]`}>Game</th>
                    <th className={`${TH} w-[22%]`}>Room</th>
                    <th className={TH}>Joined</th>
                    <th className={TH}>Left</th>
                    <th className={`${TH} w-[12%] text-right`}>Duration</th>
                    <th className={`${TH} w-[10%]`}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {d.sessions.rows.map((s) => (
                    <tr key={s.id} className={BODY_ROW}>
                      <td className={`${TD} text-xs`}>
                        {s.game ? <Link href={`/games/${encodeURIComponent(s.game)}`} className="block truncate text-text hover:text-admin no-underline" title={s.game}>{s.game}</Link> : "n/a"}
                      </td>
                      <td className={TD}><RoomLink roomId={s.roomId} className="text-xs" /></td>
                      <td className={`${TD} text-xs text-text-muted`}>{shortWhen(s.joinedAt)}</td>
                      <td className={`${TD} text-xs text-text-muted`}>{s.open ? <span className="text-success">still in</span> : shortWhen(s.leftAt)}</td>
                      <td className={`${TD} text-xs text-right tabular-nums`}>{duration(s.durationS)}</td>
                      <td className={`${TD} text-xs text-text-muted`}><Clip text={`${s.role || "n/a"}${s.seated ? "" : " (not seated)"}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
              <Pager page={d.sessions.page} pageCount={d.sessions.pageCount} total={d.sessions.total} noun="sessions" hrefFor={(p) => href({ sessions: p })} />
            </>
          )}
        </Section>

        <Section title="Users row" note={`${d.fields.length} fields; anything named like a token, secret or hash is redacted`}>
          <FieldList fields={d.fields} />
        </Section>
      </>
    );
  });
}

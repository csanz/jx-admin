"use client";

/**
 * A GAME'S PEOPLE on the game page (owner 2026-11-18: "make Simpl3Un1c0rn an admin for one-shot game in prod ... in
 * admin"): the owner, then everyone on the game with their role, and the controls that change it:
 *   a role select + Set per person (admin: everything the owner can do on this game; contributor: edits its settings)
 *   Remove per person
 *   an Add form: a Jazaix username and a role
 * Every change is POST /api/games/<slug>/members, confirmed first, then the server page refreshes. The server writes
 * the entry the portal reads on its next request and appends an admin_actions row.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonCell } from "./PersonCell";
import { BODY_ROW, HEAD_ROW, TableFrame, TD, TH } from "./ListBits";
import { errorText, shortWhen } from "@/lib/format";

// The shapes the server page passes (the repo module's GameMembers), declared here: a client module never imports a
// server module (test/routes-import-gate.test.mjs pins it).
export type GameMemberRole = "admin" | "contributor";
export type MemberPerson = { id: string; username: string; email: string; name: string; image: string | null };
export type GameMemberView = { userId: string; role: GameMemberRole; credit: string; listed: boolean; addedAt: string | null; username: string; email: string; name: string; image: string | null };
export type GameMembers = { owner: MemberPerson | null; items: GameMemberView[] };

export const GAME_ROLE_OPTIONS: { value: GameMemberRole; label: string; hint: string }[] = [
  { value: "admin", label: "admin", hint: "everything the owner can do on this game" },
  { value: "contributor", label: "contributor", hint: "edits the game's settings" },
];

const btn = "px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover disabled:opacity-50 cursor-pointer";
const ghost = "px-3 py-1.5 text-sm rounded-md border border-border text-text-muted hover:text-text hover:bg-bg/60 disabled:opacity-50 cursor-pointer";
const select = "px-2 py-1 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";
const input = "px-2 py-1 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";

type Msg = { error?: string; notice?: string };

export function GameMembersControl({ slug, gameName, members, portalUrl }: { slug: string; gameName: string; members: GameMembers; portalUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>({});
  const [name, setName] = useState("");
  const [addRole, setAddRole] = useState<GameMemberRole>("admin");

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg({});
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(slug)}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, data));
      setMsg({ notice: done });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ error: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const who = (m: GameMemberView) => m.username || m.email || m.name || m.userId;

  return (
    <div className="space-y-4" data-testid="game-members">
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">Owner</p>
          <div className="mt-1">
            <PersonCell person={members.owner ? { ...members.owner, image: members.owner.image ?? "" } : null} portalUrl={portalUrl} fallback="no owner set" />
          </div>
        </div>
        <p className="text-xs text-text-muted max-w-xl">
          The owner is the game&apos;s creator; it is not changed here. A game <b className="text-text">admin</b> can do everything the owner can on this one game: settings, people, keys, deploy tokens, the game&apos;s address and join requests. A <b className="text-text">contributor</b> edits the settings only.
        </p>
      </div>

      {members.items.length === 0 ? (
        <p className="text-sm text-text-subtle">Nobody besides the owner.</p>
      ) : (
        <TableFrame>
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Who</th>
              <th className={TH}>Role</th>
              <th className={TH}>Credit</th>
              <th className={TH}>Added</th>
              <th className={`${TH} text-right`}>Change</th>
            </tr>
          </thead>
          <tbody>
            {members.items.map((m) => (
              <MemberRow key={`${m.userId}:${m.role}`} m={m} portalUrl={portalUrl} busy={busy} gameName={gameName}
                onRole={(role) => post({ userId: m.userId, role }, `${who(m)} is now ${role === "admin" ? "an admin" : "a contributor"} of ${gameName}.`)}
                onRemove={() => post({ userId: m.userId, action: "remove" }, `${who(m)} was removed from ${gameName}.`)} />
            ))}
          </tbody>
        </TableFrame>
      )}

      <form
        className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-end gap-3"
        data-testid="game-members-add"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim().replace(/^@/, "");
          if (!n || busy) return;
          if (!window.confirm(`Add ${n} to ${gameName} as ${addRole}?`)) return;
          if (await post({ username: n, role: addRole }, `${n} is now ${addRole === "admin" ? "an admin" : "a contributor"} of ${gameName}.`)) setName("");
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">Jazaix username
          <input className={`${input} w-56`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Simpl3Un1c0rn" autoComplete="off" spellCheck={false} data-testid="game-members-add-name" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Role
          <select className={select} value={addRole} onChange={(e) => setAddRole(e.target.value === "contributor" ? "contributor" : "admin")} data-testid="game-members-add-role">
            {GAME_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button type="submit" className={btn} disabled={busy || !name.trim()} data-testid="game-members-add-go">{busy ? "..." : "Add"}</button>
        <span className="text-xs text-text-subtle">{GAME_ROLE_OPTIONS.find((o) => o.value === addRole)?.hint}</span>
      </form>

      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.notice && <p role="status" className="text-sm text-text-muted">{msg.notice}</p>}
      <p className="text-xs text-text-subtle">
        Every change is written to the audit trail. <Link href="/audit?action=game-member" className="text-admin hover:text-admin-hover">Game people changes</Link>
      </p>
    </div>
  );
}

function MemberRow({ m, portalUrl, busy, gameName, onRole, onRemove }: {
  m: GameMemberView; portalUrl: string | null; busy: boolean; gameName: string; onRole: (role: GameMemberRole) => void; onRemove: () => void;
}) {
  const [picked, setPicked] = useState<GameMemberRole>(m.role);
  const label = m.username || m.email || m.name || m.userId;
  return (
    <tr className={BODY_ROW} data-testid={`game-member-${m.userId}`} data-role={m.role}>
      <td className={TD}>
        <PersonCell person={{ id: m.userId, username: m.username, email: m.email, name: m.name, image: m.image ?? "" }} portalUrl={portalUrl} />
      </td>
      <td className={`${TD} ${m.role === "admin" ? "text-notice" : "text-text-muted"}`}>{m.role}</td>
      <td className={`${TD} text-text-muted`}>{m.credit}{m.listed ? "" : " (not on the game page)"}</td>
      <td className={`${TD} text-text-muted`}>{shortWhen(m.addedAt)}</td>
      <td className={`${TD} text-right`}>
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <select aria-label={`Role of ${label} on ${gameName}`} className={select} value={picked} disabled={busy} onChange={(e) => setPicked(e.target.value === "contributor" ? "contributor" : "admin")}>
            {GAME_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className={btn} disabled={busy || picked === m.role}
            onClick={() => { if (window.confirm(`Make ${label} ${picked === "admin" ? "an admin" : "a contributor"} of ${gameName}? (now ${m.role})`)) onRole(picked); }}>
            Set
          </button>
          <button type="button" className={ghost} disabled={busy}
            onClick={() => { if (window.confirm(`Remove ${label} from ${gameName}?`)) onRemove(); }}>
            Remove
          </button>
        </span>
      </td>
    </tr>
  );
}

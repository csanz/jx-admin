"use client";

/**
 * The set-role control (users list and user page): a select and Set, a confirmation, then POST /api/users
 * { userId, role }. The signed-in admin cannot demote themselves (the server refuses it too); a bot keeps role bot.
 * After a change it calls `onChanged` (the list reloads) or refreshes the server page.
 */
import { useRouter } from "next/navigation";
import { roleLabel } from "@/lib/roles";
import { useState } from "react";
import { errorText } from "@/lib/format";

/** The roles an admin can set; "user" is the UI's word for the portal's "player". */
export const ROLE_OPTIONS = [
  { value: "admin", label: "admin" },
  { value: "developer", label: "developer" },
  { value: "player", label: "user" },
] as const;


export type RoleTarget = { id: string; email: string; username: string; name: string; role: string };

export function RoleControl({ user, adminEmail, adminId, onChanged, onMessage }: {
  user: RoleTarget;
  adminEmail: string;
  adminId: string;
  onChanged?: () => Promise<void> | void;
  onMessage?: (m: { error?: string; notice?: string }) => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<{ error?: string; notice?: string }>({});
  const say = (m: { error?: string; notice?: string }) => (onMessage ? onMessage(m) : setOwn(m));
  const self = user.id === adminId || (user.email !== "" && user.email.toLowerCase() === adminEmail.toLowerCase());

  if (user.role === "bot") return <span className="text-xs text-text-subtle">bot</span>;

  const submit = async () => {
    if (!picked || picked === user.role) return;
    const who = user.email || user.username || user.name || user.id;
    if (self && picked !== "admin") { say({ error: "You cannot remove your own admin role. Ask another admin." }); return; }
    if (!window.confirm(`Set the role of ${who} to ${roleLabel(picked)}? (now ${roleLabel(user.role)})`)) return;
    setBusy(true);
    say({});
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, role: picked }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      say({ notice: `${who} is now ${roleLabel(picked)}.` });
      if (onChanged) await onChanged();
      else router.refresh();
    } catch (e) {
      say({ error: `${who}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label={`Role for ${user.email || user.id}`}
        value={picked}
        disabled={busy}
        onChange={(e) => setPicked(e.target.value)}
        className="px-2 py-1 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin"
      >
        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value} disabled={self && o.value !== "admin"}>{o.label}</option>)}
      </select>
      <button
        type="button"
        disabled={busy || picked === user.role}
        onClick={() => void submit()}
        className="px-3 py-1.5 text-sm font-semibold bg-admin text-admin-ink rounded-md hover:bg-admin-hover disabled:opacity-50 cursor-pointer"
      >
        {busy ? "..." : "Set"}
      </button>
      {!onMessage && own.error && <span role="alert" className="basis-full text-right text-xs text-danger">{own.error}</span>}
      {!onMessage && own.notice && <span role="status" className="basis-full text-right text-xs text-text-muted">{own.notice}</span>}
    </span>
  );
}

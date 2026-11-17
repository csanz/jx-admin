"use client";

/**
 * USERS: search by email or username (GET /api/users?q=), each row with role, waitlist state and created date, and
 * one action: set the role (POST /api/users { userId, role }) after a confirmation. The signed-in admin's own row
 * cannot be demoted (the server refuses it too). Same look as the waitlist screen.
 */
import { useCallback, useEffect, useState } from "react";
import { errorText, when } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";

type Row = {
  id: string; email: string; name: string; username: string; image: string; role: string; access: "approved" | "waitlist";
  createdAt: string | null; lastLoginAt: string | null;
};
type Data = { users: Row[]; total: number };
const PAGE = 50;

/** The roles an admin can set; "user" is the UI's word for the portal's "player". */
const ROLE_OPTIONS = [
  { value: "admin", label: "admin" },
  { value: "developer", label: "developer" },
  { value: "player", label: "user" },
] as const;

const roleLabel = (role: string) => (role === "player" ? "user" : role);

export function UsersConsole({ adminEmail, adminId }: { adminEmail: string; adminId: string }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);

  // the search waits for a pause in typing
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      setData(body as Data);
      setPicked({});
    } catch (e) {
      setError(`Could not load the users (${(e as Error).message}).`);
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  // the "more" control: the next page of 50, appended
  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    setError("");
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(query)}&skip=${data.users.length}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      const next = body as Data;
      setData((d) => {
        if (!d) return next;
        const seen = new Set(d.users.map((u) => u.id));
        return { users: [...d.users, ...next.users.filter((u) => !seen.has(u.id))], total: next.total };
      });
    } catch (e) {
      setError(`Could not load more users (${(e as Error).message}).`);
    } finally {
      setMore(false);
    }
  };

  const setRole = async (row: Row) => {
    const role = picked[row.id];
    if (!role || role === row.role) return;
    const who = row.email || row.username || row.name || row.id;
    const self = row.id === adminId || (row.email && row.email.toLowerCase() === adminEmail.toLowerCase());
    if (self && role !== "admin") { setError("You cannot remove your own admin role. Ask another admin."); return; }
    if (!window.confirm(`Set the role of ${who} to ${roleLabel(role)}? (now ${roleLabel(row.role)})`)) return;
    setBusy(row.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: row.id, role }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      setNotice(`${who} is now ${roleLabel(role)}.`);
      await load();
    } catch (e) {
      setError(`${who}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader path="/users" title="Users" />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or username"
          maxLength={80}
          autoFocus
          className="w-full sm:w-96 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-accent"
        />
        {data && <p className="text-xs text-text-subtle">{data.total.toLocaleString()} {data.total === 1 ? "account" : "accounts"}{data.users.length < data.total ? `, showing ${data.users.length}` : ""}</p>}
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 text-sm text-text-muted">{notice}</p>}

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border">
              <th className="px-4 py-2.5 font-normal">Person</th>
              <th className="px-4 py-2.5 font-normal">Role</th>
              <th className="px-4 py-2.5 font-normal">Waitlist</th>
              <th className="px-4 py-2.5 font-normal">Created</th>
              <th className="px-4 py-2.5 font-normal text-right">Set role</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-subtle">Loading...</td></tr>
            )}
            {data?.users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-subtle">{query ? "No one matches that search." : "No accounts yet."}</td></tr>
            )}
            {data?.users.map((u) => {
              const self = u.id === adminId || (u.email !== "" && u.email.toLowerCase() === adminEmail.toLowerCase());
              const chosen = picked[u.id] ?? u.role;
              return (
                <tr key={u.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {u.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.image} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
                        : <div className="w-8 h-8 rounded-full shrink-0 bg-bg border border-border" />}
                      <div className="min-w-0">
                        <p className="text-text truncate">{u.name || u.username || "n/a"}{self && <span className="ml-2 text-[11px] text-text-subtle uppercase">you</span>}</p>
                        <p className="text-xs text-text-subtle truncate">{u.email || "no email"}{u.username && ` · @${u.username}`}</p>
                        <p className="text-[11px] text-text-subtle font-mono truncate">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={u.role === "admin" ? "text-accent" : u.role === "player" ? "text-text-muted" : "text-text"}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                    {u.role === "admin" || u.role === "developer" || u.role === "bot" ? <span className="text-text-subtle">always has access</span> : u.access === "waitlist" ? <span className="text-notice">waiting</span> : "approved"}
                  </td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">{when(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {u.role === "bot" ? (
                      <span className="text-xs text-text-subtle">bot</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <select
                          aria-label={`Role for ${u.email || u.id}`}
                          value={chosen}
                          disabled={busy === u.id}
                          onChange={(e) => setPicked((p) => ({ ...p, [u.id]: e.target.value }))}
                          className="px-2 py-1 text-sm bg-surface border border-border rounded-md text-text focus:outline-none focus:border-accent"
                        >
                          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value} disabled={self && o.value !== "admin"}>{o.label}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={busy === u.id || chosen === u.role}
                          onClick={() => void setRole(u)}
                          className="px-3 py-1.5 text-sm font-semibold bg-accent text-accent-ink rounded-md hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                        >
                          {busy === u.id ? "..." : "Set"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.users.length < data.total && data.users.length >= PAGE && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => void loadMore()} disabled={more} className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:text-text disabled:opacity-50 cursor-pointer">
            {more ? "Loading..." : `Show ${Math.min(PAGE, data.total - data.users.length)} more`}
          </button>
          <p className="text-xs text-text-subtle">{data.users.length.toLocaleString()} of {data.total.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

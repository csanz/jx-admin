"use client";

/**
 * USERS: search by email or username (GET /api/users?q=), each row with role, waitlist state and created date, and
 * one action: set the role (POST /api/users { userId, role }) after a confirmation. The signed-in admin's own row
 * cannot be demoted (the server refuses it too). Same look as the waitlist screen.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { RoleControl } from "@/components/RoleControl";
import { roleLabel } from "@/lib/roles";
import { avatarSrc } from "@/lib/avatar";
import { errorText, shortWhen } from "@/lib/format";

type Row = {
  id: string; email: string; name: string; username: string; image: string; imageSmall: string; role: string; access: "approved" | "waitlist";
  createdAt: string | null; lastLoginAt: string | null;
};
type Data = { users: Row[]; total: number };
const PAGE = 50;

export function UsersConsole({ adminEmail, adminId, portalUrl }: { adminEmail: string; adminId: string; portalUrl: string | null }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
          className="w-full sm:w-96 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-admin"
        />
        {data && <p className="text-xs text-text-subtle">{data.total.toLocaleString()} {data.total === 1 ? "account" : "accounts"}{data.users.length < data.total ? `, showing ${data.users.length}` : ""}</p>}
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 text-sm text-text-muted">{notice}</p>}

      <div className="bg-surface border border-border rounded-xl">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border">
              <th className="px-3 py-2.5 font-normal w-[42%]">Person</th>
              <th className="px-3 py-2.5 font-normal">Role</th>
              <th className="px-3 py-2.5 font-normal">Waitlist</th>
              <th className="px-3 py-2.5 font-normal">Created</th>
              <th className="px-3 py-2.5 font-normal text-right w-[24%]">Set role</th>
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
              const label = u.name || u.username || u.email || "n/a";
              return (
                <tr key={u.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-3 py-3">
                    <Link href={`/users/${u.id}`} className="flex items-center gap-3 min-w-0 no-underline group">
                      <Avatar src={avatarSrc(u.imageSmall || u.image, portalUrl)} label={label} />
                      <span className="min-w-0">
                        <span className="block text-text truncate group-hover:text-admin">{u.name || u.username || "n/a"}{self && <span className="ml-2 text-[11px] text-text-subtle uppercase">you</span>}</span>
                        <span className="block text-xs text-text-subtle truncate" title={u.email}>{u.email || "no email"}{u.username && ` · @${u.username}`}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={u.role === "admin" ? "text-admin" : u.role === "player" ? "text-text-muted" : "text-text"}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-3 py-3 text-text-muted text-xs">
                    {u.role === "admin" || u.role === "developer" || u.role === "bot" ? <span className="text-text-subtle">always has access</span> : u.access === "waitlist" ? <span className="text-notice">waiting</span> : <span className="text-success">approved</span>}
                  </td>
                  <td className="px-3 py-3 text-text-muted text-xs">{shortWhen(u.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <RoleControl
                      key={`${u.id}-${u.role}`}
                      user={u}
                      adminEmail={adminEmail}
                      adminId={adminId}
                      onChanged={load}
                      onMessage={(m) => { setError(m.error ?? ""); setNotice(m.notice ?? ""); }}
                    />
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

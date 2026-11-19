"use client";

/**
 * USERS: search by email or username (GET /api/users?q=&sort=&dir=&active=...), each row with role, waitlist state,
 * created date and last active ("2 days ago": the later of the last sign-in and the last play, owner 2026-11-19),
 * sortable by name, created or last active from the column headers, filtered by an activity window ("who played
 * this week": the last 24 hours / 5 / 7 / 30 days or a range of days, counting plays, sign-ins or either), a created
 * window, the role and the waitlist state (owner 2026-11-19), and one action: set the role (POST /api/users { userId,
 * role }) after a confirmation. The signed-in admin's own row cannot be demoted (the server refuses it too).
 *
 * The whole list state (search, order, filters) lives in the URL, so "who played this week" is a link that can be
 * bookmarked and shared; the component reads it with useSearchParams and writes it with router.replace.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { RoleControl } from "@/components/RoleControl";
import { roleLabel } from "@/lib/roles";
import { avatarSrc } from "@/lib/avatar";
import { ago, errorText, shortWhen } from "@/lib/format";
import { defaultDir, parseUserOrder, type UserOrder, type UserSort } from "@/lib/user-order";
import {
  ACTIVE_KINDS, ACTIVE_KIND_LABEL, FILTER_ROLES, WINDOW_PRESETS, WINDOW_PRESET_LABEL, isEmptyUserFilter, parseUserFilter, userFilterParams,
  userFilterSummary, type ActiveKind, type UserFilter, type Window,
} from "@/lib/user-filter";

type Row = {
  id: string; email: string; name: string; username: string; image: string; imageSmall: string; role: string; access: "approved" | "waitlist";
  createdAt: string | null; lastLoginAt: string | null; lastActive: { at: string; kind: "played" | "signed-in" } | null;
};
type Data = { users: Row[]; total: number };
const PAGE = 50;
const TH = "px-3 py-2.5 font-normal";
const SELECT = "px-2 py-1 text-xs bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin cursor-pointer";
const DATE = "px-2 py-0.5 text-xs bg-surface border border-border rounded-md text-text focus:outline-none focus:border-admin";

/** A column header that sorts the list: click to pick the column, click again to turn it around. */
function SortHeader({ col, label, order, onSort, className = "" }: { col: UserSort; label: string; order: UserOrder; onSort: (col: UserSort) => void; className?: string }) {
  const active = order.sort === col;
  return (
    <th className={`${TH} ${className}`} aria-sort={active ? (order.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(col)}
        data-testid={`sort-${col}`}
        title={active ? `Sorted by ${label.toLowerCase()}, ${order.dir === "asc" ? "ascending" : "descending"}; click to reverse` : `Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-[0.12em] cursor-pointer ${active ? "text-admin" : "hover:text-text"}`}
      >
        {label}
        <span aria-hidden className="w-2 text-[9px]">{active ? (order.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

/** A window picker: the rolling presets, or "custom dates" with two date fields. `name` is the URL param (active | created). */
function WindowPicker({ name, label, value, onChange }: { name: "active" | "created"; label: string; value: Window | null; onChange: (w: Window | null) => void }) {
  const isRange = value?.preset === "range";
  const [customOpen, setCustomOpen] = useState(isRange);
  const [draft, setDraft] = useState<{ from: string; to: string }>(isRange ? { from: value.from, to: value.to } : { from: "", to: "" });
  // cleared from outside (the Clear link): the date fields close
  useEffect(() => { if (value === null) { setCustomOpen(false); setDraft({ from: "", to: "" }); } }, [value]);
  const pick = (v: string) => {
    if (v === "range") {
      // the window in force (if any) stays until both days are chosen
      setCustomOpen(true);
      setDraft({ from: "", to: "" });
      return;
    }
    setCustomOpen(false);
    setDraft({ from: "", to: "" });
    onChange(v === "" ? null : ({ preset: v } as Window));
  };
  const day = (k: "from" | "to", v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    if (next.from && next.to) onChange({ preset: "range", from: next.from, to: next.to });
  };
  return (
    <label className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-subtle">
      {label}
      <select data-testid={`filter-${name}`} className={SELECT} value={customOpen ? "range" : value?.preset ?? ""} onChange={(e) => pick(e.target.value)}>
        <option value="">any time</option>
        {WINDOW_PRESETS.map((p) => <option key={p} value={p}>{WINDOW_PRESET_LABEL[p]}</option>)}
        <option value="range">custom dates</option>
      </select>
      {customOpen && (
        <span className="inline-flex items-center gap-1">
          <input type="date" aria-label={`${label} from`} data-testid={`filter-${name}-from`} className={DATE} value={draft.from} max={draft.to || undefined} onChange={(e) => day("from", e.target.value)} />
          <span>to</span>
          <input type="date" aria-label={`${label} to`} data-testid={`filter-${name}-to`} className={DATE} value={draft.to} min={draft.from || undefined} onChange={(e) => day("to", e.target.value)} />
        </span>
      )}
    </label>
  );
}

export function UsersConsole({ adminEmail, adminId, portalUrl }: { adminEmail: string; adminId: string; portalUrl: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // the list state, read from the URL
  const query = (sp.get("q") ?? "").trim().slice(0, 80);
  const order = useMemo(() => parseUserOrder(sp.get("sort"), sp.get("dir")), [sp]);
  const filter = useMemo(() => parseUserFilter(sp), [sp]);
  const listQuery = useMemo(() => {
    const p = new URLSearchParams({ q: query, sort: order.sort, dir: order.dir, ...userFilterParams(filter) });
    return p.toString();
  }, [query, order, filter]);

  // writing the URL: only the parts that differ from the defaults are kept, so a plain /users stays plain
  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [sp, router, pathname]);

  const [q, setQ] = useState(query);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [more, setMore] = useState(false);

  // the search waits for a pause in typing, then lands in the URL
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim() !== query) setParams({ q: q.trim() }); }, 250);
    return () => clearTimeout(t);
  }, [q, query, setParams]);

  // a header click: the same column turns around, a new column starts in its natural direction
  const sortBy = (col: UserSort) => {
    const dir = order.sort === col ? (order.dir === "asc" ? "desc" : "asc") : defaultDir(col);
    setParams({ sort: col, dir });
  };

  // a filter change: the filter's params replace the old ones in the URL
  const setFilter = (next: UserFilter) => {
    const cleared: Record<string, string | null> = { active: null, kind: null, af: null, at: null, created: null, cf: null, ct: null, role: null, access: null };
    setParams({ ...cleared, ...userFilterParams(next) });
  };

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/users?${listQuery}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      setData(body as Data);
    } catch (e) {
      setError(`Could not load the users (${(e as Error).message}).`);
    }
  }, [listQuery]);
  useEffect(() => { void load(); }, [load]);

  // the "more" control: the next page of 50, appended
  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    setError("");
    try {
      const res = await fetch(`/api/users?${listQuery}&skip=${data.users.length}`, { cache: "no-store" });
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

  const summary = userFilterSummary(filter);
  const filtered = !isEmptyUserFilter(filter);

  return (
    <div>
      <PageHeader path="/users" title="Users" />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or username"
          maxLength={80}
          aria-label="Search users"
          className="w-full sm:w-96 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-admin"
        />
        {data && (
          <p className="text-xs text-text-subtle" data-testid="users-count">
            {data.total.toLocaleString()} {data.total === 1 ? "account" : "accounts"}{data.users.length < data.total ? `, showing ${data.users.length}` : ""}{summary ? `: ${summary}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4" data-testid="users-filters">
        <WindowPicker name="active" label="Active" value={filter.active} onChange={(w) => setFilter({ ...filter, active: w })} />
        {filter.active && (
          <label className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
            counting
            <select data-testid="filter-kind" className={SELECT} value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as ActiveKind })}>
              {ACTIVE_KINDS.map((k) => <option key={k} value={k}>{ACTIVE_KIND_LABEL[k]}</option>)}
            </select>
          </label>
        )}
        <WindowPicker name="created" label="Created" value={filter.created} onChange={(w) => setFilter({ ...filter, created: w })} />
        <label className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
          Role
          <select data-testid="filter-role" className={SELECT} value={filter.role ?? ""} onChange={(e) => setFilter({ ...filter, role: (e.target.value || null) as UserFilter["role"] })}>
            <option value="">any</option>
            {FILTER_ROLES.map((r) => <option key={r} value={r}>{r === "player" ? "user" : r}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
          Waitlist
          <select data-testid="filter-access" className={SELECT} value={filter.access ?? ""} onChange={(e) => setFilter({ ...filter, access: (e.target.value || null) as UserFilter["access"] })}>
            <option value="">any</option>
            <option value="approved">approved</option>
            <option value="waitlist">waiting</option>
          </select>
        </label>
        {filtered && (
          <button type="button" data-testid="filters-clear" onClick={() => setFilter({ active: null, kind: "either", created: null, role: null, access: null })} className="text-xs text-admin hover:underline cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 text-sm text-text-muted">{notice}</p>}

      <div className="bg-surface border border-border rounded-xl">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border">
              <SortHeader col="name" label="Person" order={order} onSort={sortBy} className="w-[32%]" />
              <th className={`${TH} w-[9%]`}>Role</th>
              <th className={`${TH} w-[13%]`}>Waitlist</th>
              <SortHeader col="created" label="Created" order={order} onSort={sortBy} className="w-[12%]" />
              <SortHeader col="active" label="Last active" order={order} onSort={sortBy} className="w-[13%]" />
              <th className={`${TH} text-right w-[21%]`}>Set role</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-subtle">Loading...</td></tr>
            )}
            {data?.users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-subtle">{query ? "No one matches that search." : filtered ? "No one matches these filters." : "No accounts yet."}</td></tr>
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
                  <td className="px-3 py-3 text-xs" data-testid="last-active" title={u.lastActive ? `${u.lastActive.kind === "played" ? "played" : "signed in"} ${shortWhen(u.lastActive.at)} UTC` : "no sign-in or play on record"}>
                    <span className="block text-text-muted">{ago(u.lastActive?.at)}</span>
                    {u.lastActive && <span className="block text-text-subtle">{u.lastActive.kind === "played" ? "played" : "signed in"}</span>}
                  </td>
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

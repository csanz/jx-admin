"use client";

/**
 * THE PORTAL WAITLIST, ported from the portal's /admin (src/app/admin/AdminWaitlist.tsx) with the same look. The
 * data and the actions go to this app's /api/waitlist, which reads and writes the platform database directly
 * (src/lib/repo/waitlist.ts) as the signed-in admin. The per-row email status comes from the users rows
 * (waitlistEmails) and the approval notice from the console's own send.
 */
import { useCallback, useEffect, useState } from "react";
import { errorText, when } from "@/lib/format";

type Status = "waitlist" | "approved";
type Row = {
  id: string; email: string; name: string; username: string; image: string; role: string; access: Status;
  createdAt: string | null; lastLoginAt: string | null; waitlistedAt: string | null; approvedAt: string | null; approvedBy: string | null;
  emails?: { joined: string | null; approved: string | null };
  signupAs?: "gamer" | "developer" | "both" | null;
};

const EMAIL_LABEL: Record<string, string> = { sent: "email sent", failed: "email failed", "not-configured": "email not set up" };
function EmailNote({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`block text-xs ${status === "sent" ? "text-text-subtle" : "text-danger"}`}>{EMAIL_LABEL[status] ?? status}</span>;
}
type Data = { counts: { waiting: number; approved: number }; users: Row[] };

export function AdminWaitlist({ adminEmail }: { adminEmail: string }) {
  const [status, setStatus] = useState<Status>("waitlist");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // the search waits for a pause in typing
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/waitlist?status=${status}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      setData(body as Data);
    } catch (e) {
      setError(`Could not load the list (${(e as Error).message}).`);
    }
  }, [status, query]);
  useEffect(() => { void load(); }, [load]);

  const act = async (row: Row, action: "approve" | "waitlist") => {
    const who = row.email || row.name;
    const ask = action === "approve" ? `Approve ${who}? The "You're in" email is sent when email is configured.` : `Move ${who} back to the waitlist?`;
    if (!window.confirm(ask)) return;
    setBusy(row.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: row.id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      if (action === "approve") {
        setNotice(body.email === "sent" ? `Approved ${who}. "You're in" email sent.`
          : body.email === "not-configured" ? `Approved ${who}. No email was sent: RESEND_API_KEY is not set on the console.`
          : `Approved ${who}, but the email did not go out (${body.email ?? "unknown"}).`);
      } else setNotice(`Moved ${who} back to the waitlist.`);
      await load();
    } catch (e) {
      setError(`${who}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const tab = (s: Status, label: string, n: number | undefined) => (
    <button
      type="button"
      onClick={() => setStatus(s)}
      aria-pressed={status === s}
      className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-pointer ${status === s ? "bg-accent text-accent-ink border-accent" : "bg-surface text-text-muted border-border hover:text-text"}`}
    >
      {label}{n !== undefined && <span className="ml-1.5 tabular-nums opacity-80">{n.toLocaleString()}</span>}
    </button>
  );

  return (
    <div>
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <div>
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
          <h1 className="text-2xl text-text font-semibold font-sans tracking-tight">Portal waitlist</h1>
        </div>
        <p className="text-xs text-text-subtle">{adminEmail}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tab("waitlist", "Waiting", data?.counts.waiting)}
        {tab("approved", "Approved", data?.counts.approved)}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, name or username"
          maxLength={80}
          className="ml-auto w-full sm:w-72 px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-accent"
        />
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 text-sm text-text-muted">{notice}</p>}

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-subtle border-b border-border">
              <th className="px-4 py-2.5 font-normal">Person</th>
              <th className="px-4 py-2.5 font-normal">{status === "waitlist" ? "Waiting since" : "Approved"}</th>
              <th className="px-4 py-2.5 font-normal">Last sign-in</th>
              <th className="px-4 py-2.5 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-text-subtle">Loading...</td></tr>
            )}
            {data?.users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-text-subtle">
                {query ? "No one matches that search." : status === "waitlist" ? "No one is waiting." : "No approved accounts yet."}
              </td></tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {u.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={u.image} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
                      : <div className="w-8 h-8 rounded-full shrink-0 bg-bg border border-border" />}
                    <div className="min-w-0">
                      <p className="text-text truncate">{u.name || u.username || "n/a"}{u.role !== "player" && <span className="ml-2 text-[11px] text-accent uppercase">{u.role}</span>}{u.signupAs && <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${u.signupAs !== "gamer" ? "bg-accent/15 text-accent" : "border border-border text-text-muted"}`}>{u.signupAs === "developer" ? "Developer" : u.signupAs === "both" ? "Both" : "Gamer"}</span>}</p>
                      <p className="text-xs text-text-subtle truncate">{u.email}{u.username && ` · @${u.username}`}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                  {status === "waitlist"
                    ? <>{when(u.waitlistedAt ?? u.createdAt)}<EmailNote status={u.emails?.joined} /></>
                    : u.approvedAt
                      ? <>{when(u.approvedAt)}{u.approvedBy && <span className="block text-xs text-text-subtle">by {u.approvedBy}</span>}<EmailNote status={u.emails?.approved} /></>
                      : <span className="text-text-subtle">before the waitlist</span>}
                </td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{when(u.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right">
                  {status === "waitlist" ? (
                    <button type="button" disabled={busy === u.id} onClick={() => act(u, "approve")}
                      className="px-3 py-1.5 text-sm font-semibold bg-accent text-accent-ink rounded-md hover:bg-accent-hover disabled:opacity-50 cursor-pointer">
                      {busy === u.id ? "..." : "Approve"}
                    </button>
                  ) : u.role === "player" ? (
                    <button type="button" disabled={busy === u.id} onClick={() => act(u, "waitlist")}
                      className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:text-text disabled:opacity-50 cursor-pointer">
                      {busy === u.id ? "..." : "Move back to waitlist"}
                    </button>
                  ) : <span className="text-xs text-text-subtle">always has access</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.users.length >= 100 && <p className="mt-2 text-xs text-text-subtle">Showing the first 100. Search to narrow it down.</p>}
    </div>
  );
}

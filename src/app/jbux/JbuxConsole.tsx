"use client";

/**
 * JBUX, admin side: the ledger report (GET /api/jbox/report with the four filters, read from the platform database),
 * an admin refund (POST /api/jbox/refund { receiptId, reason }) and a wallet hold (POST /api/jbox/hold { userId,
 * hold, reason }). The two money actions are carried out by the portal (one implementation of the money rules) and
 * need the portal link: without it the forms are shown disabled with "money actions need the portal link".
 * Every write asks for confirmation first; errors show inline next to the form that caused them.
 * Response shapes follow the portal's JboxReport (src/lib/wallet-admin.ts) and the two write routes.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { errorText, num, when } from "@/lib/format";

const FUNDINGS = ["real", "test", "promo"] as const;
const KINDS = ["grant", "purchase", "spend", "refund", "reversal", "adjust"] as const;
type Pot = (typeof FUNDINGS)[number];

type Report = {
  filter: { funding: string | null; kind: string | null; from: string | null; to: string | null };
  lines: Array<{ kind: string; source: string | null; rows: number; real: number; test: number; promo: number }>;
  byFunding: Record<Pot, { credited: number; debited: number }>;
  wallets: { real: number; test: number; promo: number; balance: number; onHold: number; count: number };
  testBuys: Array<{ userId: string; email: string | null; amount: number; at: string; env: string | null; packId: string | null }>;
};

type Funds = { real: number; test: number; promo: number };
type RefundResult = { refunded: number; split: Partial<Funds>; revoked: boolean; userId: string; balance: number; funds: Funds };
type HoldResult = { hold: string | null; balance: number; funds: Funds };

const input = "w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-subtle focus:outline-none focus:border-accent";
const label = "block text-[11px] uppercase tracking-[0.12em] text-text-subtle mb-1";
const th = "px-3 py-2 font-normal text-[11px] uppercase tracking-[0.12em] text-text-subtle";
const td = "px-3 py-2 whitespace-nowrap";

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

const NOT_LINKED = "Money actions need the portal link (the portal URL and service token in the console's environment).";

export function JbuxConsole({ adminEmail, portalLinked }: { adminEmail: string; portalLinked: boolean }) {
  const [funding, setFunding] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams();
    if (funding) qs.set("funding", funding);
    if (kind) qs.set("kind", kind);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try {
      const res = await fetch(`/api/jbox/report${qs.size ? `?${qs}` : ""}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(res.status, body));
      setReport(body as Report);
    } catch (e) {
      setError(`Could not load the report (${(e as Error).message}).`);
    } finally {
      setLoading(false);
    }
  }, [funding, kind, from, to]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <div>
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
          <h1 className="text-2xl text-text font-semibold font-sans tracking-tight">JBux</h1>
        </div>
        <p className="text-xs text-text-subtle">{adminEmail}</p>
      </header>

      <section aria-labelledby="report-h">
        <h2 id="report-h" className="text-base text-text font-semibold mb-3">Ledger report</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className={label} htmlFor="f-funding">Funding</label>
            <select id="f-funding" className={input} value={funding} onChange={(e) => setFunding(e.target.value)}>
              <option value="">all pots</option>
              {FUNDINGS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="f-kind">Kind</label>
            <select id="f-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">all kinds</option>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="f-from">From</label>
            <input id="f-from" type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="f-to">To (exclusive)</label>
            <input id="f-to" type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
        {loading && !report && <p className="text-sm text-text-subtle">Loading...</p>}

        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FUNDINGS.map((p) => (
                <div key={p} className="bg-surface border border-border rounded-xl p-3">
                  <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">{p}</p>
                  <p className="mt-1 text-sm text-text tabular-nums">+{num(report.byFunding?.[p]?.credited)} <span className="text-text-subtle">credited</span></p>
                  <p className="text-sm text-text tabular-nums">-{num(report.byFunding?.[p]?.debited)} <span className="text-text-subtle">debited</span></p>
                </div>
              ))}
              <div className="bg-surface border border-border rounded-xl p-3">
                <p className="text-[11px] text-text-subtle uppercase tracking-[0.12em]">Wallets</p>
                <p className="mt-1 text-sm text-text tabular-nums">{num(report.wallets.count)} <span className="text-text-subtle">wallets</span></p>
                <p className="text-sm text-text tabular-nums">{num(report.wallets.onHold)} <span className="text-text-subtle">on hold</span></p>
                <p className="text-xs text-text-subtle tabular-nums mt-1">real {num(report.wallets.real)} · test {num(report.wallets.test)} · promo {num(report.wallets.promo)}</p>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className={th}>Kind</th><th className={th}>Source</th><th className={`${th} text-right`}>Rows</th>
                    <th className={`${th} text-right`}>Real</th><th className={`${th} text-right`}>Test</th><th className={`${th} text-right`}>Promo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-text-subtle">No ledger rows match.</td></tr>}
                  {report.lines.map((l, i) => (
                    <tr key={`${l.kind}-${l.source}-${i}`} className="border-b border-border-subtle last:border-0 text-text-muted">
                      <td className={`${td} text-text`}>{l.kind}</td><td className={td}>{l.source ?? "n/a"}</td><td className={`${td} text-right tabular-nums`}>{num(l.rows)}</td>
                      <td className={`${td} text-right tabular-nums`}>{num(l.real)}</td><td className={`${td} text-right tabular-nums`}>{num(l.test)}</td><td className={`${td} text-right tabular-nums`}>{num(l.promo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="bg-surface border border-border rounded-xl">
              <summary className="px-3 py-2 text-sm text-text-muted cursor-pointer">Test buys ({num(report.testBuys.length)}, newest first)</summary>
              <div className="overflow-x-auto border-t border-border-subtle">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b border-border"><th className={th}>When</th><th className={th}>Who</th><th className={`${th} text-right`}>Amount</th><th className={th}>Pack</th><th className={th}>Env</th></tr></thead>
                  <tbody>
                    {report.testBuys.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-text-subtle">None.</td></tr>}
                    {report.testBuys.map((b, i) => (
                      <tr key={`${b.userId}-${b.at}-${i}`} className="border-b border-border-subtle last:border-0 text-text-muted">
                        <td className={td}>{when(b.at)}</td>
                        <td className={td}><span className="text-text">{b.email ?? "n/a"}</span><span className="block text-[11px] text-text-subtle font-mono">{b.userId}</span></td>
                        <td className={`${td} text-right tabular-nums`}>{num(b.amount)}</td><td className={td}>{b.packId ?? "n/a"}</td><td className={td}>{b.env ?? "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>

      {!portalLinked && <p role="status" className="mt-8 mb-3 text-sm text-notice">{NOT_LINKED}</p>}
      <div className={`grid gap-4 sm:grid-cols-2 ${portalLinked ? "mt-8" : ""}`}>
        <RefundForm onDone={load} enabled={portalLinked} />
        <HoldForm onDone={load} enabled={portalLinked} />
      </div>
    </div>
  );
}

function RefundForm({ onDone, enabled }: { onDone: () => Promise<void>; enabled: boolean }) {
  const [receiptId, setReceiptId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RefundResult | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enabled) { setError(NOT_LINKED); return; }
    setError("");
    setResult(null);
    const id = receiptId.trim();
    if (!id || !reason.trim()) { setError("Receipt id and reason are both required."); return; }
    if (!window.confirm(`Refund receipt ${id}?\n\nThe portal restores the JBux to the pots they came from and revokes what the receipt bought. This cannot be undone here.`)) return;
    setBusy(true);
    try {
      const r = await postJson("/api/jbox/refund", { receiptId: id, reason: reason.trim() });
      if (!r.ok) throw new Error(errorText(r.status, r.body));
      setResult(r.body as RefundResult);
      setReceiptId("");
      setReason("");
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`bg-surface border border-border rounded-xl p-4 space-y-3 ${enabled ? "" : "opacity-60"}`} aria-labelledby="refund-h">
      <h2 id="refund-h" className="text-base text-text font-semibold">Refund a receipt</h2>
      {!enabled && <p className="text-xs text-text-subtle">Disabled: money actions need the portal link.</p>}
      <div>
        <label className={label} htmlFor="r-receipt">Receipt id</label>
        <input id="r-receipt" className={input} value={receiptId} onChange={(e) => setReceiptId(e.target.value)} maxLength={128} placeholder="rcpt_..." autoComplete="off" disabled={!enabled} />
      </div>
      <div>
        <label className={label} htmlFor="r-reason">Reason</label>
        <textarea id="r-reason" className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why this refund (kept in the ledger)" disabled={!enabled} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {result && (
        <p role="status" className="text-sm text-text-muted">
          Refunded {num(result.refunded)} JBux to user {result.userId}{result.revoked ? ", entitlement revoked" : ""}. Balance now {num(result.balance)}.
        </p>
      )}
      <button type="submit" disabled={busy || !enabled} className="px-3 py-1.5 text-sm font-semibold bg-accent text-accent-ink rounded-md hover:bg-accent-hover disabled:opacity-50 cursor-pointer">
        {busy ? "..." : "Refund"}
      </button>
    </form>
  );
}

function HoldForm({ onDone, enabled }: { onDone: () => Promise<void>; enabled: boolean }) {
  const [userId, setUserId] = useState("");
  const [hold, setHold] = useState<"admin" | "clear">("admin");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<HoldResult | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enabled) { setError(NOT_LINKED); return; }
    setError("");
    setResult(null);
    const id = userId.trim();
    if (!/^[a-f0-9]{24}$/.test(id)) { setError("User id must be the 24-hex id from the portal."); return; }
    if (!reason.trim()) { setError("A reason is required."); return; }
    const ask = hold === "admin"
      ? `Put the wallet of user ${id} on hold? Every spend is blocked until the hold is cleared.`
      : `Clear the hold on the wallet of user ${id}? This also clears a Stripe dispute hold.`;
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      const r = await postJson("/api/jbox/hold", { userId: id, hold: hold === "admin" ? "admin" : null, reason: reason.trim() });
      if (!r.ok) throw new Error(errorText(r.status, r.body));
      setResult(r.body as HoldResult);
      setReason("");
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`bg-surface border border-border rounded-xl p-4 space-y-3 ${enabled ? "" : "opacity-60"}`} aria-labelledby="hold-h">
      <h2 id="hold-h" className="text-base text-text font-semibold">Wallet hold</h2>
      {!enabled && <p className="text-xs text-text-subtle">Disabled: money actions need the portal link.</p>}
      <div>
        <label className={label} htmlFor="h-user">User id</label>
        <input id="h-user" className={input} value={userId} onChange={(e) => setUserId(e.target.value)} maxLength={24} placeholder="24-hex portal user id" autoComplete="off" disabled={!enabled} />
      </div>
      <div>
        <label className={label} htmlFor="h-hold">Hold</label>
        <select id="h-hold" className={input} value={hold} onChange={(e) => setHold(e.target.value as "admin" | "clear")} disabled={!enabled}>
          <option value="admin">On: put the wallet on hold (admin)</option>
          <option value="clear">Off: clear the hold</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="h-reason">Reason</label>
        <textarea id="h-reason" className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why (kept with the wallet)" disabled={!enabled} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {result && (
        <p role="status" className="text-sm text-text-muted">
          Hold is now {result.hold ?? "cleared"}. Balance {num(result.balance)} (real {num(result.funds?.real)}, test {num(result.funds?.test)}, promo {num(result.funds?.promo)}).
        </p>
      )}
      <button type="submit" disabled={busy || !enabled} className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-50 cursor-pointer ${hold === "admin" ? "border border-notice text-notice hover:bg-notice/10" : "font-semibold bg-accent text-accent-ink hover:bg-accent-hover"}`}>
        {busy ? "..." : hold === "admin" ? "Put on hold" : "Clear hold"}
      </button>
    </form>
  );
}

import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { readEnv } from "@/lib/env";
import { num } from "@/lib/format";
import { portalAdminFetch } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

type Counts = { waiting: number; approved: number };
type Report = { wallets?: { real: number; test: number; promo: number; balance: number; onHold: number; count: number } };

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  const body = (
    <div className="h-full bg-surface border border-border rounded-xl p-4 hover:border-text-subtle transition-colors">
      <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
  return href ? <Link href={href} className="block no-underline">{body}</Link> : body;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl text-text font-semibold font-sans tabular-nums">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  return gatedPage(async (actor) => {
    const portalUrl = readEnv().portalUrl;
    const [wl, rep] = await Promise.all([
      portalAdminFetch("/api/admin/waitlist?status=waitlist", { actor: actor.email }),
      portalAdminFetch("/api/admin/jbox/report", { actor: actor.email }),
    ]);
    const counts = wl.status === 200 ? (wl.body as { counts?: Counts }).counts ?? null : null;
    const wallets = rep.status === 200 ? (rep.body as Report).wallets ?? null : null;
    const fail = (r: { status: number; body: unknown }) => (r.body as { message?: string })?.message ?? `HTTP ${r.status}`;
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
          <h1 className="text-2xl text-text font-semibold tracking-tight">Dashboard</h1>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Waitlist" href="/waitlist">
            {counts ? (
              <div className="flex gap-8">
                <Stat label="waiting" value={num(counts.waiting)} />
                <Stat label="approved" value={num(counts.approved)} />
              </div>
            ) : (
              <p className="text-sm text-danger">Could not load the counts: {fail(wl)}</p>
            )}
            <p className="mt-3 text-xs text-accent">Open the waitlist</p>
          </Card>
          <Card title="JBux" href="/jbux">
            {wallets ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Stat label="real JBux in wallets" value={num(wallets.real)} />
                <Stat label="test JBux" value={num(wallets.test)} />
                <Stat label="promo JBux" value={num(wallets.promo)} />
                <Stat label={`wallets (${num(wallets.onHold)} on hold)`} value={num(wallets.count)} />
              </div>
            ) : (
              <p className="text-sm text-danger">Could not load the report: {fail(rep)}</p>
            )}
            <p className="mt-3 text-xs text-accent">Open the JBux report</p>
          </Card>
          <Card title="Portal">
            <p className="text-sm text-text break-all">{portalUrl}</p>
            <p className="mt-1 text-xs text-text-muted">Every action here is carried out by the portal, as {actor.email}.</p>
            <a href={portalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-accent hover:text-accent-hover">Open the portal</a>
          </Card>
          <Card title="Sections">
            <ul className="text-sm space-y-1.5">
              <li><Link href="/waitlist" className="text-accent hover:text-accent-hover">Waitlist</Link><span className="text-text-muted">: approve sign-ups, move people back.</span></li>
              <li><Link href="/jbux" className="text-accent hover:text-accent-hover">JBux</Link><span className="text-text-muted">: the ledger report, refunds, wallet holds.</span></li>
            </ul>
          </Card>
        </div>
      </>
    );
  });
}

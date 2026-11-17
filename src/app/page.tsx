import Link from "next/link";
import { gatedPage } from "@/components/AdminGate";
import { readEnv } from "@/lib/env";
import { num } from "@/lib/format";
import { isMongoUnavailable, mongoDb } from "@/lib/mongo";
import { getJbuxReport, type JbuxReport } from "@/lib/repo/jbux-report";
import { waitlistCounts, type WaitlistCounts } from "@/lib/repo/waitlist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

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

type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

async function load<T>(run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    if (isMongoUnavailable(e)) return { ok: false, message: "the platform database could not be reached" };
    console.error(`[jx-admin] dashboard: ${(e as Error)?.message ?? e}`);
    return { ok: false, message: "the database answered with an error" };
  }
}

export default function DashboardPage() {
  return gatedPage(async (actor) => {
    const env = readEnv();
    // The dashboard reads the platform database directly; nothing here goes through the portal.
    const [counts, report, users] = await Promise.all([
      load<WaitlistCounts>(async () => waitlistCounts(await mongoDb())),
      load<JbuxReport>(async () => getJbuxReport(await mongoDb())),
      load<number>(async () => (await mongoDb()).collection("users").countDocuments({ role: { $ne: "bot" } })),
    ]);
    const wallets = report.ok ? report.value.wallets : null;
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
          <h1 className="text-2xl text-text font-semibold tracking-tight">Dashboard</h1>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Waitlist" href="/waitlist">
            {counts.ok ? (
              <div className="flex gap-8">
                <Stat label="waiting" value={num(counts.value.waiting)} />
                <Stat label="approved" value={num(counts.value.approved)} />
              </div>
            ) : (
              <p className="text-sm text-danger">Could not load the counts: {counts.message}.</p>
            )}
            <p className="mt-3 text-xs text-accent">Open the waitlist</p>
          </Card>
          <Card title="Users" href="/users">
            {users.ok ? (
              <Stat label="accounts (bots excluded)" value={num(users.value)} />
            ) : (
              <p className="text-sm text-danger">Could not count the accounts: {users.message}.</p>
            )}
            <p className="mt-3 text-xs text-accent">Search users, set roles</p>
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
              <p className="text-sm text-danger">Could not load the report: {report.ok ? "no wallets" : report.message}.</p>
            )}
            <p className="mt-3 text-xs text-accent">Open the JBux report</p>
          </Card>
          <Card title="Data">
            <p className="text-sm text-text">MongoDB database <span className="font-mono">{env.mongoDbName}</span></p>
            <p className="mt-1 text-xs text-text-muted">Waitlist, users and the JBux report read and write it directly, as {actor.email}. Every write is recorded in admin_actions.</p>
            {env.portal ? (
              <p className="mt-3 text-xs text-text-muted">
                Money actions (refund, hold) go to the portal at{" "}
                <a href={env.portal.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover break-all">{env.portal.url}</a>.
              </p>
            ) : (
              <p className="mt-3 text-xs text-notice">Portal link not set: money actions (refund, hold) are disabled. Set JX_PORTAL_URL and JX_ADMIN_API_TOKEN to enable them.</p>
            )}
          </Card>
          <Card title="Sections">
            <ul className="text-sm space-y-1.5">
              <li><Link href="/waitlist" className="text-accent hover:text-accent-hover">Waitlist</Link><span className="text-text-muted">: approve sign-ups, move people back.</span></li>
              <li><Link href="/users" className="text-accent hover:text-accent-hover">Users</Link><span className="text-text-muted">: find an account, set its role.</span></li>
              <li><Link href="/jbux" className="text-accent hover:text-accent-hover">JBux</Link><span className="text-text-muted">: the ledger report, refunds, wallet holds.</span></li>
            </ul>
          </Card>
        </div>
      </>
    );
  });
}

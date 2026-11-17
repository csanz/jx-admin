/**
 * The portal waitlist, on the platform database directly (src/lib/repo/waitlist.ts).
 *   GET  /api/waitlist?status=waitlist|approved&q=      -> { counts: { waiting, approved }, users: [...] } (at most 100)
 *   POST /api/waitlist { userId, action }               -> { user, email } (email: sent | failed | not-configured | null)
 * Admin gate on both, same-origin JSON on the write. Approve sends the "You're in" email through Resend when
 * RESEND_API_KEY is set (the link in it points to JX_PORTAL_URL, or play.jazaix.com) and records the outcome on the
 * user; every write appends an admin_actions document.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { readJsonBody } from "@/lib/proxy";
import { jsonOk, withDb } from "@/lib/db-route";
import { readEnv } from "@/lib/env";
import { PORTAL_PUBLIC_URL, sendEmail, type EmailMessage } from "@/lib/email";
import { mongoDb } from "@/lib/mongo";
import { applyWaitlistAction, listWaitlist, parseWaitlistAction } from "@/lib/repo/waitlist";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  const status = req.nextUrl.searchParams.get("status") === "approved" ? "approved" : "waitlist";
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const r = await withDb(async () => listWaitlist(await mongoDb(), status, q));
  if (!r.ok) return r.res;
  return jsonOk(r.value);
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const a = parseWaitlistAction(parsed.body);
  if (!a.ok) return jsonError("invalid-input", 400, a.error === "invalid-user" ? "userId must be a 24-hex id." : "action must be approve or waitlist.");
  const env = readEnv();
  const emailCfg = env.email;
  const send = emailCfg ? (msg: EmailMessage) => sendEmail(msg, emailCfg) : null;
  const r = await withDb(async () =>
    applyWaitlistAction(await mongoDb(), {
      userId: a.userId,
      action: a.action,
      admin: { id: g.actor.id, email: g.actor.email },
      sendEmail: send,
      portalBase: env.portal?.url ?? PORTAL_PUBLIC_URL,
    })
  );
  if (!r.ok) return r.res;
  if (!r.value.ok) return jsonError(r.value.error, r.value.status, r.value.message);
  console.info(`[jx-admin] waitlist ${a.action} user=${a.userId} admin=${g.actor.email} email=${r.value.email ?? "n/a"}`);
  return jsonOk({ user: r.value.user, email: r.value.email });
}

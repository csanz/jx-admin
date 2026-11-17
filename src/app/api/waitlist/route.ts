/**
 * The portal waitlist, proxied.
 *   GET  /api/waitlist?status=waitlist|approved&q=      -> portal GET  /api/admin/waitlist
 *   POST /api/waitlist { userId, action }               -> portal POST /api/admin/waitlist
 * Admin gate on both, same-origin JSON on the write, the actor = the session email.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { pickQuery, proxyToPortal, readJsonBody } from "@/lib/proxy";

export const dynamic = "force-dynamic";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/;

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  return proxyToPortal(`/api/admin/waitlist${pickQuery(req, ["status", "q"])}`, { actor: g.actor.email });
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const { userId, action } = parsed.body;
  if (typeof userId !== "string" || !OBJECT_ID_RE.test(userId)) return jsonError("invalid-input", 400, "userId must be a 24-hex id.");
  if (action !== "approve" && action !== "waitlist") return jsonError("invalid-input", 400, "action must be approve or waitlist.");
  return proxyToPortal("/api/admin/waitlist", { method: "POST", body: { userId, action }, actor: g.actor.email });
}

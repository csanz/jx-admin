/**
 * POST /api/jbox/hold { userId, hold: "admin" | null, reason } -> portal POST /api/admin/jbox/hold
 * (put a wallet on hold, or clear the hold). Admin gate + same-origin JSON.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { proxyToPortal, readJsonBody } from "@/lib/proxy";

export const dynamic = "force-dynamic";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/;

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const { userId, hold, reason } = parsed.body;
  if (typeof userId !== "string" || !OBJECT_ID_RE.test(userId)) return jsonError("invalid-input", 400, "userId must be a 24-hex id.");
  if (hold !== "admin" && hold !== null) return jsonError("invalid-input", 400, "hold must be \"admin\" or null.");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return jsonError("invalid-input", 400, "reason is required (at most 500 characters).");
  return proxyToPortal("/api/admin/jbox/hold", { method: "POST", body: { userId, hold, reason: reason.trim() }, actor: g.actor.email });
}

/**
 * POST /api/jbox/refund { receiptId, reason } -> portal POST /api/admin/jbox/refund (an admin refund).
 * Admin gate + same-origin JSON; the portal validates the receipt and does the money.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { proxyToPortal, readJsonBody } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const { receiptId, reason } = parsed.body;
  if (typeof receiptId !== "string" || !receiptId.trim() || receiptId.length > 128) return jsonError("invalid-input", 400, "receiptId is required.");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return jsonError("invalid-input", 400, "reason is required (at most 500 characters).");
  return proxyToPortal("/api/admin/jbox/refund", { method: "POST", body: { receiptId: receiptId.trim(), reason: reason.trim() }, actor: g.actor.email });
}

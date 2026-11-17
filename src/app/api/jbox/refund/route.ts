/**
 * POST /api/jbox/refund { receiptId, reason } -> portal POST /api/admin/jbox/refund (an admin refund).
 * Admin gate + same-origin JSON; the portal validates the receipt and does the money.
 *
 * THIS STAYS A PORTAL CALL ON PURPOSE. adminRefund (jx-portal src/lib/wallet.ts) is a money rule of the ledger:
 * it restores the exact split to the pots it came from and revokes the entitlement the receipt bought. Those rules
 * must have ONE implementation, the portal's; the console never writes wallets or credit_transactions. Without the
 * portal link (JX_PORTAL_URL + JX_ADMIN_API_TOKEN) this answers 503 portal-not-linked and the form is disabled.
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

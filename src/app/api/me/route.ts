/**
 * GET /api/me: the gate's verdict for the UI. 200 { email, admin: true, role } for an admin; otherwise the gate's
 * own JSON error (401 signed out, 403 not an admin, 504 portal unavailable).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  return NextResponse.json({ email: g.actor.email, admin: true, role: g.actor.role }, { headers: { "Cache-Control": "no-store" } });
}

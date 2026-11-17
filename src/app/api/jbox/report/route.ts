/**
 * GET /api/jbox/report?funding=&kind=&from=&to= -> portal GET /api/admin/jbox/report (the JBux admin report).
 */
import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/require-admin";
import { pickQuery, proxyToPortal } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  return proxyToPortal(`/api/admin/jbox/report${pickQuery(req, ["funding", "kind", "from", "to"])}`, { actor: g.actor.email });
}

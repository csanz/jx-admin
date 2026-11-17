/**
 * GET /api/jbox/report?funding=&kind=&from=&to= -> the JBux admin report, read from the platform database directly
 * (src/lib/repo/jbux-report.ts, the portal's getJboxReport). Test money stays apart from real money, always.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { jsonOk, withDb } from "@/lib/db-route";
import { mongoDb } from "@/lib/mongo";
import { ReportInputError, getJbuxReport, parseReportFilter } from "@/lib/repo/jbux-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  const q = req.nextUrl.searchParams;
  const input = { funding: q.get("funding"), kind: q.get("kind"), from: q.get("from")?.slice(0, 40), to: q.get("to")?.slice(0, 40) };
  try {
    parseReportFilter(input);
  } catch (e) {
    if (e instanceof ReportInputError) return jsonError("invalid-input", 400, e.message);
    throw e;
  }
  const r = await withDb(async () => getJbuxReport(await mongoDb(), input));
  if (!r.ok) return r.res;
  return jsonOk(r.value);
}

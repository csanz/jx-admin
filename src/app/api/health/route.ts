/**
 * GET /api/health -> { ok: true, portal: <reachable boolean> }. No auth, no config in the answer: it only says
 * whether this app runs and whether the portal answered an unauthenticated HEAD within 5 s.
 */
import { NextResponse } from "next/server";
import { portalUrlIfSet } from "@/lib/env";

export const dynamic = "force-dynamic";

async function portalReachable(): Promise<boolean> {
  const url = portalUrlIfSet();
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${url}/`, { method: "HEAD", redirect: "manual", cache: "no-store", signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, portal: await portalReachable() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/health -> { ok: true, mongo: <boolean>, portal: <boolean | null> }. No auth, no config in the answer: it
 * only says whether this app runs, whether the platform database answered a ping within 5 s, and whether the
 * optional portal link's host answered an unauthenticated HEAD within 5 s (null when the link is not configured).
 */
import { NextResponse } from "next/server";
import { portalUrlIfSet } from "@/lib/env";
import { mongoReachable } from "@/lib/mongo";

export const dynamic = "force-dynamic";

async function portalReachable(): Promise<boolean | null> {
  const url = portalUrlIfSet();
  if (!url) return null;
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
  const [mongo, portal] = await Promise.all([mongoReachable(), portalReachable()]);
  return NextResponse.json({ ok: true, mongo, portal }, { headers: { "Cache-Control": "no-store" } });
}

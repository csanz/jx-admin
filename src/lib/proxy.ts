/**
 * The route handlers' shared proxy step: a bounded JSON body (writes) and the portal call with the actor set to the
 * session email. The browser only ever talks to this app; this app talks to the portal with the service token.
 */
import { NextResponse, type NextRequest } from "next/server";
import { portalAdminFetch } from "./portal.ts";
import { jsonError } from "./require-admin.ts";

/** Biggest body a console write accepts: every admin body is a few short fields. */
export const MAX_BODY = 4096;

export async function readJsonBody(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const text = await req.text();
  if (text.length > MAX_BODY) return { ok: false, res: jsonError("body-too-large", 413) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    return { ok: false, res: jsonError("invalid-json", 400) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, res: jsonError("invalid-json", 400) };
  return { ok: true, body: parsed as Record<string, unknown> };
}

/** The portal's answer (status and JSON, already mapped for 401/403/5xx/timeouts) as this app's response. */
export async function proxyToPortal(path: string, opts: { method?: "GET" | "POST"; body?: unknown; actor: string }): Promise<NextResponse> {
  const r = await portalAdminFetch(path, opts);
  if (r.mapped) console.warn(`[jx-admin] portal ${opts.method ?? "GET"} ${path.split("?")[0]} -> ${r.status} (${(r.body as { error?: string })?.error ?? "mapped"})`);
  return NextResponse.json(r.body ?? {}, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

/** Only known query names travel to the portal, each capped in length. */
export function pickQuery(req: NextRequest, names: readonly string[], maxLen = 80): string {
  const out = new URLSearchParams();
  for (const n of names) {
    const v = req.nextUrl.searchParams.get(n);
    if (v !== null && v !== "") out.set(n, v.slice(0, maxLen));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

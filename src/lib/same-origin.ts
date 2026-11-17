/**
 * Same-origin JSON check for cookie-session routes that change state (CSRF guard), ported from the portal
 * (src/lib/same-origin.ts, security review 2026-11-07, jazaix/jx-bootstrap#19). Pure: the request is a plain
 * object of the four headers, so node runs it in the tests. src/lib/require-admin.ts adapts a NextRequest.
 */

export type SameOriginFailure = { ok: false; status: 403 | 415; error: string };

export type SameOriginInput = {
  origin: string | null;
  secFetchSite: string | null;
  contentType: string | null;
  /** The origin the request was addressed to (req.nextUrl.origin). */
  requestOrigin: string | null;
};

/** The console's own origin(s), from process config only (AUTH_URL), never a header. */
export function adminOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  for (const v of [env.AUTH_URL, env.NEXTAUTH_URL]) {
    if (!v) continue;
    try {
      out.push(new URL(v).origin);
    } catch {
      /* ignore a malformed value */
    }
  }
  return out;
}

function normOrigin(o: string | null | undefined): string | null {
  if (!o) return null;
  try {
    return new URL(o).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function isJsonContentType(ct: string | null | undefined): boolean {
  if (!ct) return false;
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * Null when the request is a same-origin JSON request: Origin is the console (AUTH_URL) or the origin the request
 * was addressed to, Sec-Fetch-Site (when sent) is same-origin, and the body is application/json. Otherwise the
 * failure to return (403 bad-origin / 415 json-required).
 */
export function checkSameOriginJson(req: SameOriginInput, origins: string[]): SameOriginFailure | null {
  const origin = normOrigin(req.origin);
  const allowed = new Set([...origins.map(normOrigin), normOrigin(req.requestOrigin)].filter(Boolean) as string[]);
  if (!origin || !allowed.has(origin)) return { ok: false, status: 403, error: "bad-origin" };
  const site = req.secFetchSite?.trim().toLowerCase();
  if (site && site !== "same-origin") return { ok: false, status: 403, error: "bad-origin" };
  if (!isJsonContentType(req.contentType)) return { ok: false, status: 415, error: "json-required" };
  return null;
}

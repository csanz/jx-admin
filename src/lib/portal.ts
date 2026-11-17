/**
 * THE PORTAL CLIENT, server only. Every call to the portal's admin API goes through portalAdminFetch:
 *   Authorization: Bearer JX_ADMIN_API_TOKEN      (the service token; the portal verifies it)
 *   X-Jx-Admin-Email: <the acting admin's email>  (the portal re-checks that email's role in its database)
 * It never forwards the browser's cookies, the token never reaches the client, and it gives up after 10 s.
 * Portal 401/403 become a 502 (the service token or the role is wrong, never the browser's fault); portal 5xx,
 * timeouts and network errors become a 504. Everything else passes through with the portal's status and JSON.
 * createPortalClient takes an injected fetch so the tests run without a network.
 */
import { readEnv } from "./env.ts";

export const PORTAL_TIMEOUT_MS = 10_000;

export type PortalMethod = "GET" | "POST";

export type PortalCallOptions = {
  method?: PortalMethod;
  body?: unknown;
  /** The signed-in admin performing the action (X-Jx-Admin-Email). Required. */
  actor: string;
};

/** What a route handler forwards to the browser: the (mapped) status and a JSON body. */
export type PortalResult = {
  status: number;
  body: unknown;
  /** True when the status came from a mapping (502/504), not the portal's own answer. */
  mapped: boolean;
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type PortalClientConfig = {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

/** Pure: the status and body the browser gets for a portal answer. */
export function mapPortalStatus(status: number, body: unknown): PortalResult {
  if (status === 401 || status === 403) {
    return {
      status: 502,
      mapped: true,
      body: { error: "portal-rejected", message: "The portal rejected the console's service token or the admin role. Check JX_ADMIN_API_TOKEN on both sides and the account's role." },
    };
  }
  if (status >= 500) {
    return { status: 504, mapped: true, body: { error: "portal-error", message: `The portal answered ${status}.` } };
  }
  return { status, body, mapped: false };
}

export function portalUnavailable(kind: "timeout" | "unreachable"): PortalResult {
  return {
    status: 504,
    mapped: true,
    body: kind === "timeout"
      ? { error: "portal-timeout", message: `The portal did not answer within ${PORTAL_TIMEOUT_MS / 1000} s.` }
      : { error: "portal-unreachable", message: "The portal could not be reached." },
  };
}

function assertPath(path: string): void {
  if (!path.startsWith("/api/admin/")) throw new Error(`portalAdminFetch: refusing a path outside /api/admin/: ${path}`);
}

export function createPortalClient(cfg: PortalClientConfig) {
  const fetchImpl: FetchLike = cfg.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = cfg.timeoutMs ?? PORTAL_TIMEOUT_MS;
  const baseUrl = cfg.baseUrl.replace(/\/+$/, "");

  return async function portalAdminFetch(path: string, opts: PortalCallOptions): Promise<PortalResult> {
    assertPath(path);
    const actor = opts.actor?.trim().toLowerCase();
    if (!actor) throw new Error("portalAdminFetch: an actor email is required");
    const method: PortalMethod = opts.method ?? "GET";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.token}`,
      "X-Jx-Admin-Email": actor,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      // credentials: "omit" and no cookie header: the browser's session never travels to the portal.
      res = await fetchImpl(`${baseUrl}${path}`, { method, headers, body, signal: ctrl.signal, cache: "no-store", redirect: "manual", credentials: "omit" });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as { name?: string })?.name === "AbortError" || ctrl.signal.aborted;
      return portalUnavailable(aborted ? "timeout" : "unreachable");
    }
    clearTimeout(timer);
    let json: unknown = null;
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: "portal-bad-json", message: "The portal did not answer with JSON." };
        if (res.status < 400) return { status: 502, mapped: true, body: json };
      }
    }
    return mapPortalStatus(res.status, json);
  };
}

export type PortalAdminFetch = ReturnType<typeof createPortalClient>;

let cached: { key: string; client: PortalAdminFetch } | null = null;

/** The configured client (JX_PORTAL_URL + JX_ADMIN_API_TOKEN), built per config, never at import time. */
export function portalClient(): PortalAdminFetch {
  const env = readEnv();
  const key = `${env.portalUrl}\n${env.adminApiToken}`;
  if (!cached || cached.key !== key) cached = { key, client: createPortalClient({ baseUrl: env.portalUrl, token: env.adminApiToken }) };
  return cached.client;
}

/** portalAdminFetch(path, { method, body, actor }) with the configured portal and token. */
export function portalAdminFetch(path: string, opts: PortalCallOptions): Promise<PortalResult> {
  return portalClient()(path, opts);
}

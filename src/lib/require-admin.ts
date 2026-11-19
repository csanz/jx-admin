/**
 * THE ADMIN GATE, wired. Every page and every route handler goes through here:
 *   requireAdminPage()            for server components: the decision (the shell and the page redirect or render
 *                                 "Access forbidden"); cached per request, so the shell and the page share one read
 *   requireAdminApi(req, {write}) for route handlers: the admin, or the JSON response to return
 *                                 (401 signed out, 403 not an admin or a cross-site write, 503 config missing (no names: the log has them),
 *                                  504 database unreachable)
 * The decision itself is pure (src/lib/admin-gate.ts): allowlist AND the users row's role "admin", read from MongoDB
 * on every request through src/lib/repo/users.ts. test/routes-import-gate.test.mjs pins that every src/app/api
 * route imports this module.
 */
import { cache } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { sessionEmail } from "./auth.ts";
import { decideAdmin, gateReasonText, parseAllowlist, type GateDecision } from "./admin-gate.ts";
import { EnvError, readEnv } from "./env.ts";
import { mongoDb } from "./mongo.ts";
import { findUserRoleByEmail } from "./repo/users.ts";
import { adminOrigins, checkSameOriginJson, type SameOriginFailure } from "./same-origin.ts";

/** The acting admin: the users row's id (approvedBy.id, self-demotion check) and the email. */
export type AdminActor = { id: string; email: string; role: string };

/** The full decision for the signed-in user (or signed-out). Throws EnvError when the config is incomplete. */
export async function adminDecision(): Promise<GateDecision> {
  const env = readEnv();
  const email = await sessionEmail();
  return decideAdmin(email, parseAllowlist(env.developerEmails), async (e) => {
    const db = await mongoDb();
    return findUserRoleByEmail(db.collection("users"), e);
  });
}

export type PageGate =
  | { kind: "admin"; actor: AdminActor }
  | { kind: "signed-out" }
  | { kind: "not-admin"; email: string; message: string }
  | { kind: "config-error"; missing: string[] };

/**
 * For the shell and the pages. Never throws: a missing config becomes a visible "config-error" page instead of a
 * blank 500. React's cache() dedupes it within one request (the shell layout and the page both call it).
 */
export const requireAdminPage = cache(async function requireAdminPage(): Promise<PageGate> {
  let d: GateDecision;
  try {
    d = await adminDecision();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(`[jx-admin] ${e.message}`);
      return { kind: "config-error", missing: e.missing };
    }
    throw e;
  }
  if (d.admin) return { kind: "admin", actor: { id: d.id, email: d.email, role: d.role } };
  if (d.reason === "signed-out") return { kind: "signed-out" };
  return { kind: "not-admin", email: d.email ?? "", message: gateReasonText(d.reason) };
});

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonError(error: string, status: number, message?: string): NextResponse {
  return NextResponse.json(message ? { error, message } : { error }, { status, headers: NO_STORE });
}

/** The CSRF check for a session route that changes state (ported from the portal). */
export function assertSameOriginJson(req: NextRequest): SameOriginFailure | null {
  return checkSameOriginJson(
    {
      origin: req.headers.get("origin"),
      secFetchSite: req.headers.get("sec-fetch-site"),
      contentType: req.headers.get("content-type"),
      requestOrigin: req.nextUrl?.origin ?? null,
    },
    adminOrigins()
  );
}

/** For route handlers: the acting admin, or the response to return. */
export async function requireAdminApi(req: NextRequest, opts: { write: boolean }): Promise<{ ok: true; actor: AdminActor } | { ok: false; res: NextResponse }> {
  if (opts.write) {
    const bad = assertSameOriginJson(req);
    if (bad) return { ok: false, res: jsonError(bad.error, bad.status) };
  }
  let d: GateDecision;
  try {
    d = await adminDecision();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(`[jx-admin] ${e.message}`);
      return { ok: false, res: jsonError("config-missing", 503, "The console is not configured.") };
    }
    throw e;
  }
  if (d.admin) return { ok: true, actor: { id: d.id, email: d.email, role: d.role } };
  if (d.reason === "signed-out") return { ok: false, res: jsonError("sign-in-required", 401, gateReasonText(d.reason)) };
  if (d.reason === "db-unavailable") return { ok: false, res: jsonError("db-unavailable", 504, gateReasonText(d.reason)) };
  return { ok: false, res: jsonError("forbidden", 403, gateReasonText(d.reason)) };
}

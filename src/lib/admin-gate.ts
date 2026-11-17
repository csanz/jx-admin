/**
 * THE ADMIN GATE, pure part. A signed-in user is an admin only when BOTH hold:
 *   1. the email is on JX_DEVELOPER_EMAILS (comma list, case-insensitive), and
 *   2. the portal confirms role "admin" for that email (GET {JX_PORTAL_URL}/api/admin/me).
 * No JSX, no framework imports: node runs this file directly in the tests. src/lib/require-admin.ts wires it to the
 * session and the portal client.
 */

export type GateDecision =
  | { admin: true; email: string; role: string }
  | { admin: false; email: string | null; reason: "signed-out" | "not-allowlisted" | "portal-role" | "portal-unavailable" };

export function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** "A@x.com, b@y.com ,," -> Set { "a@x.com", "b@y.com" } */
export function parseAllowlist(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const e = normalizeEmail(part);
    if (e) out.add(e);
  }
  return out;
}

export function isAllowlisted(email: string | null | undefined, allowlist: Set<string>): boolean {
  const e = normalizeEmail(email);
  return e !== null && allowlist.has(e);
}

/** What the portal's GET /api/admin/me answers: { email, role }. */
export type PortalMe = { email?: unknown; role?: unknown };

/** The portal confirms the role only when it answers 200 with role "admin" for the SAME email. */
export function portalConfirmsAdmin(email: string, status: number, body: unknown): boolean {
  if (status !== 200 || !body || typeof body !== "object") return false;
  const me = body as PortalMe;
  if (me.role !== "admin") return false;
  const portalEmail = normalizeEmail(typeof me.email === "string" ? me.email : null);
  return portalEmail === normalizeEmail(email);
}

export type RoleLookup = (email: string) => Promise<{ status: number; body: unknown }>;

/**
 * The whole decision with an injected role lookup (the portal client in production, a stub in tests).
 * The lookup only runs for an allowlisted email: the portal never hears about strangers.
 */
export async function decideAdmin(
  email: string | null | undefined,
  allowlist: Set<string>,
  lookupRole: RoleLookup
): Promise<GateDecision> {
  const e = normalizeEmail(email);
  if (!e) return { admin: false, email: null, reason: "signed-out" };
  if (!allowlist.has(e)) return { admin: false, email: e, reason: "not-allowlisted" };
  let res: { status: number; body: unknown };
  try {
    res = await lookupRole(e);
  } catch {
    return { admin: false, email: e, reason: "portal-unavailable" };
  }
  if (res.status >= 500 || res.status === 0) return { admin: false, email: e, reason: "portal-unavailable" };
  if (!portalConfirmsAdmin(e, res.status, res.body)) return { admin: false, email: e, reason: "portal-role" };
  return { admin: true, email: e, role: "admin" };
}

/** Short, non-secret wording for the "Not an admin" page and /api/me. */
export function gateReasonText(reason: Exclude<GateDecision, { admin: true }>["reason"]): string {
  switch (reason) {
    case "signed-out":
      return "Sign in to continue.";
    case "not-allowlisted":
      return "This account is not on the admin list.";
    case "portal-role":
      return "The portal does not hold the admin role for this account.";
    case "portal-unavailable":
      return "The portal could not confirm the admin role (unreachable, or it rejected the console's service token). Try again in a moment.";
  }
}

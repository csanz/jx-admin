/**
 * THE ADMIN GATE, pure part. A signed-in user is an admin only when BOTH hold:
 *   1. the email is on JX_DEVELOPER_EMAILS (comma list, case-insensitive), and
 *   2. the users row for that email (looked up lower-cased) holds role "admin", read from MongoDB on every request
 *      (never cached in the session, so a demotion takes effect at once).
 * No JSX, no framework imports: node runs this file directly in the tests. src/lib/require-admin.ts wires it to the
 * session and the users repo (src/lib/repo/users.ts); the portal's /api/admin/me is no longer part of the gate.
 */

export type GateDecision =
  | { admin: true; email: string; role: "admin"; id: string }
  | { admin: false; email: string | null; reason: "signed-out" | "not-allowlisted" | "not-admin-role" | "db-unavailable" };

export type GateRefusal = Exclude<GateDecision, { admin: true }>["reason"];

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

/** What the users row says for an email: its id and role, or null when there is no row. */
export type RoleRow = { id: string; email: string; role: string } | null;
export type RoleLookup = (email: string) => Promise<RoleRow>;

/** The row confirms the admin only with role exactly "admin" (and the email, when present, the same person). */
export function rowConfirmsAdmin(email: string, row: RoleRow): row is { id: string; email: string; role: "admin" } {
  if (!row || row.role !== "admin" || !row.id) return false;
  const rowEmail = normalizeEmail(row.email);
  return rowEmail === null || rowEmail === normalizeEmail(email);
}

/**
 * The whole decision with an injected role lookup (the users repo on MongoDB in production, a stub in tests).
 * The lookup only runs for an allowlisted email: the database is never asked about strangers.
 */
export async function decideAdmin(email: string | null | undefined, allowlist: Set<string>, lookupRole: RoleLookup): Promise<GateDecision> {
  const e = normalizeEmail(email);
  if (!e) return { admin: false, email: null, reason: "signed-out" };
  if (!allowlist.has(e)) return { admin: false, email: e, reason: "not-allowlisted" };
  let row: RoleRow;
  try {
    row = await lookupRole(e);
  } catch {
    return { admin: false, email: e, reason: "db-unavailable" };
  }
  if (!rowConfirmsAdmin(e, row)) return { admin: false, email: e, reason: "not-admin-role" };
  return { admin: true, email: e, role: "admin", id: row.id };
}

/** Short, non-secret wording for the "Not an admin" page and /api/me. */
export function gateReasonText(reason: GateRefusal): string {
  switch (reason) {
    case "signed-out":
      return "Sign in to continue.";
    case "not-allowlisted":
      return "This account is not on the admin list.";
    case "not-admin-role":
      return "This account does not hold the admin role in the platform database.";
    case "db-unavailable":
      return "The platform database could not be reached to confirm the admin role. Try again in a moment.";
  }
}

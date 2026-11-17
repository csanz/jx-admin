/**
 * Users, on the platform database directly (src/lib/repo/users.ts).
 *   GET  /api/users?q=                 -> { users: [...], total } (email, username or name; at most 50, newest first)
 *   POST /api/users { userId, role }   -> { user, changed } (role: admin | developer | user; "user" is stored as the
 *                                         portal's "player")
 * Admin gate on both, same-origin JSON on the write. The signed-in admin cannot demote themselves (409
 * self-demotion); bot accounts keep role bot. Every change appends an admin_actions document.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { readJsonBody } from "@/lib/proxy";
import { jsonOk, withDb } from "@/lib/db-route";
import { mongoDb } from "@/lib/mongo";
import { parseRoleChange, searchUsers, setUserRole } from "@/lib/repo/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const r = await withDb(async () => searchUsers(await mongoDb(), q));
  if (!r.ok) return r.res;
  return jsonOk(r.value);
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const a = parseRoleChange(parsed.body);
  if (!a.ok) return jsonError("invalid-input", 400, a.message);
  const r = await withDb(async () => setUserRole(await mongoDb(), { userId: a.userId, role: a.role, actor: { id: g.actor.id, email: g.actor.email } }));
  if (!r.ok) return r.res;
  if (!r.value.ok) return jsonError(r.value.error, r.value.status, r.value.message);
  console.info(`[jx-admin] set-role user=${a.userId} role=${a.role} admin=${g.actor.email} changed=${r.value.changed}`);
  return jsonOk({ user: r.value.user, changed: r.value.changed });
}

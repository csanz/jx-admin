/**
 * Users, on the platform database directly (src/lib/repo/users.ts).
 *   GET  /api/users?q=&skip=&sort=&dir=&active=&kind=&af=&at=&created=&cf=&ct=&role=&access=
 *                                      -> { users: [...], total, skip, order, filter } (email, username or name; 50 a
 *                                         page; sort created | active | name, dir asc | desc; newest first by default;
 *                                         each row carries lastActive: the later of the last sign-in and the last
 *                                         play; the filters are src/lib/user-filter.ts: an activity window (1d, 5d,
 *                                         7d, 30d or a range of days) with what counts (played, signed in, either),
 *                                         a created window, a role and the waitlist state)
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
import { parseRoleChange, parseUserFilter, parseUserOrder, searchUsers, setUserRole } from "@/lib/repo/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req, { write: false });
  if (!g.ok) return g.res;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 80);
  const skip = sp.get("skip") ?? "0";
  const order = parseUserOrder(sp.get("sort"), sp.get("dir"));
  const filter = parseUserFilter(sp);
  const r = await withDb(async () => searchUsers(await mongoDb(), q, skip, order, filter));
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

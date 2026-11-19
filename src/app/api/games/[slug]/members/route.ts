/**
 * POST /api/games/:slug/members, a game's people on the platform database directly (src/lib/repo/game-members.ts):
 *   { username | userId, role: "admin" | "contributor" }   add that person to the game with that role, or change it
 *   { userId, action: "remove" }                           take them off the game
 *   -> { members, changed, user, from, to }
 * Admin gate, same-origin JSON, one admin_actions row ("game-member") per call. A game admin (owner 2026-11-18) can do
 * everything the game's owner can on that one game; the owner (creator_id) is never changed here.
 */
import type { NextRequest } from "next/server";
import { requireAdminApi, jsonError } from "@/lib/require-admin";
import { readJsonBody } from "@/lib/proxy";
import { jsonOk, withDb } from "@/lib/db-route";
import { mongoDb } from "@/lib/mongo";
import { applyGameMemberChange, parseGameMemberChange } from "@/lib/repo/game-members";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const g = await requireAdminApi(req, { write: true });
  if (!g.ok) return g.res;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const a = parseGameMemberChange((await params).slug, parsed.body);
  if (!a.ok) return jsonError("invalid-input", 400, a.message);
  const r = await withDb(async () => applyGameMemberChange(await mongoDb(), a.change, { id: g.actor.id, email: g.actor.email }));
  if (!r.ok) return r.res;
  if (!r.value.ok) return jsonError(r.value.error, r.value.status, r.value.message);
  console.info(`[jx-admin] game-member game=${a.change.slug} user=${r.value.user.id} ${r.value.from ?? "none"}->${r.value.to ?? "none"} admin=${g.actor.email} changed=${r.value.changed}`);
  return jsonOk({ members: r.value.members, changed: r.value.changed, user: r.value.user, from: r.value.from, to: r.value.to });
}

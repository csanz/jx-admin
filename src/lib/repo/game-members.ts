/**
 * A GAME'S PEOPLE, read and WRITTEN from the console (owner 2026-11-18: "make Simpl3Un1c0rn an admin for one-shot game
 * in prod ... i need to be able to do that in admin"). The portal keeps them on the game document
 * (jx-portal src/lib/game-members.ts):
 *
 *   owner        games.creator_id. Not changed here.
 *   admin        games.contributors[] entry with role "admin": everything the owner can do on that one game.
 *   contributor  games.contributors[] entry with no role (or "contributor"): edits the game's Settings page.
 *
 * The console writes the same entries the portal's members route writes ({ user_id, role, credit, listed, added_at }),
 * nothing else on the document, and appends one admin_actions row per change (action "game-member"). The portal
 * reads the entry's role on every request, so a change takes effect at once.
 * No framework imports.
 */
import { ObjectId, type Db, type Document } from "mongodb";

/** The game document as this module writes it: only the members array is typed, the rest stays open. */
type StoredEntry = { user_id: ObjectId; role?: string; credit?: string; listed?: boolean; added_at?: Date };
type GameDoc = { _id?: ObjectId; slug?: string; creator_id?: unknown; contributors?: StoredEntry[] };
import { recordAdminAction } from "./audit.ts";
import { idString, isoOrNull, stringOr } from "./values.ts";

export const GAME_MEMBER_ROLES = ["admin", "contributor"] as const;
export type GameMemberRole = (typeof GAME_MEMBER_ROLES)[number];
export const GAME_MEMBERS_MAX = 50;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const USERNAME_MAX = 40;

/** A stored entry's role: "admin" when it says so, else contributor (entries written before 2026-11-18 have none). */
export function gameMemberRoleOf(raw: unknown): GameMemberRole {
  return raw === "admin" ? "admin" : "contributor";
}

export type GameMemberEntry = { userId: string; role: GameMemberRole; credit: string; listed: boolean; addedAt: string | null };

/** The stored entries, read defensively (a document is data): well-formed only, one per user, never the owner. */
export function gameMemberEntries(doc: Document | null | undefined): GameMemberEntry[] {
  const raw = Array.isArray(doc?.contributors) ? (doc!.contributors as unknown[]) : [];
  const owner = idString(doc?.creator_id);
  const seen = new Set<string>();
  const out: GameMemberEntry[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    const userId = idString(r.user_id) ?? "";
    if (!OBJECT_ID_RE.test(userId) || seen.has(userId) || userId === owner) continue;
    seen.add(userId);
    out.push({ userId, role: gameMemberRoleOf(r.role), credit: stringOr(r.credit) || "Contributor", listed: r.listed !== false, addedAt: isoOrNull(r.added_at) });
  }
  return out;
}

export type PersonRef = { id: string; username: string; email: string; name: string; image: string | null };
export type GameMemberView = GameMemberEntry & Omit<PersonRef, "id">;
export type GameMembers = { owner: PersonRef | null; items: GameMemberView[] };

const PERSON_PROJECTION = { username: 1, email: 1, name: 1, image: 1 } as const;

function personOf(id: string, u: Document | undefined): PersonRef {
  return { id, username: stringOr(u?.username), email: stringOr(u?.email), name: stringOr(u?.name), image: typeof u?.image === "string" && u.image ? u.image : null };
}

/** The owner and the members of this game document, each with their account's name, email and picture. */
export async function gameMembersOf(db: Db, doc: Document): Promise<GameMembers> {
  const entries = gameMemberEntries(doc);
  const owner = idString(doc.creator_id);
  const ids = [...entries.map((e) => e.userId), ...(owner ? [owner] : [])].filter((h) => OBJECT_ID_RE.test(h));
  const users = ids.length ? await db.collection("users").find({ _id: { $in: ids.map((h) => new ObjectId(h)) } }, { projection: PERSON_PROJECTION }).toArray() : [];
  const by = new Map(users.map((u) => [idString(u._id) ?? "", u]));
  return {
    owner: owner ? personOf(owner, by.get(owner)) : null,
    items: entries.map((e) => { const { id: _id, ...person } = personOf(e.userId, by.get(e.userId)); void _id; return { ...e, ...person }; }),
  };
}

// ── WRITES ────────────────────────────────────────────────────────────────────────────────────────────────────

export type GameMemberChange =
  | { slug: string; who: { userId: string } | { username: string }; action: "set-role"; role: GameMemberRole }
  | { slug: string; who: { userId: string }; action: "remove" };

/** The request body of POST /api/games/:slug/members -> the change, or why not. Pure. */
export function parseGameMemberChange(slug: unknown, body: Record<string, unknown>): { ok: true; change: GameMemberChange } | { ok: false; message: string } {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return { ok: false, message: "slug must be a game slug." };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  if (body.action === "remove") {
    if (!OBJECT_ID_RE.test(userId)) return { ok: false, message: "userId must be a 24-hex id." };
    return { ok: true, change: { slug, who: { userId }, action: "remove" } };
  }
  if (body.action !== undefined && body.action !== "set-role") return { ok: false, message: "action must be set-role or remove." };
  const role = body.role;
  if (role !== "admin" && role !== "contributor") return { ok: false, message: "role must be admin or contributor." };
  if (userId) {
    if (!OBJECT_ID_RE.test(userId)) return { ok: false, message: "userId must be a 24-hex id." };
    return { ok: true, change: { slug, who: { userId }, action: "set-role", role } };
  }
  if (!username || username.length > USERNAME_MAX) return { ok: false, message: "username is required (at most 40 characters) when there is no userId." };
  return { ok: true, change: { slug, who: { username }, action: "set-role", role } };
}

export type GameMemberResult =
  | { ok: true; members: GameMembers; changed: boolean; user: PersonRef; from: GameMemberRole | null; to: GameMemberRole | null }
  | { ok: false; status: 404 | 409; error: string; message: string };

/** Lower-case form the portal indexes usernames by (jx-portal src/lib/username.ts jxUsernameLower). */
const usernameLower = (s: string) => s.trim().toLowerCase();

/**
 * Apply one change and record it. set-role on someone not yet on the game ADDS them (credit "Contributor", listed);
 * on someone already there it changes the role; remove takes them off. The owner is never an entry (409). Re-reads
 * the document after the write, so the answer is what the portal now sees.
 */
export async function applyGameMemberChange(db: Db, change: GameMemberChange, actor: { id: string; email: string }, now = new Date()): Promise<GameMemberResult> {
  const games = db.collection<GameDoc>("games");
  const users = db.collection("users");
  const game = await games.findOne({ slug: change.slug });
  if (!game) return { ok: false, status: 404, error: "not-found", message: `No game has the slug ${change.slug}.` };
  const userDoc = "userId" in change.who
    ? await users.findOne({ _id: new ObjectId(change.who.userId) }, { projection: PERSON_PROJECTION })
    : await users.findOne({ usernameLower: usernameLower(change.who.username) }, { projection: PERSON_PROJECTION });
  if (!userDoc) {
    return { ok: false, status: 404, error: "no-such-user", message: "userId" in change.who ? "No user with that id." : `No player is called "${change.who.username}".` };
  }
  const userId = idString(userDoc._id) ?? "";
  const user = personOf(userId, userDoc);
  if (idString(game.creator_id) === userId) return { ok: false, status: 409, error: "is-owner", message: `${user.username || user.email || userId} is the game's owner.` };
  const entries = gameMemberEntries(game);
  const current = entries.find((e) => e.userId === userId) ?? null;
  const from = current?.role ?? null;
  let to: GameMemberRole | null = null;
  let changed = false;
  if (change.action === "remove") {
    if (current) {
      await games.updateOne({ slug: change.slug }, { $pull: { contributors: { user_id: new ObjectId(userId) } } });
      changed = true;
    }
  } else {
    to = change.role;
    if (!current) {
      if (entries.length >= GAME_MEMBERS_MAX) return { ok: false, status: 409, error: "full", message: `A game can have ${GAME_MEMBERS_MAX} people.` };
      // the $ne guard: a second add from another tab changes nothing
      await games.updateOne(
        { slug: change.slug, "contributors.user_id": { $ne: new ObjectId(userId) } },
        { $push: { contributors: { user_id: new ObjectId(userId), role: change.role, credit: "Contributor", listed: true, added_at: now } } },
      );
      changed = true;
    } else if (current.role !== change.role) {
      await games.updateOne({ slug: change.slug, "contributors.user_id": new ObjectId(userId) }, { $set: { "contributors.$.role": change.role } });
      changed = true;
    }
  }
  await recordAdminAction(db, { actor: actor.email, action: "game-member", target: userId, details: { game: change.slug, from, to }, at: now });
  const fresh = (await games.findOne({ slug: change.slug })) ?? game;
  return { ok: true, members: await gameMembersOf(db, fresh), changed, user, from, to };
}

/**
 * USERS, straight from the platform database (the portal's `users` collection). No framework imports: node runs this
 * file in the tests, with a fake collection for the pure parts and a throwaway database for the rest.
 *
 * The fields are the portal's (jx-portal src/lib/waitlist.ts and its admin route): email, name, username, image,
 * role ("player" | "developer" | "admin" | "bot"; absent = player), access ("waitlist" | absent = approved),
 * createdAt, lastLoginAt, waitlistedAt, approvedAt, approvedBy { id, email }, waitlistEmails.<kind>, signupAs.
 * The console writes the same fields, so the portal keeps working against the same rows.
 */
import { ObjectId, type Db } from "mongodb";
import { recordAdminAction } from "./audit.ts";
import { parseSkip } from "./paging.ts";
import { regexEscape } from "./values.ts";

/** The roles the console can set. "player" is what the portal stores for an ordinary user (the UI says "user"). */
export const SETTABLE_ROLES = ["admin", "developer", "player"] as const;
export type SettableRole = (typeof SETTABLE_ROLES)[number];

export const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
export const USER_SEARCH_LIMIT = 50;
export const USER_QUERY_MAX = 80;

export type UserDoc = Record<string, unknown> & { _id: ObjectId };

export type Access = "approved" | "waitlist";
export type SignupAs = "gamer" | "developer" | "both";
const SIGNUP_AS: readonly SignupAs[] = ["gamer", "developer", "both"];

/** The projection every list shares (the portal's admin route PROJECTION). */
export const USER_PROJECTION = {
  email: 1, name: 1, username: 1, image: 1, imageSmall: 1, role: 1, access: 1, createdAt: 1, lastLoginAt: 1, waitlistedAt: 1, approvedAt: 1, approvedBy: 1,
  waitlistEmails: 1, signupAs: 1,
} as const;

export type UserView = {
  id: string;
  email: string;
  name: string;
  username: string;
  image: string;
  /** The portal's 96 px copy of an uploaded photo, when there is one. */
  imageSmall: string;
  role: string;
  access: Access;
  createdAt: string | null;
  lastLoginAt: string | null;
  waitlistedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  emails: { joined: string | null; approved: string | null };
  signupAs: SignupAs | null;
};

/** A user document's access. Absent (an account from before the waitlist) = approved. */
export function accessOf(doc: unknown): Access {
  return doc && typeof doc === "object" && (doc as { access?: unknown }).access === "waitlist" ? "waitlist" : "approved";
}

/** A user document's sign-up choice, or null when not chosen yet. */
export function signupAsOf(doc: unknown): SignupAs | null {
  const v = doc && typeof doc === "object" ? (doc as { signupAs?: unknown }).signupAs : undefined;
  return SIGNUP_AS.includes(v as SignupAs) ? (v as SignupAs) : null;
}

/** A document's role as the portal reads it: a string, "player" when absent. */
export function roleOf(doc: unknown): string {
  const r = doc && typeof doc === "object" ? (doc as { role?: unknown }).role : undefined;
  return typeof r === "string" && r ? r : "player";
}

/** "sent" | "failed" | "not-configured" | null (never tried) for one of the waitlist emails. */
function emailStatus(u: UserDoc, kind: "joined" | "approved"): string | null {
  const e = (u.waitlistEmails as Record<string, { status?: unknown }> | undefined)?.[kind];
  return typeof e?.status === "string" ? e.status : null;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : null);

/** The portal admin route's view of a user row, field for field. */
export function userView(u: UserDoc): UserView {
  const by = u.approvedBy && typeof u.approvedBy === "object" ? (u.approvedBy as { email?: unknown }).email : null;
  return {
    id: u._id.toString(),
    email: typeof u.email === "string" ? u.email : "",
    name: typeof u.name === "string" ? u.name : "",
    username: typeof u.username === "string" ? u.username : "",
    image: typeof u.image === "string" ? u.image : "",
    imageSmall: typeof u.imageSmall === "string" ? u.imageSmall : "",
    role: roleOf(u),
    access: accessOf(u),
    createdAt: iso(u.createdAt),
    lastLoginAt: iso(u.lastLoginAt),
    waitlistedAt: iso(u.waitlistedAt),
    approvedAt: iso(u.approvedAt),
    approvedBy: typeof by === "string" ? by : null,
    emails: { joined: emailStatus(u, "joined"), approved: emailStatus(u, "approved") },
    signupAs: signupAsOf(u),
  };
}

/** Escape a search string for a case-insensitive Mongo regex (never a pattern from the caller). Lives in values.ts. */
export { regexEscape };

export function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

// ── THE ROLE LOOKUP (the admin gate's source of truth) ───────────────────────────────────────────────────────────

/** The one method the gate needs from the users collection, so a fake works in the tests. */
export type UsersReadLike = {
  findOne(filter: Record<string, unknown>, options?: { projection?: Record<string, 1> }): Promise<Record<string, unknown> | null>;
};

export type UserRoleRow = { id: string; email: string; role: string };

/** The users row for an email (looked up lower-cased), as { id, email, role }, or null when there is none. */
export async function findUserRoleByEmail(users: UsersReadLike, email: string): Promise<UserRoleRow | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const doc = await users.findOne({ email: e }, { projection: { email: 1, role: 1 } });
  if (!doc || !(doc._id instanceof ObjectId)) return null;
  return { id: doc._id.toString(), email: typeof doc.email === "string" ? doc.email : e, role: roleOf(doc) };
}

// ── SEARCH ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** GET /api/users?q= -> the Mongo filter: email, username or name, case-insensitive; nothing = everyone. */
export function userSearchFilter(q: unknown): Record<string, unknown> {
  const text = typeof q === "string" ? q.trim().slice(0, USER_QUERY_MAX) : "";
  if (!text) return {};
  const re = { $regex: regexEscape(text), $options: "i" };
  return { $or: [{ email: re }, { username: re }, { name: re }] };
}

/** A page of USER_SEARCH_LIMIT users matching q, newest first, starting at `skip` (the list's "more" control). */
export async function searchUsers(db: Db, q: unknown, skip: unknown = 0): Promise<{ users: UserView[]; total: number; skip: number }> {
  const users = db.collection<UserDoc>("users");
  const filter = userSearchFilter(q);
  const from = parseSkip(skip);
  const [total, list] = await Promise.all([
    users.countDocuments(filter),
    users.find(filter, { projection: USER_PROJECTION }).sort({ createdAt: -1, _id: -1 }).skip(from).limit(USER_SEARCH_LIMIT).toArray(),
  ]);
  return { users: list.map(userView), total, skip: from };
}

// ── SET ROLE ───────────────────────────────────────────────────────────────────────────────────────────────────

export type RoleChangeRefusal = { ok: false; status: 400 | 403 | 404 | 409; error: string; message: string };

/** POST /api/users body -> { userId, role } or an error. "user" is accepted as the UI's word for "player". */
export function parseRoleChange(body: unknown): { ok: true; userId: string; role: SettableRole } | { ok: false; error: string; message: string } {
  const b = (body && typeof body === "object" ? body : {}) as { userId?: unknown; role?: unknown };
  if (typeof b.userId !== "string" || !OBJECT_ID_RE.test(b.userId)) return { ok: false, error: "invalid-user", message: "userId must be a 24-hex id." };
  const role = b.role === "user" ? "player" : b.role;
  if (!SETTABLE_ROLES.includes(role as SettableRole)) return { ok: false, error: "invalid-role", message: "role must be admin, developer or user." };
  return { ok: true, userId: b.userId.toLowerCase(), role: role as SettableRole };
}

/**
 * Pure: may `actor` give `target` the `role`? The signed-in admin cannot demote themselves (the same row by id or
 * by email), and a bot account (the crew) never gets a human role.
 */
export function decideRoleChange(input: { actor: { id: string; email: string }; target: { id: string; email: string; role: string }; role: SettableRole }): { ok: true; changed: boolean } | RoleChangeRefusal {
  const self = input.target.id === input.actor.id || (input.target.email !== "" && normalizeEmail(input.target.email) === normalizeEmail(input.actor.email));
  if (self && input.role !== "admin") {
    return { ok: false, status: 409, error: "self-demotion", message: "You cannot remove your own admin role. Ask another admin." };
  }
  if (input.target.role === "bot") return { ok: false, status: 409, error: "bot-account", message: "Bot accounts (the crew) keep role bot." };
  return { ok: true, changed: input.target.role !== input.role };
}

export type SetRoleResult = { ok: true; user: UserView; changed: boolean } | RoleChangeRefusal;

/** Writes users.role and an admin_actions row. The actor is the signed-in admin (id + email from the gate). */
export async function setUserRole(db: Db, input: { userId: string; role: SettableRole; actor: { id: string; email: string }; now?: Date }): Promise<SetRoleResult> {
  if (!OBJECT_ID_RE.test(input.userId)) return { ok: false, status: 400, error: "invalid-user", message: "userId must be a 24-hex id." };
  const users = db.collection<UserDoc>("users");
  const _id = new ObjectId(input.userId);
  const target = await users.findOne({ _id }, { projection: USER_PROJECTION });
  if (!target) return { ok: false, status: 404, error: "not-found", message: "No user with that id." };
  const d = decideRoleChange({ actor: input.actor, target: { id: target._id.toString(), email: typeof target.email === "string" ? target.email : "", role: roleOf(target) }, role: input.role });
  if (!d.ok) return d;
  const now = input.now ?? new Date();
  const from = roleOf(target);
  // Only the portal's own field changes on the row; who did it and when is the admin_actions document.
  if (d.changed) await users.updateOne({ _id }, { $set: { role: input.role } });
  await recordAdminAction(db, { actor: input.actor.email, action: "set-role", target: input.userId, details: { from, to: input.role }, at: now });
  const fresh = (await users.findOne({ _id }, { projection: USER_PROJECTION })) ?? target;
  return { ok: true, user: userView(fresh), changed: d.changed };
}

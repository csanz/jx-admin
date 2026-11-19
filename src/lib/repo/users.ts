/**
 * USERS, straight from the platform database (the portal's `users` collection). No framework imports: node runs this
 * file in the tests, with a fake collection for the pure parts and a throwaway database for the rest.
 *
 * The fields are the portal's (jx-portal src/lib/waitlist.ts and its admin route): email, name, username, image,
 * role ("player" | "developer" | "admin" | "bot"; absent = player), access ("waitlist" | absent = approved),
 * createdAt, lastLoginAt, waitlistedAt, approvedAt, approvedBy { id, email }, waitlistEmails.<kind>, signupAs.
 * The console writes the same fields, so the portal keeps working against the same rows.
 */
import { ObjectId, type Db, type Document } from "mongodb";
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

/** When a person was last seen and how: their latest sign-in (users.lastLoginAt) or their latest play (play_history). */
export type LastActive = { at: string; kind: "played" | "signed-in" };

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
  /** The latest play_history row's played_at, when the list looked it up (null otherwise). */
  lastPlayedAt: string | null;
  /** The later of lastLoginAt and lastPlayedAt, or null when neither is on record. */
  lastActive: LastActive | null;
  waitlistedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  emails: { joined: string | null; approved: string | null };
  signupAs: SignupAs | null;
};

/** Pure: the later of a sign-in and a play, with which it was; null when there is neither. */
export function lastActiveOf(lastLoginAt: string | null, lastPlayedAt: string | null): LastActive | null {
  if (lastPlayedAt && (!lastLoginAt || lastPlayedAt >= lastLoginAt)) return { at: lastPlayedAt, kind: "played" };
  if (lastLoginAt) return { at: lastLoginAt, kind: "signed-in" };
  return null;
}

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
    lastPlayedAt: iso(u.lastPlayedAt),
    lastActive: lastActiveOf(iso(u.lastLoginAt), iso(u.lastPlayedAt)),
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

// ── ORDER (owner 2026-11-19: "a sorting mechanism for latest user sign in") ──────────────────────────────────────

// The order itself (the columns, the default, the parser) lives in src/lib/user-order.ts, which the browser shares.
import { DEFAULT_USER_ORDER, type UserOrder } from "../user-order.ts";
export { DEFAULT_USER_ORDER, USER_SORTS, defaultDir, parseUserOrder, type SortDir, type UserOrder, type UserSort } from "../user-order.ts";

/** The $sort for an order. _id breaks ties so pages never repeat or skip a row. */
export function userSortSpec(order: UserOrder): Record<string, 1 | -1> {
  const d: 1 | -1 = order.dir === "asc" ? 1 : -1;
  const key = order.sort === "active" ? "lastActiveAt" : order.sort === "name" ? "name" : "createdAt";
  return { [key]: d, _id: d };
}

const LATEST_PLAY: Document[] = [{ $sort: { played_at: -1 } }, { $limit: 1 }, { $project: { _id: 0, played_at: 1 } }];

/**
 * The stages that add lastPlayedAt (the person's latest play_history row) and lastActiveAt (the later of that and
 * lastLoginAt). play_history.user_id is the user's ObjectId in some rows and its hex string in others, so the two
 * forms are looked up separately, each an index seek on user_id_1_played_at_-1.
 */
export const LAST_ACTIVE_STAGES: Document[] = [
  { $addFields: { idHex: { $toString: "$_id" } } },
  { $lookup: { from: "play_history", localField: "_id", foreignField: "user_id", pipeline: LATEST_PLAY, as: "playByOid" } },
  { $lookup: { from: "play_history", localField: "idHex", foreignField: "user_id", pipeline: LATEST_PLAY, as: "playByHex" } },
  { $addFields: { lastPlayedAt: { $max: [{ $first: "$playByOid.played_at" }, { $first: "$playByHex.played_at" }] } } },
  { $addFields: { lastActiveAt: { $max: ["$lastLoginAt", "$lastPlayedAt"] } } },
];

/**
 * Pure: the pipeline for one page of the list. The last-play lookups cost one index seek per user, so they run after
 * the page is cut unless the page is ordered by last active, when every matching user has to be looked up first.
 */
export function userListPipeline(filter: Record<string, unknown>, order: UserOrder, skip: number, limit: number): Document[] {
  const page: Document[] = [{ $sort: userSortSpec(order) }, { $skip: skip }, { $limit: limit }];
  const project: Document = { $project: { ...USER_PROJECTION, lastPlayedAt: 1, lastActiveAt: 1 } };
  return order.sort === "active"
    ? [{ $match: filter }, ...LAST_ACTIVE_STAGES, ...page, project]
    : [{ $match: filter }, ...page, ...LAST_ACTIVE_STAGES, project];
}

// ── FILTERS (owner 2026-11-19: "who played this week ... date ranges ... the last 5 days, the last 30 days") ──────

// The filters themselves (the windows, the kinds, the URL parsing) live in src/lib/user-filter.ts, which the browser shares.
import { EMPTY_USER_FILTER, windowBounds, type UserFilter, type Window } from "../user-filter.ts";
export { EMPTY_USER_FILTER, isEmptyUserFilter, parseUserFilter, userFilterParams, userFilterSummary, type UserFilter } from "../user-filter.ts";

/** Pure: { $gte, $lt? } for a window at `now`. */
export function windowRange(w: Window, now: Date): Record<string, Date> {
  const b = windowBounds(w, now);
  return b.to ? { $gte: b.from, $lt: b.to } : { $gte: b.from };
}

/** Pure: a play_history.user_id (the hex string in some rows, the ObjectId in others) as lower-case hex, or null. */
export function userIdHex(v: unknown): string | null {
  if (v instanceof ObjectId) return v.toHexString();
  return typeof v === "string" && OBJECT_ID_RE.test(v) ? v.toLowerCase() : null;
}

/**
 * The distinct users with a play_history row in the range ({ $gte, $lt? } on played_at), as ObjectIds; both id forms
 * come back as one id each. The query is a scan of the range's rows (play_history has no played_at index); the
 * collection holds one row per game per five minutes of play.
 */
export async function playedUserIds(db: Db, range: Record<string, Date>): Promise<ObjectId[]> {
  const rows = await db.collection("play_history").aggregate<{ _id: unknown }>([{ $match: { played_at: range } }, { $group: { _id: "$user_id" } }]).toArray();
  const seen = new Set<string>();
  for (const r of rows) {
    const hex = userIdHex(r._id);
    if (hex) seen.add(hex);
  }
  return [...seen].map((hex) => new ObjectId(hex));
}

/**
 * Pure: the Mongo filter for a UserFilter, given the ids that played in the active window (null when the filter does
 * not need them). "player" is the portal's word for an ordinary user and is stored as "player" or not at all.
 */
export function userFilterConditions(f: UserFilter, now: Date, played: ObjectId[] | null): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (f.active) {
    const signedIn = { lastLoginAt: windowRange(f.active, now) };
    const playedIn = { _id: { $in: played ?? [] } };
    out.push(f.kind === "played" ? playedIn : f.kind === "signed-in" ? signedIn : { $or: [signedIn, playedIn] });
  }
  if (f.created) out.push({ createdAt: windowRange(f.created, now) });
  if (f.role) out.push(f.role === "player" ? { $or: [{ role: "player" }, { role: { $exists: false } }, { role: null }] } : { role: f.role });
  if (f.access) out.push(f.access === "waitlist" ? { access: "waitlist" } : { access: { $ne: "waitlist" } });
  return out;
}

/** The whole list filter: the search text and every set filter, $and-ed; {} when nothing is set. */
export async function buildUserFilter(db: Db, q: unknown, f: UserFilter, now: Date): Promise<Record<string, unknown>> {
  const needPlayed = f.active !== null && f.kind !== "signed-in";
  const played = needPlayed ? await playedUserIds(db, windowRange(f.active as Window, now)) : null;
  const parts = [userSearchFilter(q), ...userFilterConditions(f, now, played)].filter((p) => Object.keys(p).length);
  return parts.length === 0 ? {} : parts.length === 1 ? parts[0] : { $and: parts };
}

export type UserSearch = { users: UserView[]; total: number; skip: number; order: UserOrder; filter: UserFilter };

/**
 * A page of USER_SEARCH_LIMIT users matching q and the filter in `order` (newest first by default), starting at
 * `skip` (the list's "more" control).
 */
export async function searchUsers(db: Db, q: unknown, skip: unknown = 0, order: UserOrder = DEFAULT_USER_ORDER, f: UserFilter = EMPTY_USER_FILTER, now: Date = new Date()): Promise<UserSearch> {
  const users = db.collection<UserDoc>("users");
  const filter = await buildUserFilter(db, q, f, now);
  const from = parseSkip(skip);
  // names sort case-insensitively (the collation); dates and ids are unaffected by it
  const options = order.sort === "name" ? { collation: { locale: "en", strength: 2 } } : {};
  const [total, list] = await Promise.all([
    users.countDocuments(filter),
    users.aggregate<UserDoc>(userListPipeline(filter, order, from, USER_SEARCH_LIMIT), options).toArray(),
  ]);
  return { users: list.map(userView), total, skip: from, order, filter: f };
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

/**
 * ONE USER, read only (the role change stays in users.ts): every field of the users row with anything secret-looking
 * redacted, the wallet summary, the sign-ins the portal records, the play history and the game sessions.
 *
 * SIGN-INS: the portal signs in with Auth.js on JWT sessions with NO adapter (jx-portal src/lib/auth.ts), so there is
 * no `sessions` or `accounts` collection. On every sign-in it sets `users.lastLoginAt`; `createdAt` is the first
 * sign-in. Those two dates are all the database holds about signing in; the page says so. Play activity (play_history,
 * game_sessions) is the dated record of when someone was actually on.
 * No framework imports.
 */
import { ObjectId, type Db, type Document, type Filter } from "mongodb";
import { numberedPage, type NumberedPage } from "./paging.ts";
import { OBJECT_ID_RE, accessOf, roleOf } from "./users.ts";
import { displayValue, idString, isoOrNull, numberOr0, stringOr } from "./values.ts";

export const USER_LISTS_PAGE_SIZE = 50;
export const REDACTED = "[redacted]";

/** A field name that looks like it holds a secret: token, secret, hash, password, credential, api key, private key. */
export const SECRET_FIELD_RE = /token|secret|hash|passw(or)?d|credential|api[_-]?key|private[_-]?key|otp|salt/i;

export function isSecretField(name: string): boolean {
  return SECRET_FIELD_RE.test(name);
}

/** A copy of a value with every secret-looking field (at any depth) replaced by REDACTED. */
export function redactSecrets(v: unknown, depth = 0): unknown {
  if (depth > 8 || v === null || typeof v !== "object" || v instanceof Date || idString(v) !== null) return v;
  if (Array.isArray(v)) return v.map((x) => redactSecrets(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, isSecretField(k) ? REDACTED : redactSecrets(x, depth + 1)]));
}

/** Every field of the users row as [name, display text], secrets redacted. */
export function userFields(doc: Document): Array<[string, string]> {
  return Object.entries(doc).map(([k, v]) => {
    if (isSecretField(k)) return [k, REDACTED];
    if (v === null) return [k, "null"];
    return [k, displayValue(redactSecrets(v))];
  });
}

export type WalletSummary = { balance: number; real: number; test: number; promo: number; hold: string | null; updatedAt: string | null };

export function walletSummary(doc: Document | null): WalletSummary | null {
  if (!doc) return null;
  const funds = doc.funds && typeof doc.funds === "object" ? (doc.funds as Record<string, unknown>) : null;
  return {
    balance: numberOr0(doc.balance),
    // a legacy wallet with no `funds` is all test money (the jbux report's rule)
    real: funds ? numberOr0(funds.real) : 0,
    test: funds ? numberOr0(funds.test) : numberOr0(doc.balance),
    promo: funds ? numberOr0(funds.promo) : 0,
    hold: typeof doc.hold === "string" && doc.hold ? doc.hold : null,
    updatedAt: isoOrNull(doc.updatedAt),
  };
}

export type UserHeader = {
  id: string;
  email: string;
  name: string;
  username: string;
  image: string;
  imageSmall: string;
  role: string;
  access: "approved" | "waitlist";
  createdAt: string | null;
  lastLoginAt: string | null;
};

export type SignIns = {
  /** The first sign-in (the row's createdAt). */
  first: string | null;
  /** The latest sign-in (lastLoginAt, set by the portal on every sign-in). */
  latest: string | null;
  /** Always true today: the portal keeps only the latest sign-in, not a history. */
  onlyLatestStored: boolean;
};

export type PlayRow = { id: string; playedAt: string | null; gameId: string; gameName: string; gameSlug: string };
export type SessionRow = {
  id: string;
  game: string;
  roomId: string;
  joinedAt: string | null;
  leftAt: string | null;
  durationS: number | null;
  role: string;
  seated: boolean;
  open: boolean;
};

export type UserDetail = {
  user: UserHeader;
  fields: Array<[string, string]>;
  wallet: WalletSummary | null;
  signIns: SignIns;
  plays: NumberedPage<PlayRow>;
  sessions: NumberedPage<SessionRow>;
};

/** Both forms a user id may be stored in (ObjectId or its hex), for collections that are not consistent. */
export function idForms(hex: string): Array<string | ObjectId> {
  return [hex, new ObjectId(hex)];
}

export function sessionRow(doc: Document): SessionRow {
  return {
    id: displayValue(doc._id),
    game: stringOr(doc.game_slug) || stringOr(doc.game_id),
    roomId: stringOr(doc.room_id),
    joinedAt: isoOrNull(doc.joined_at),
    leftAt: isoOrNull(doc.left_at),
    durationS: typeof doc.duration_s === "number" ? doc.duration_s : null,
    role: stringOr(doc.role),
    seated: doc.seated === true,
    open: doc.open === true,
  };
}

/** The user with this id and their activity, or null (bad id or no such user). `playsPage` / `sessionsPage`: ?plays= / ?sessions=. */
export async function getUserDetail(db: Db, id: unknown, opts: { playsPage?: unknown; sessionsPage?: unknown } = {}): Promise<UserDetail | null> {
  if (typeof id !== "string" || !OBJECT_ID_RE.test(id)) return null;
  const hex = id.toLowerCase();
  const doc = await db.collection("users").findOne({ _id: new ObjectId(hex) });
  if (!doc) return null;

  const playsFilter: Filter<Document> = { user_id: { $in: idForms(hex) } };
  const sessionsFilter: Filter<Document> = { player_id: { $in: idForms(hex) } };
  const ph = db.collection("play_history");
  const gs = db.collection("game_sessions");
  const size = USER_LISTS_PAGE_SIZE;
  const [walletDoc, playDocs, sessions] = await Promise.all([
    db.collection("wallets").findOne({ userId: { $in: idForms(hex) } } as Filter<Document>),
    numberedPage({
      page: opts.playsPage,
      size,
      count: () => ph.countDocuments(playsFilter),
      fetch: (skip, limit) => ph.find(playsFilter).sort({ played_at: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
    }),
    numberedPage({
      page: opts.sessionsPage,
      size,
      count: () => gs.countDocuments(sessionsFilter),
      fetch: (skip, limit) => gs.find(sessionsFilter).sort({ joined_at: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
    }),
  ]);

  // play_history carries the game's ObjectId: one lookup for the names
  const gameIds = [...new Set(playDocs.rows.map((p) => idString(p.game_id)).filter((g): g is string => !!g && OBJECT_ID_RE.test(g)))];
  const games = gameIds.length
    ? await db.collection("games").find({ _id: { $in: gameIds.map((g) => new ObjectId(g)) } }, { projection: { name: 1, slug: 1 } }).toArray()
    : [];
  const gameById = new Map(games.map((g) => [idString(g._id) ?? "", { name: stringOr(g.name), slug: stringOr(g.slug) }]));

  return {
    user: {
      id: hex,
      email: stringOr(doc.email),
      name: stringOr(doc.name),
      username: stringOr(doc.username),
      image: stringOr(doc.image),
      imageSmall: stringOr(doc.imageSmall),
      role: roleOf(doc),
      access: accessOf(doc),
      createdAt: isoOrNull(doc.createdAt),
      lastLoginAt: isoOrNull(doc.lastLoginAt),
    },
    fields: userFields(doc),
    wallet: walletSummary(walletDoc),
    signIns: { first: isoOrNull(doc.createdAt), latest: isoOrNull(doc.lastLoginAt), onlyLatestStored: true },
    plays: {
      ...playDocs,
      rows: playDocs.rows.map((p) => {
        const gid = idString(p.game_id) ?? displayValue(p.game_id);
        const g = gameById.get(gid);
        return { id: displayValue(p._id), playedAt: isoOrNull(p.played_at), gameId: gid, gameName: g?.name ?? "", gameSlug: g?.slug ?? "" };
      }),
    },
    sessions: { ...sessions, rows: sessions.rows.map(sessionRow) },
  };
}

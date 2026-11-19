/**
 * GAMES, read only, straight from the platform database: the portal's `games` collection and what hangs off a game
 * (`game_keys`, `game_join_requests`; its rooms are in repo/rooms.ts). Nothing here writes.
 *
 * KEY VALUES NEVER LEAVE THE DATABASE: the keys query projects only label, createdAt, environment and status, and
 * gameKeyView copies only those fields, so even a store that ignored the projection could not leak `key` (or its
 * `prefix`). test/repo-games.test.mjs pins it.
 * No framework imports.
 */
import { ObjectId, type Db, type Document, type Filter } from "mongodb";
import { PAGE_SIZE, pageLimit, paged, parsePage, type Paged } from "./paging.ts";
import { idString, isoOrNull, numberOr0, regexEscape, stringOr } from "./values.ts";
import { gameMembersOf, type GameMembers } from "./game-members.ts";

export const GAME_QUERY_MAX = 80;
export const GAME_JOIN_REQUESTS_LIMIT = 50;
export const GAME_KEYS_LIMIT = 50;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const GAME_SORTS = ["plays", "rounds", "updated"] as const;
export type GameSort = (typeof GAME_SORTS)[number];

/** ?sort= -> one of the three sorts; anything else is "updated" (newest first). */
export function parseGameSort(v: unknown): GameSort {
  return GAME_SORTS.includes(v as GameSort) ? (v as GameSort) : "updated";
}

/** The Mongo sort for a GameSort (descending, ties broken by _id so pages never overlap). */
export function gameSortSpec(sort: GameSort): Record<string, 1 | -1> {
  if (sort === "plays") return { plays: -1, _id: -1 };
  if (sort === "rounds") return { rounds_completed: -1, _id: -1 };
  return { updatedAt: -1, _id: -1 };
}

/** ?q= -> the filter: slug, name or creator name, case-insensitive substring; nothing = every game. */
export function gameSearchFilter(q: unknown): Filter<Document> {
  const text = typeof q === "string" ? q.trim().slice(0, GAME_QUERY_MAX) : "";
  if (!text) return {};
  const re = { $regex: regexEscape(text), $options: "i" };
  return { $or: [{ slug: re }, { name: re }, { creator_name: re }] };
}

export type GameRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  creator: string;
  access: string;
  plays: number;
  rounds: number;
  updatedAt: string | null;
};

const LIST_PROJECTION = { slug: 1, name: 1, emoji: 1, creator_name: 1, access: 1, visibility: 1, plays: 1, rounds_completed: 1, updatedAt: 1 } as const;

/** A game's access as stored: `access` (the portal's field), else the older `visibility`, else "". */
export function accessOfGame(doc: Document): string {
  return stringOr(doc.access) || stringOr(doc.visibility);
}

export function gameRow(doc: Document): GameRow {
  return {
    id: idString(doc._id) ?? "",
    slug: stringOr(doc.slug),
    name: stringOr(doc.name),
    emoji: stringOr(doc.emoji),
    creator: stringOr(doc.creator_name),
    access: accessOfGame(doc),
    plays: numberOr0(doc.plays),
    rounds: numberOr0(doc.rounds_completed),
    updatedAt: isoOrNull(doc.updatedAt),
  };
}

export type GameListInput = { q?: unknown; sort?: unknown; page?: unknown };
export type GameList = Paged<GameRow> & { q: string; sort: GameSort };

/** The games list: search, sort, and pages of PAGE_SIZE shown cumulatively (?page=n shows the first n pages). */
export async function listGames(db: Db, input: GameListInput = {}): Promise<GameList> {
  const sort = parseGameSort(input.sort);
  const page = parsePage(input.page);
  const filter = gameSearchFilter(input.q);
  const games = db.collection("games");
  const [total, docs] = await Promise.all([
    games.countDocuments(filter),
    games.find(filter, { projection: LIST_PROJECTION }).sort(gameSortSpec(sort)).limit(pageLimit(page, PAGE_SIZE)).toArray(),
  ]);
  const q = typeof input.q === "string" ? input.q.trim().slice(0, GAME_QUERY_MAX) : "";
  return { ...paged(docs.map(gameRow), total, page), q, sort };
}

export type GameView = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  creator: { id: string | null; name: string };
  tags: string[];
  access: string;
  clientUrl: string;
  discordUrl: string;
  studioEnabled: boolean;
  counters: { likes: number; dislikes: number; favorites: number; views: number; plays: number; peeks: number; roundsCompleted: number };
  createdAt: string | null;
  updatedAt: string | null;
};

export function gameView(doc: Document): GameView {
  return {
    id: idString(doc._id) ?? "",
    slug: stringOr(doc.slug),
    name: stringOr(doc.name),
    emoji: stringOr(doc.emoji),
    description: stringOr(doc.description),
    creator: { id: idString(doc.creator_id), name: stringOr(doc.creator_name) },
    tags: Array.isArray(doc.tags) ? doc.tags.filter((t: unknown): t is string => typeof t === "string") : [],
    access: accessOfGame(doc),
    clientUrl: stringOr(doc.client_url),
    discordUrl: stringOr(doc.discord_url),
    studioEnabled: doc.studio_enabled === true,
    counters: {
      likes: numberOr0(doc.likes),
      dislikes: numberOr0(doc.dislikes),
      favorites: numberOr0(doc.favorites),
      views: numberOr0(doc.views),
      plays: numberOr0(doc.plays),
      peeks: numberOr0(doc.peeks),
      roundsCompleted: numberOr0(doc.rounds_completed),
    },
    createdAt: isoOrNull(doc.createdAt),
    updatedAt: isoOrNull(doc.updatedAt),
  };
}

/** What the console may know about a key: never the key, never its prefix. */
export type GameKeyView = { label: string; createdAt: string | null; environment: string; status: string };
export const KEY_PROJECTION = { label: 1, createdAt: 1, environment: 1, status: 1 } as const;

export function gameKeyView(doc: Document): GameKeyView {
  return { label: stringOr(doc.label), createdAt: isoOrNull(doc.createdAt), environment: stringOr(doc.environment), status: stringOr(doc.status) };
}

export type JoinRequestView = { id: string; userId: string; email: string | null; status: string; createdAt: string | null; decidedAt: string | null; decidedBy: string | null };

export type GameDetail = {
  game: GameView;
  keys: { count: number; items: GameKeyView[] };
  joinRequests: { count: number; items: JoinRequestView[] };
  /** The owner and the people on the game (admins, contributors), with their accounts (repo/game-members.ts). */
  members: GameMembers;
};

/** The game with this slug and what hangs off it, or null when there is none. */
export async function getGameDetail(db: Db, slug: unknown): Promise<GameDetail | null> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return null;
  const doc = await db.collection("games").findOne({ slug });
  if (!doc) return null;
  const idHex = idString(doc._id) ?? "";
  // game_keys carry the game's ObjectId and its slug; join requests carry the id as a hex string.
  // Rooms are paged separately (repo/rooms.ts listRooms with the game's slug).
  const keyFilter: Filter<Document> = { $or: [{ game_id: doc._id }, { game_slug: slug }] };
  const joinFilter: Filter<Document> = { gameId: { $in: [idHex, doc._id] } };
  const [keyCount, keyDocs, joinCount, joinDocs] = await Promise.all([
    db.collection("game_keys").countDocuments(keyFilter),
    db.collection("game_keys").find(keyFilter, { projection: KEY_PROJECTION }).sort({ createdAt: -1, _id: -1 }).limit(GAME_KEYS_LIMIT).toArray(),
    db.collection("game_join_requests").countDocuments(joinFilter),
    db.collection("game_join_requests").find(joinFilter).sort({ createdAt: -1, _id: -1 }).limit(GAME_JOIN_REQUESTS_LIMIT).toArray(),
  ]);
  const emails = await emailsFor(db, joinDocs.flatMap((r) => [idString(r.userId), idString(r.decidedBy)]));
  const joinRequests = joinDocs.map((r) => {
    const userId = idString(r.userId) ?? "";
    const decidedBy = idString(r.decidedBy);
    return {
      id: idString(r._id) ?? "",
      userId,
      email: emails.get(userId) ?? null,
      status: stringOr(r.status),
      createdAt: isoOrNull(r.createdAt),
      decidedAt: isoOrNull(r.decidedAt),
      decidedBy: decidedBy ? (emails.get(decidedBy) ?? decidedBy) : null,
    };
  });
  return {
    game: gameView(doc),
    keys: { count: keyCount, items: keyDocs.map(gameKeyView) },
    joinRequests: { count: joinCount, items: joinRequests },
    members: await gameMembersOf(db, doc),
  };
}

/** The emails of a set of user ids (24-hex), looked up in one query. */
async function emailsFor(db: Db, ids: Array<string | null>): Promise<Map<string, string>> {
  const hex = [...new Set(ids.filter((i): i is string => typeof i === "string" && /^[a-f0-9]{24}$/i.test(i)))];
  if (!hex.length) return new Map();
  const users = await db.collection("users").find({ _id: { $in: hex.map((h) => new ObjectId(h)) } }, { projection: { email: 1 } }).toArray();
  return new Map(users.filter((u) => typeof u.email === "string").map((u) => [idString(u._id) ?? "", u.email as string]));
}

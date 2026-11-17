/**
 * ROOMS, read only: the engine's `rooms` collection (one document per room, `_id` = `room_id`) and everything that
 * carries a room id: `game_sessions`, `matches`, `server_events`, `live_snapshots`, `client_reports`. Every related
 * list is matched on `room_id`, capped, and comes back with its total count. No framework imports.
 */
import type { Db, Document, Filter } from "mongodb";
import { numberedPage, type NumberedPage } from "./paging.ts";
import { displayValue, idString, isoOrNull, numberOr0, stringOr } from "./values.ts";

export const ROOMS_PAGE_SIZE = 25;
export const ROOM_SESSIONS_LIMIT = 200;
export const ROOM_MATCHES_LIMIT = 50;
export const ROOM_EVENTS_LIMIT = 200;
export const ROOM_SNAPSHOTS_LIMIT = 10;
export const ROOM_REPORTS_LIMIT = 100;
/** The longest formatted snapshot shown (characters); longer ones are cut with a note. */
export const SNAPSHOT_TEXT_MAX = 20_000;

/** Room ids are engine-made: letters, digits and - _ : . only. Anything else matches nothing. */
export const ROOM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const GAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const STATE_RE = /^[a-z][a-zA-Z_-]{0,31}$/;

export function isRoomId(v: unknown): v is string {
  return typeof v === "string" && ROOM_ID_RE.test(v);
}

/** The filter for one game's rooms: rooms carry the slug as game_slug, or as game_id when game_slug was never set. */
export function roomGameFilter(game: string): Filter<Document> {
  return { $or: [{ game_slug: game }, { game_id: game }] };
}

/** ?game= & ?state= -> the rooms filter (invalid values are ignored). */
export function roomsFilter(input: { game?: unknown; state?: unknown }): Filter<Document> {
  const parts: Filter<Document>[] = [];
  if (typeof input.game === "string" && GAME_RE.test(input.game)) parts.push(roomGameFilter(input.game));
  if (typeof input.state === "string" && STATE_RE.test(input.state)) parts.push({ state: input.state });
  if (!parts.length) return {};
  return parts.length === 1 ? parts[0] : { $and: parts };
}

/** The columns a rooms table shows. */
export type RoomRow = {
  roomId: string;
  name: string;
  game: string;
  state: string;
  phase: string;
  players: number;
  watchers: number;
  max: number | null;
  round: string;
  hasWorker: boolean;
  test: boolean;
  updatedAt: string | null;
};

export function roomRow(doc: Document): RoomRow {
  return {
    roomId: stringOr(doc.room_id) || displayValue(doc._id),
    name: stringOr(doc.name),
    game: stringOr(doc.game_slug) || stringOr(doc.game_id),
    state: stringOr(doc.state),
    phase: stringOr(doc.phase),
    players: numberOr0(doc.players),
    watchers: numberOr0(doc.watchers),
    max: typeof doc.max_players === "number" ? doc.max_players : null,
    round: doc.round === null || doc.round === undefined ? "" : displayValue(doc.round),
    hasWorker: doc.has_worker === true,
    test: doc.test === true,
    updatedAt: isoOrNull(doc.updatedAt),
  };
}

export type RoomList = NumberedPage<RoomRow> & { game: string; state: string };

/** Rooms, most recently updated first, ROOMS_PAGE_SIZE a page (?page=n, previous/next). */
export async function listRooms(db: Db, input: { game?: unknown; state?: unknown; page?: unknown } = {}): Promise<RoomList> {
  const filter = roomsFilter(input);
  const col = db.collection("rooms");
  const p = await numberedPage({
    page: input.page,
    size: ROOMS_PAGE_SIZE,
    count: () => col.countDocuments(filter),
    fetch: (skip, limit) => col.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  });
  return {
    ...p,
    rows: p.rows.map(roomRow),
    game: typeof input.game === "string" && GAME_RE.test(input.game) ? input.game : "",
    state: typeof input.state === "string" && STATE_RE.test(input.state) ? input.state : "",
  };
}

/** The values the rooms filter offers: every game id / slug and state the rooms carry, sorted. */
export async function roomFilterOptions(db: Db): Promise<{ games: string[]; states: string[] }> {
  const col = db.collection("rooms");
  const [slugs, ids, states] = await Promise.all([col.distinct("game_slug"), col.distinct("game_id"), col.distinct("state")]);
  const strings = (xs: unknown[]) => xs.filter((x): x is string => typeof x === "string" && x !== "");
  return { games: [...new Set([...strings(slugs), ...strings(ids)])].sort(), states: [...new Set(strings(states))].sort() };
}

// ── ONE ROOM ───────────────────────────────────────────────────────────────────────────────────────────────────

export type Capped<T> = { count: number; items: T[] };

export type RoomSessionView = {
  id: string;
  name: string;
  playerId: string;
  role: string;
  seated: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  durationS: number | null;
  connId: string;
  open: boolean;
};

export function roomSessionView(doc: Document): RoomSessionView {
  return {
    id: displayValue(doc._id),
    name: stringOr(doc.name),
    playerId: stringOr(doc.player_id),
    role: stringOr(doc.role),
    seated: doc.seated === true,
    joinedAt: isoOrNull(doc.joined_at),
    leftAt: isoOrNull(doc.left_at),
    durationS: typeof doc.duration_s === "number" ? doc.duration_s : null,
    connId: displayValue(doc.conn_id),
    open: doc.open === true,
  };
}

export type MatchView = { id: string; at: string | null; roundId: string; players: number; playerNames: string[]; timeline: string[] | null };

/** A match: its time, round, players and the timeline as one readable line per entry (null when it has none). */
export function matchView(doc: Document): MatchView {
  const players = Array.isArray(doc.players) ? doc.players : [];
  return {
    id: displayValue(doc._id),
    at: isoOrNull(doc.at),
    roundId: stringOr(doc.round_id),
    players: players.length,
    playerNames: players.map((p: unknown) => (p && typeof p === "object" ? stringOr((p as { name?: unknown }).name) : "")).filter(Boolean),
    timeline: Array.isArray(doc.timeline) ? doc.timeline.map(timelineLine) : null,
  };
}

/** One timeline entry as text: "t / type / the rest" when it is an object, else its display value. */
export function timelineLine(entry: unknown): string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return displayValue(entry);
  const e = { ...(entry as Record<string, unknown>) };
  const head: string[] = [];
  for (const k of ["t", "at", "ts", "time"]) if (k in e) { head.push(displayValue(e[k])); delete e[k]; break; }
  for (const k of ["type", "kind", "event"]) if (k in e) { head.push(displayValue(e[k])); delete e[k]; break; }
  const rest = Object.entries(e).map(([k, v]) => `${k}: ${displayValue(v)}`).join(", ");
  return [...head, rest].filter(Boolean).join(" / ");
}

export type ServerEventView = { id: string; at: string | null; type: string; playerCount: number | null };

export function serverEventView(doc: Document): ServerEventView {
  return { id: displayValue(doc._id), at: isoOrNull(doc.timestamp), type: stringOr(doc.event_type), playerCount: typeof doc.player_count === "number" ? doc.player_count : null };
}

export type SnapshotView = { id: string; kind: string; savedAt: string | null; text: string; cut: boolean };

/**
 * A stored value as formatted JSON. Snapshots store JSON text, whose `body` is often JSON text again: both levels are
 * parsed so the page shows one readable tree. Anything that does not parse is shown as it is.
 */
export function formatSnapshotValue(v: unknown): { text: string; cut: boolean } {
  const unwrap = (x: unknown, depth: number): unknown => {
    if (typeof x === "string" && depth < 3) {
      const t = x.trim();
      if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
        try {
          return unwrap(JSON.parse(t), depth + 1);
        } catch {
          return x;
        }
      }
      return x;
    }
    if (x && typeof x === "object" && !Array.isArray(x) && depth < 3) {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(Object.entries(o).map(([k, val]) => [k, typeof val === "string" ? unwrap(val, depth + 1) : val]));
    }
    return x;
  };
  const parsed = unwrap(v, 0);
  let text: string;
  try {
    text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, (_k, val) => (isObjectId(val) ? idString(val) : val), 2) ?? "";
  } catch {
    text = String(parsed);
  }
  const cut = text.length > SNAPSHOT_TEXT_MAX;
  return { text: cut ? text.slice(0, SNAPSHOT_TEXT_MAX) : text, cut };
}

function isObjectId(v: unknown): boolean {
  return Boolean(v && typeof v === "object" && typeof (v as { toHexString?: unknown }).toHexString === "function");
}

export function snapshotView(doc: Document): SnapshotView {
  const { text, cut } = formatSnapshotValue(doc.value);
  return { id: displayValue(doc._id), kind: stringOr(doc.kind), savedAt: isoOrNull(doc.saved_at), text, cut };
}

export type ClientReportView = { id: string; at: string | null; name: string; device: string; reason: string; errors: number; sessionMs: number | null };

export function clientReportView(doc: Document): ClientReportView {
  const d = doc.device && typeof doc.device === "object" ? (doc.device as Record<string, unknown>) : null;
  const device = d ? [stringOr(d.class), stringOr(d.renderer)].filter(Boolean).join(", ") : displayValue(doc.device);
  const errors = Array.isArray(doc.errors) ? doc.errors.length : typeof doc.errors === "number" ? doc.errors : 0;
  return { id: displayValue(doc._id), at: isoOrNull(doc.received_at), name: stringOr(doc.name), device, reason: stringOr(doc.reason), errors, sessionMs: typeof doc.session_ms === "number" ? doc.session_ms : null };
}

export type RoomDetail = {
  roomId: string;
  /** Every field of the room document, as display text; null when no room document exists (the logs may still). */
  fields: Array<[string, string]> | null;
  row: RoomRow | null;
  sessions: Capped<RoomSessionView>;
  matches: Capped<MatchView>;
  events: Capped<ServerEventView> & { order: "newest" | "oldest" };
  snapshots: Capped<SnapshotView>;
  reports: Capped<ClientReportView>;
};

/** Every field of a document as [name, display text], in stored order. Long values are kept whole (up to 5000). */
export function documentFields(doc: Document): Array<[string, string]> {
  return Object.entries(doc).map(([k, v]) => {
    if (v === null) return [k, "null"];
    if (typeof v === "string") return [k, v.length > 5000 ? `${v.slice(0, 4997)}...` : v];
    return [k, displayValue(v)];
  });
}

/** One room and everything that names it, or null for an id that is not a room id. */
export async function getRoomDetail(db: Db, roomId: unknown, opts: { eventsOrder?: unknown } = {}): Promise<RoomDetail | null> {
  if (!isRoomId(roomId)) return null;
  const byRoom = { room_id: roomId };
  const order = opts.eventsOrder === "oldest" ? "oldest" : "newest";
  const capped = async <T>(name: string, sort: Record<string, 1 | -1>, limit: number, view: (d: Document) => T): Promise<Capped<T>> => {
    const col = db.collection(name);
    const [count, docs] = await Promise.all([col.countDocuments(byRoom), col.find(byRoom).sort(sort).limit(limit).toArray()]);
    return { count, items: docs.map(view) };
  };
  const [doc, sessions, matches, events, snapshots, reports] = await Promise.all([
    db.collection("rooms").findOne({ $or: [{ _id: roomId }, { room_id: roomId }] } as Filter<Document>),
    capped("game_sessions", { joined_at: -1, _id: -1 }, ROOM_SESSIONS_LIMIT, roomSessionView),
    capped("matches", { at: -1, _id: -1 }, ROOM_MATCHES_LIMIT, matchView),
    capped("server_events", order === "oldest" ? { timestamp: 1, _id: 1 } : { timestamp: -1, _id: -1 }, ROOM_EVENTS_LIMIT, serverEventView),
    capped("live_snapshots", { saved_at: -1, _id: -1 }, ROOM_SNAPSHOTS_LIMIT, snapshotView),
    capped("client_reports", { received_at: -1, _id: -1 }, ROOM_REPORTS_LIMIT, clientReportView),
  ]);
  return {
    roomId,
    fields: doc ? documentFields(doc) : null,
    row: doc ? roomRow(doc) : null,
    sessions,
    matches,
    events: { ...events, order },
    snapshots,
    reports,
  };
}

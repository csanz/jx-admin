/**
 * THE CLIPS CLIENT, server only: Content > Clips reads the clips pipeline's public list (jx-replays bin/clips-page.mjs,
 * GET {JX_CLIPS_API_URL}/api/clips?game=&featured=1&limit=&offset=, newest first, X-Total-Count = the whole count; no
 * token, the same call the games and the portal make). Read only: the console never writes to the clips API.
 *   loadClips     one page (CLIPS_PAGE_SIZE) as rows the table can show; a missing URL is "off" (the page says clips
 *                 are not connected and nothing more), a slow or unreachable API is a visible message, never a 500.
 *   parseClipsQuery / clipRow / clipPeople  pure, tested without a network (an injected fetch for the rest).
 * No framework imports: node runs this module directly in the tests.
 */

export const CLIPS_TIMEOUT_MS = 5_000;
export const CLIPS_PAGE_SIZE = 25;
/** The clips API's own cap on `limit` (jx-replays clips-api.js CLIPS_PAGE_MAX). */
export const CLIPS_API_PAGE_MAX = 50;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export type ClipsQuery = { page: number; game: string; featured: boolean };

export type ClipPerson = {
  name: string;
  bot: boolean;
  /** The portal user id (a 24-hex ObjectId) when the player was signed in, so the cell can link to /users/<id>. */
  userId: string | null;
};

export type ClipRow = {
  clipId: string;
  game: string;
  createdAt: string | null;
  renderedAt: string | null;
  durationS: number | null;
  killer: ClipPerson | null;
  victim: ClipPerson | null;
  /** Everyone who pressed SAVE (humans with or without an account). */
  savedBy: number;
  /** A clip somebody kept, or one that never expires: it stays. Otherwise it goes at expiresAt. */
  kept: boolean;
  expiresAt: string | null;
  featured: boolean;
  tags: string[];
  score: number | null;
  headshot: boolean;
  distanceM: number | null;
  poster: string | null;
  /** The video (always present: a record without one is not a clip). */
  clip: string;
  gif: string | null;
};

export type ClipsPage = ClipsQuery & { rows: ClipRow[]; total: number; pageCount: number };

export type ClipsLoad =
  | { ok: true; value: ClipsPage }
  | { ok: false; kind: "off" | "timeout" | "unreachable" | "error"; message: string };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The list's state from the URL: ?page=n (1-based, 1 by default), ?game=<slug>, ?featured=1. Pure. */
export function parseClipsQuery(sp: SP): ClipsQuery {
  const n = Math.floor(Number(one(sp.page)));
  const game = one(sp.game).trim().slice(0, 80);
  return {
    page: Number.isFinite(n) && n >= 1 ? n : 1,
    game: /^[a-z0-9][a-z0-9_-]*$/i.test(game) ? game : "",
    featured: one(sp.featured) === "1",
  };
}

/** The clips API query for a page: its own filters plus limit/offset. Pure. */
export function clipsApiSearch(q: ClipsQuery, pageSize = CLIPS_PAGE_SIZE): URLSearchParams {
  const u = new URLSearchParams();
  if (q.game) u.set("game", q.game);
  if (q.featured) u.set("featured", "1");
  u.set("limit", String(Math.min(pageSize, CLIPS_API_PAGE_MAX)));
  u.set("offset", String((q.page - 1) * pageSize));
  return u;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const httpUrl = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};

type RawPerson = { id?: unknown; name?: unknown; bot?: unknown; pid?: unknown };

/** The killer and the victim as people: the clip's wire record names them, `players` carries their platform ids. Pure. */
export function clipPeople(raw: { killer?: unknown; victim?: unknown; players?: unknown }): { killer: ClipPerson | null; victim: ClipPerson | null } {
  const players = Array.isArray(raw.players) ? (raw.players as RawPerson[]) : [];
  const person = (p: unknown): ClipPerson | null => {
    if (!p || typeof p !== "object") return null;
    const r = p as RawPerson;
    const name = str(r.name) ?? (num(r.id) !== null ? `player ${r.id}` : null);
    if (!name) return null;
    const pid = str(r.pid) ?? str(players.find((x) => x && num(x.id) !== null && x.id === r.id)?.pid);
    return { name, bot: r.bot === true, userId: pid && OBJECT_ID_RE.test(pid) ? pid.toLowerCase() : null };
  };
  return { killer: person(raw.killer), victim: person(raw.victim) };
}

/** One wire record as a table row, or null when it is not a clip (no id or no video). Pure. */
export function clipRow(raw: unknown): ClipRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const clipId = str(r.clipId);
  const urls = (r.urls && typeof r.urls === "object" ? r.urls : {}) as Record<string, unknown>;
  const clip = httpUrl(urls.clip);
  if (!clipId || !clip) return null;
  const savedBy = Array.isArray(r.savedBy) ? (r.savedBy as Array<Record<string, unknown>>).filter((s) => s && typeof s === "object") : [];
  const expiresAt = iso(r.expiresAt);
  const { killer, victim } = clipPeople(r);
  return {
    clipId,
    game: str(r.game) ?? "",
    createdAt: iso(r.createdAt),
    renderedAt: iso(r.renderedAt),
    durationS: num(r.durationS),
    killer,
    victim,
    savedBy: savedBy.length,
    kept: expiresAt === null || r.kept === true || savedBy.some((s) => s.kept === true),
    expiresAt,
    featured: r.featured === true,
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string" && t !== "") : [],
    score: num(r.score),
    headshot: r.headshot === true,
    distanceM: num(r.distanceM),
    poster: httpUrl(urls.poster),
    clip,
    gif: httpUrl(urls.gif),
  };
}

/** The share page of a clip on the portal (jx-portal /game/<slug>/clips/<id>), when the portal URL is known. Pure. */
export function clipShareUrl(portalUrl: string | null, row: Pick<ClipRow, "game" | "clipId">): string | null {
  if (!portalUrl || !row.game) return null;
  return `${portalUrl}/game/${encodeURIComponent(row.game)}/clips/${encodeURIComponent(row.clipId)}`;
}

/** The whole count: the API's X-Total-Count, or, without the header (an older API), what this page proves. Pure. */
export function clipsTotal(header: string | null, offset: number, got: number, pageSize: number): number {
  const n = header === null ? NaN : Math.floor(Number(header));
  if (Number.isFinite(n) && n >= 0) return Math.max(n, offset + got);
  // no header: at least this page; a full page means there may be one more
  return offset + got + (got >= pageSize ? 1 : 0);
}

export const CLIPS_OFF_MESSAGE = "Clips are not connected.";

/** One page of clips from the API, or why there is none. Never throws. */
export async function loadClips(
  baseUrl: string | null,
  q: ClipsQuery,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; pageSize?: number } = {},
): Promise<ClipsLoad> {
  if (!baseUrl) return { ok: false, kind: "off", message: CLIPS_OFF_MESSAGE };
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? CLIPS_TIMEOUT_MS;
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? CLIPS_PAGE_SIZE, CLIPS_API_PAGE_MAX));
  const offset = (q.page - 1) * pageSize;
  const url = `${baseUrl}/api/clips?${clipsApiSearch(q, pageSize).toString()}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) {
      console.warn(`[jx-admin] clips API answered ${res.status}`);
      return { ok: false, kind: "error", message: `the clips API answered ${res.status}` };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: "error", message: "the clips API did not answer with JSON" };
    }
    if (!Array.isArray(body)) return { ok: false, kind: "error", message: "the clips API did not answer with a list" };
    const rows = body.map(clipRow).filter((r): r is ClipRow => r !== null);
    const total = clipsTotal(res.headers.get("x-total-count"), offset, body.length, pageSize);
    return { ok: true, value: { ...q, rows, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      console.warn(`[jx-admin] clips API timed out after ${timeoutMs} ms`);
      return { ok: false, kind: "timeout", message: `the clips API did not answer within ${Math.round(timeoutMs / 1000)} s` };
    }
    console.warn(`[jx-admin] clips API unreachable: ${(e as Error)?.message ?? e}`);
    return { ok: false, kind: "unreachable", message: "the clips API could not be reached" };
  } finally {
    clearTimeout(timer);
  }
}

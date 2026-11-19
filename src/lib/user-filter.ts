/**
 * THE USERS LIST'S FILTERS (owner 2026-11-19: "more advanced filtering mechanisms ... who played this week, date
 * ranges, or just straight up the last 5 days, the last 30 days"), shared by the browser (the filter row in
 * UsersConsole) and the server (the repo's filter builder), so it imports nothing: no database, no framework, no env.
 *
 * Every filter lives in the URL (?active=7d&kind=played&created=range&cf=2026-11-01&ct=2026-11-15&role=player
 * &access=approved), so "who played this week" is a link that can be bookmarked and shared.
 *
 *   active   a window the person was active in: 1d (the last 24 hours), 5d, 7d, 30d, or range (af..at, UTC days,
 *            both ends included); nothing = everyone
 *   kind     what counts as active inside that window: played (a play_history row), signed-in (the latest sign-in
 *            stamp, users.lastLoginAt), either (the default; the same rule as the Last active column)
 *   created  the same windows for the account's creation date (cf..ct for range)
 *   role     admin | developer | player | bot; nothing = every role
 *   access   approved | waitlist; nothing = both
 */

export const WINDOW_PRESETS = ["1d", "5d", "7d", "30d"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];
export const WINDOW_PRESET_DAYS: Record<WindowPreset, number> = { "1d": 1, "5d": 5, "7d": 7, "30d": 30 };
export const WINDOW_PRESET_LABEL: Record<WindowPreset, string> = { "1d": "last 24 hours", "5d": "last 5 days", "7d": "last 7 days", "30d": "last 30 days" };

/** A time window: a rolling preset ("the last 7 days", up to now) or a fixed range of UTC days (both included). */
export type Window = { preset: WindowPreset } | { preset: "range"; from: string; to: string };

export const ACTIVE_KINDS = ["either", "played", "signed-in"] as const;
export type ActiveKind = (typeof ACTIVE_KINDS)[number];
export const ACTIVE_KIND_LABEL: Record<ActiveKind, string> = { either: "played or signed in", played: "played", "signed-in": "signed in" };

export const FILTER_ROLES = ["admin", "developer", "player", "bot"] as const;
export type FilterRole = (typeof FILTER_ROLES)[number];
export const FILTER_ACCESS = ["approved", "waitlist"] as const;
export type FilterAccess = (typeof FILTER_ACCESS)[number];

export type UserFilter = {
  active: Window | null;
  kind: ActiveKind;
  created: Window | null;
  role: FilterRole | null;
  access: FilterAccess | null;
};

export const EMPTY_USER_FILTER: UserFilter = { active: null, kind: "either", created: null, role: null, access: null };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" that is a real UTC day, else null. */
export function parseDay(v: unknown): string | null {
  if (typeof v !== "string" || !DAY_RE.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? null : v;
}

/** A window from its three URL params; a range with a bad or missing day is no window; a reversed range is turned around. */
export function parseWindow(preset: unknown, from: unknown, to: unknown): Window | null {
  if (WINDOW_PRESETS.includes(preset as WindowPreset)) return { preset: preset as WindowPreset };
  if (preset !== "range") return null;
  const f = parseDay(from);
  const t = parseDay(to);
  if (!f || !t) return null;
  return f <= t ? { preset: "range", from: f, to: t } : { preset: "range", from: t, to: f };
}

type Params = { get(name: string): string | null };

/** The URL's search params -> the filter; anything unknown is "no filter" for that part. */
export function parseUserFilter(sp: Params): UserFilter {
  const kind = sp.get("kind");
  const role = sp.get("role");
  const access = sp.get("access");
  return {
    active: parseWindow(sp.get("active"), sp.get("af"), sp.get("at")),
    kind: ACTIVE_KINDS.includes(kind as ActiveKind) ? (kind as ActiveKind) : "either",
    created: parseWindow(sp.get("created"), sp.get("cf"), sp.get("ct")),
    role: FILTER_ROLES.includes(role as FilterRole) ? (role as FilterRole) : null,
    access: FILTER_ACCESS.includes(access as FilterAccess) ? (access as FilterAccess) : null,
  };
}

/** The filter's URL params (only the parts that are set), the inverse of parseUserFilter. */
export function userFilterParams(f: UserFilter): Record<string, string> {
  const p: Record<string, string> = {};
  const put = (name: string, w: Window | null, fromKey: string, toKey: string) => {
    if (!w) return;
    p[name] = w.preset;
    if (w.preset === "range") {
      p[fromKey] = w.from;
      p[toKey] = w.to;
    }
  };
  put("active", f.active, "af", "at");
  if (f.active && f.kind !== "either") p.kind = f.kind;
  put("created", f.created, "cf", "ct");
  if (f.role) p.role = f.role;
  if (f.access) p.access = f.access;
  return p;
}

export function isEmptyUserFilter(f: UserFilter): boolean {
  return !f.active && !f.created && !f.role && !f.access;
}

/** The instants a window covers: [from, to) with `to` null for a rolling preset (up to now). */
export function windowBounds(w: Window, now: Date = new Date()): { from: Date; to: Date | null } {
  if (w.preset === "range") {
    const from = new Date(`${w.from}T00:00:00.000Z`);
    return { from, to: new Date(new Date(`${w.to}T00:00:00.000Z`).getTime() + DAY_MS) };
  }
  return { from: new Date(now.getTime() - WINDOW_PRESET_DAYS[w.preset] * DAY_MS), to: null };
}

/** The window as a phrase: "in the last 7 days", "from 2026-11-01 to 2026-11-15", "on 2026-11-01". */
export function windowPhrase(w: Window): string {
  if (w.preset !== "range") return `in the ${WINDOW_PRESET_LABEL[w.preset]}`;
  return w.from === w.to ? `on ${w.from}` : `from ${w.from} to ${w.to}`;
}

/** The filter in words, for the count line: "played in the last 7 days, created from 2026-11-01 to 2026-11-15, role user". */
export function userFilterSummary(f: UserFilter): string {
  const parts: string[] = [];
  if (f.active) parts.push(`${ACTIVE_KIND_LABEL[f.kind]} ${windowPhrase(f.active)}`);
  if (f.created) parts.push(`created ${windowPhrase(f.created)}`);
  if (f.role) parts.push(`role ${f.role === "player" ? "user" : f.role}`);
  if (f.access) parts.push(f.access === "waitlist" ? "on the waitlist" : "approved");
  return parts.join(", ");
}

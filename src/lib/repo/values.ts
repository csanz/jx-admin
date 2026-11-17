/**
 * Turning stored values into plain, serialisable ones for the pages: a Date becomes an ISO string, an ObjectId its
 * hex, anything structured short JSON. No framework imports.
 */
export const DISPLAY_MAX = 300;

/** Escape a search string for a case-insensitive Mongo regex (never a pattern from the caller). */
export function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isObjectIdLike(v: unknown): v is { toHexString(): string } {
  return Boolean(v && typeof v === "object" && typeof (v as { toHexString?: unknown }).toHexString === "function");
}

/** A Date as ISO, or null. */
export function isoOrNull(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString() : null;
}

/** An id (ObjectId or string) as a string, or null. */
export function idString(v: unknown): string | null {
  if (isObjectIdLike(v)) return v.toHexString();
  return typeof v === "string" && v ? v : null;
}

export function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function stringOr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function plain(v: unknown): unknown {
  if (v instanceof Date) return isoOrNull(v);
  if (isObjectIdLike(v)) return v.toHexString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  return v;
}

/** Any stored value as one display string ("" for null or absent), at most DISPLAY_MAX characters. */
export function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.length > DISPLAY_MAX ? `${v.slice(0, DISPLAY_MAX - 3)}...` : v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  const p = plain(v);
  const text = typeof p === "string" ? p : JSON.stringify(p);
  return text.length > DISPLAY_MAX ? `${text.slice(0, DISPLAY_MAX - 3)}...` : text;
}

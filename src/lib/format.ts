/** Small display helpers shared by the pages (no JSX). */

export function when(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function num(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "n/a";
}

/** The message to show for a failed console API call: the portal's message, its error code, or the HTTP status. */
export function errorText(status: number, body: unknown): string {
  const b = (body ?? {}) as { message?: unknown; error?: unknown };
  if (typeof b.message === "string" && b.message) return b.message;
  if (typeof b.error === "string" && b.error) return `${b.error} (HTTP ${status})`;
  return `HTTP ${status}`;
}

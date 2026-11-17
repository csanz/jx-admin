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

/** A short date for table cells: "Nov 17 14:05", with the year when it is not the current one. Times in UTC so the
 * server render and the browser agree. */
export function shortWhen(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const day = d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(sameYear ? {} : { year: "2-digit" }) });
  const time = d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} ${time}`;
}

/** A duration in seconds as "1h 02m", "3m 05s" or "12.4s". */
export function duration(s: number | null | undefined): string {
  if (typeof s !== "number" || !Number.isFinite(s)) return "n/a";
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

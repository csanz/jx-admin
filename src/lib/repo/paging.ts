/**
 * Paging shared by every list in the console: PAGE_SIZE rows at a time and a "more" control. Server-rendered lists
 * show pages 1..n cumulatively (?page=n), client lists fetch the next page with ?skip=. Both are bounded, so a
 * hand-made URL cannot ask the database for everything. No framework imports.
 */
export const PAGE_SIZE = 50;
/** The most pages a cumulative list shows at once (PAGE_SIZE x MAX_PAGES rows). */
export const MAX_PAGES = 20;
/** The furthest a ?skip= can reach. */
export const MAX_SKIP = 100_000;

/** ?page= -> 1..MAX_PAGES (anything else is 1). */
export function parsePage(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGES);
}

/** ?skip= -> 0..MAX_SKIP (anything else is 0). */
export function parseSkip(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, MAX_SKIP);
}

/** What a list answers: the rows shown, the total that match, and whether a "more" control is due. */
export type Paged<T> = { rows: T[]; total: number; page: number; hasMore: boolean };

/** The cumulative window for a page: rows 0..page x size. */
export function pageLimit(page: number, size = PAGE_SIZE): number {
  return parsePage(page) * size;
}

export function paged<T>(rows: T[], total: number, page: number): Paged<T> {
  return { rows, total, page, hasMore: rows.length < total && page < MAX_PAGES };
}

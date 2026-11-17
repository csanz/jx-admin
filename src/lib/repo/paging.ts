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

// ── NUMBERED PAGES (previous / next / "page n of m") ───────────────────────────────────────────────────────────────

/** What a numbered list answers: one page of rows, the total, the page shown and how many pages there are. */
export type NumberedPage<T> = { rows: T[]; total: number; page: number; pageCount: number; pageSize: number };

/** ?page= for a numbered list: 1.. (anything else is 1), never further than MAX_SKIP rows in. */
export function parsePageNumber(v: unknown, size: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.floor(MAX_SKIP / size) + 1);
}

/** How many pages `total` rows make (at least 1). */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** The page actually shown: the asked page, pulled back to the last page when it is past the end. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

/** The rows to skip for a page. */
export function pageSkip(page: number, size: number): number {
  return (Math.max(1, page) - 1) * size;
}

/**
 * Runs a numbered page: counts, clamps the page to the last one, then fetches that page. `fetch(skip, limit)` reads
 * the rows (already sorted by the caller).
 */
export async function numberedPage<T>(input: { page: unknown; size: number; count: () => Promise<number>; fetch: (skip: number, limit: number) => Promise<T[]> }): Promise<NumberedPage<T>> {
  const total = await input.count();
  const page = clampPage(parsePageNumber(input.page, input.size), total, input.size);
  const rows = total ? await input.fetch(pageSkip(page, input.size), input.size) : [];
  return { rows, total, page, pageCount: pageCount(total, input.size), pageSize: input.size };
}

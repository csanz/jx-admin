/**
 * The server pages' shared database step: run a repo call and turn an unreachable database (or a query error) into
 * a visible message instead of a blank 500. The page renders `LoadError` (src/components/LoadError.tsx) with it.
 */
import { isMongoUnavailable } from "./mongo.ts";

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

export const PAGE_DB_UNAVAILABLE = "the platform database could not be reached";
export const PAGE_DB_ERROR = "the database answered with an error";

export async function loadForPage<T>(what: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    if (isMongoUnavailable(e)) {
      console.warn(`[jx-admin] ${what}: database unavailable`);
      return { ok: false, message: PAGE_DB_UNAVAILABLE };
    }
    console.error(`[jx-admin] ${what}: ${(e as Error)?.message ?? e}`);
    return { ok: false, message: PAGE_DB_ERROR };
  }
}

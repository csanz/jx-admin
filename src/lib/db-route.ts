/**
 * The route handlers' shared database step: run a repo call and turn an unreachable database into a 504
 * `db-unavailable` JSON answer (never a blank 500), everything else into a logged 500 `db-error` without details.
 */
import { NextResponse } from "next/server";
import { isMongoUnavailable } from "./mongo.ts";
import { jsonError } from "./require-admin.ts";

export const DB_UNAVAILABLE_MESSAGE = "The platform database could not be reached. Try again in a moment.";

export async function withDb<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    if (isMongoUnavailable(e)) {
      console.warn(`[jx-admin] database unavailable: ${(e as Error)?.name ?? "error"}`);
      return { ok: false, res: jsonError("db-unavailable", 504, DB_UNAVAILABLE_MESSAGE) };
    }
    console.error(`[jx-admin] database error: ${(e as Error)?.message ?? e}`);
    return { ok: false, res: jsonError("db-error", 500, "The database answered with an error.") };
  }
}

export function jsonOk(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

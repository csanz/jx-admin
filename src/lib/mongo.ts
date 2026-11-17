/**
 * THE DATABASE CLIENT. The console reads and writes the platform database (the portal's, MONGODB_URI + MONGODB_DB,
 * default jx_portal) directly, with the official `mongodb` driver at the portal's major version. One client per
 * process, cached on globalThis so a serverless function (Vercel) and HMR reuse it; NEVER created at import time, so
 * `next build` and the pure tests run with no database. serverSelectionTimeoutMS is 5 s: an unreachable database
 * fails fast instead of hanging a request.
 *
 * Every query lives in src/lib/repo/*.ts (no framework imports); this module only hands out the Db.
 */
import { MongoClient, type Db } from "mongodb";
import { mongoIfSet, readEnv } from "./env.ts";

export const MONGO_SERVER_SELECTION_TIMEOUT_MS = 5000;

type Cache = { key: string; client: MongoClient; connected: Promise<MongoClient> };
const g = globalThis as typeof globalThis & { __jxAdminMongo?: Cache };

/** The client for a URI (cached per URI; a changed URI replaces it). Exported for the integration tests. */
export function mongoClientFor(uri: string): Promise<MongoClient> {
  const cur = g.__jxAdminMongo;
  if (cur && cur.key === uri) return cur.connected;
  if (cur) void cur.client.close().catch(() => undefined);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS });
  const connected = client.connect().catch((e: unknown) => {
    // A failed connect must not poison the cache: the next request tries again.
    if (g.__jxAdminMongo?.client === client) g.__jxAdminMongo = undefined;
    throw e;
  });
  g.__jxAdminMongo = { key: uri, client, connected };
  return connected;
}

/** The platform database from the validated config (throws EnvError when MONGODB_URI is missing). */
export async function mongoDb(): Promise<Db> {
  const env = readEnv();
  return (await mongoClientFor(env.mongoUri)).db(env.mongoDbName);
}

/** For /api/health: true when the configured database answers a ping within the timeout. Never throws. */
export async function mongoReachable(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const cfg = mongoIfSet(env);
  if (!cfg) return false;
  try {
    const client = await mongoClientFor(cfg.uri);
    await client.db(cfg.dbName).command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

/** True when the thrown error means the database could not be reached (as opposed to a query error). */
export function isMongoUnavailable(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  return name === "MongoServerSelectionError" || name === "MongoNetworkError" || name === "MongoNetworkTimeoutError" || name === "MongoTopologyClosedError";
}

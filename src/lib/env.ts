/**
 * Every environment variable the console reads, in one place. validateEnv is pure (testable); readEnv throws an
 * EnvError that lists the MISSING NAMES and never a value. Nothing here runs at import time, so `next build` works
 * without any env set: the gate and the portal client read the config per request.
 */

export const ENV_NAMES = [
  "AUTH_SECRET",
  "AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JX_DEVELOPER_EMAILS",
  "JX_PORTAL_URL",
  "JX_ADMIN_API_TOKEN",
] as const;

export type EnvName = (typeof ENV_NAMES)[number];
export type EnvLike = Record<string, string | undefined>;

export type AdminEnv = {
  authSecret: string;
  authUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  developerEmails: string;
  /** The portal origin without a trailing slash, e.g. https://play.jazaix.com */
  portalUrl: string;
  adminApiToken: string;
};

export class EnvError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`jx-admin is missing environment variables: ${missing.join(", ")}. See .env.example.`);
    this.name = "EnvError";
    this.missing = missing;
  }
}

function present(v: string | undefined): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** Pure: the config, or the list of missing names (never their values). */
export function validateEnv(env: EnvLike): { ok: true; config: AdminEnv } | { ok: false; missing: string[] } {
  const missing: string[] = ENV_NAMES.filter((n) => !present(env[n]));
  if (!present(env.JX_PORTAL_URL)) {
    /* already listed as missing */
  } else {
    try {
      new URL(env.JX_PORTAL_URL);
    } catch {
      missing.push("JX_PORTAL_URL (not a URL)");
    }
  }
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      authSecret: env.AUTH_SECRET!.trim(),
      authUrl: env.AUTH_URL!.trim(),
      googleClientId: env.GOOGLE_CLIENT_ID!.trim(),
      googleClientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      developerEmails: env.JX_DEVELOPER_EMAILS!,
      portalUrl: env.JX_PORTAL_URL!.trim().replace(/\/+$/, ""),
      adminApiToken: env.JX_ADMIN_API_TOKEN!.trim(),
    },
  };
}

/** The config, or an EnvError naming what is missing. */
export function readEnv(env: EnvLike = process.env): AdminEnv {
  const r = validateEnv(env);
  if (!r.ok) throw new EnvError(r.missing);
  return r.config;
}

/** The portal URL alone, when configured, for routes that must work without the full config (health). */
export function portalUrlIfSet(env: EnvLike = process.env): string | null {
  const v = env.JX_PORTAL_URL;
  if (!present(v)) return null;
  try {
    return new URL(v).origin;
  } catch {
    return null;
  }
}

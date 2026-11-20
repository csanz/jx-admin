/**
 * Every environment variable the console reads, in one place. validateEnv is pure (testable); readEnv throws an
 * EnvError that lists the MISSING NAMES and never a value. Nothing here runs at import time, so `next build` works
 * without any env set: the gate, the Mongo client and the portal link read the config per request.
 *
 * Required: the sign-in (AUTH_*, GOOGLE_*), the allowlist and the database (MONGODB_URI).
 * Optional: MONGODB_DB (default jx_portal); the portal link JX_PORTAL_URL + JX_ADMIN_API_TOKEN (both or neither;
 * only the two money actions, refund and hold, need it); RESEND_API_KEY + JX_EMAIL_FROM + JX_EMAIL_REPLY_TO (the
 * approval email; without the key, approving still works and the UI says no email went out); JX_CLIPS_API_URL (the
 * clips API, jx-replays: Content > Clips reads it; without it that page says clips are not connected).
 */

export const REQUIRED_ENV_NAMES = [
  "AUTH_SECRET",
  "AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "JX_DEVELOPER_EMAILS",
  "MONGODB_URI",
] as const;

export const OPTIONAL_ENV_NAMES = [
  "MONGODB_DB",
  "JX_PORTAL_URL",
  "JX_ADMIN_API_TOKEN",
  "RESEND_API_KEY",
  "JX_EMAIL_FROM",
  "JX_EMAIL_REPLY_TO",
  "JX_CLIPS_API_URL",
] as const;

export const ENV_NAMES = [...REQUIRED_ENV_NAMES, ...OPTIONAL_ENV_NAMES] as const;

export const DEFAULT_MONGODB_DB = "jx_portal";

export type EnvName = (typeof ENV_NAMES)[number];
export type EnvLike = Record<string, string | undefined>;

export type PortalLink = {
  /** The portal origin without a trailing slash, e.g. https://play.jazaix.com */
  url: string;
  token: string;
};

export type EmailConfig = {
  resendApiKey: string;
  /** "Jazaix <hello@updates.jazaix.com>" when JX_EMAIL_FROM is unset (the portal's default). */
  from: string;
  replyTo: string | null;
};

export type AdminEnv = {
  authSecret: string;
  authUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  developerEmails: string;
  mongoUri: string;
  mongoDbName: string;
  /** null = the two money actions (refund, hold) are disabled; everything else works on MongoDB alone. */
  portal: PortalLink | null;
  /** null = the approval email is not sent (the approval itself still happens). */
  email: EmailConfig | null;
  /** The clips API origin (jx-replays) without a trailing slash; null = Content > Clips says clips are not connected. */
  clipsApiUrl: string | null;
};

export const DEFAULT_EMAIL_FROM = "Jazaix <hello@updates.jazaix.com>";

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

function isMongoUri(v: string): boolean {
  return /^mongodb(\+srv)?:\/\/\S+$/.test(v.trim());
}

/** Pure: the config, or the list of missing (or malformed) names, never their values. */
export function validateEnv(env: EnvLike): { ok: true; config: AdminEnv } | { ok: false; missing: string[] } {
  const missing: string[] = REQUIRED_ENV_NAMES.filter((n) => !present(env[n]));
  if (present(env.MONGODB_URI) && !isMongoUri(env.MONGODB_URI)) missing.push("MONGODB_URI (not a mongodb:// or mongodb+srv:// URI)");

  // The portal link: both or neither. One without the other is a configuration slip, named here.
  const hasUrl = present(env.JX_PORTAL_URL);
  const hasToken = present(env.JX_ADMIN_API_TOKEN);
  if (hasUrl && !hasToken) missing.push("JX_ADMIN_API_TOKEN (JX_PORTAL_URL is set: both or neither)");
  if (hasToken && !hasUrl) missing.push("JX_PORTAL_URL (JX_ADMIN_API_TOKEN is set: both or neither)");
  let portalUrl: string | null = null;
  if (hasUrl) {
    try {
      portalUrl = new URL(env.JX_PORTAL_URL!.trim()).toString().replace(/\/+$/, "");
    } catch {
      missing.push("JX_PORTAL_URL (not a URL)");
    }
  }
  const clipsApiUrl = clipsApiUrlIfSet(env);
  if (present(env.JX_CLIPS_API_URL) && !clipsApiUrl) missing.push("JX_CLIPS_API_URL (not an http(s) URL)");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      authSecret: env.AUTH_SECRET!.trim(),
      authUrl: env.AUTH_URL!.trim(),
      googleClientId: env.GOOGLE_CLIENT_ID!.trim(),
      googleClientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      developerEmails: env.JX_DEVELOPER_EMAILS!,
      mongoUri: env.MONGODB_URI!.trim(),
      mongoDbName: present(env.MONGODB_DB) ? env.MONGODB_DB.trim() : DEFAULT_MONGODB_DB,
      portal: portalUrl && hasToken ? { url: portalUrl, token: env.JX_ADMIN_API_TOKEN!.trim() } : null,
      email: present(env.RESEND_API_KEY)
        ? {
            resendApiKey: env.RESEND_API_KEY.trim(),
            from: present(env.JX_EMAIL_FROM) ? env.JX_EMAIL_FROM.trim() : DEFAULT_EMAIL_FROM,
            replyTo: present(env.JX_EMAIL_REPLY_TO) ? env.JX_EMAIL_REPLY_TO.trim() : null,
          }
        : null,
      clipsApiUrl,
    },
  };
}

/** The clips API origin alone, when set and an http(s) URL (trailing slashes dropped), else null. */
export function clipsApiUrlIfSet(env: EnvLike = process.env): string | null {
  const v = env.JX_CLIPS_API_URL;
  if (!present(v)) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The config, or an EnvError naming what is missing. */
export function readEnv(env: EnvLike = process.env): AdminEnv {
  const r = validateEnv(env);
  if (!r.ok) throw new EnvError(r.missing);
  return r.config;
}

/** True when the portal link (JX_PORTAL_URL + JX_ADMIN_API_TOKEN) is configured: the money actions are available. */
export function portalLinked(env: EnvLike = process.env): boolean {
  return present(env.JX_PORTAL_URL) && present(env.JX_ADMIN_API_TOKEN);
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

/** The Mongo settings alone, when set, for routes that must work without the full config (health). */
export function mongoIfSet(env: EnvLike = process.env): { uri: string; dbName: string } | null {
  const v = env.MONGODB_URI;
  if (!present(v) || !isMongoUri(v)) return null;
  return { uri: v.trim(), dbName: present(env.MONGODB_DB) ? env.MONGODB_DB.trim() : DEFAULT_MONGODB_DB };
}

/**
 * EMAIL, the Resend transport and the approval template, ported from the portal (jx-portal src/lib/email.ts and
 * src/lib/waitlist-emails.ts, the "approved" kind). Plain fetch, no SDK. Config comes from src/lib/env.ts
 * (RESEND_API_KEY, JX_EMAIL_FROM, JX_EMAIL_REPLY_TO); no key = nothing is sent and callers get "not-configured".
 * Never throws and never logs the key or a body: a failed email must never fail the approval that sent it.
 * No framework imports; the tests inject fetch.
 */
import type { EmailConfig } from "./env.ts";

export type EmailMessage = { to: string; subject: string; text: string; html: string; idempotencyKey?: string };
export type EmailResult =
  | { status: "sent"; id: string }
  | { status: "not-configured" }
  | { status: "failed"; error: string };

export const RESEND_URL = "https://api.resend.com/emails";
export const EMAIL_TIMEOUT_MS = 8000;
/** Where the approval email's button points when the portal link is not configured. */
export const PORTAL_PUBLIC_URL = "https://play.jazaix.com";
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** The Resend request for a message: url, headers and JSON body (pure, so the tests can pin it). */
export function resendRequest(msg: EmailMessage, cfg: EmailConfig): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${cfg.resendApiKey}` };
  const body: Record<string, unknown> = { from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html };
  if (cfg.replyTo) body.reply_to = cfg.replyTo;
  // Resend drops a repeat of the same key for 24 h, so a retried approval never sends twice.
  if (msg.idempotencyKey) headers["idempotency-key"] = msg.idempotencyKey.slice(0, 256);
  return { url: RESEND_URL, headers, body };
}

export async function sendEmail(msg: EmailMessage, cfg: EmailConfig | null, doFetch: FetchLike = (u, i) => fetch(u, i)): Promise<EmailResult> {
  if (!cfg) return { status: "not-configured" };
  if (!EMAIL_RE.test(msg.to)) return { status: "failed", error: "invalid-recipient" };
  const req = resendRequest(msg, cfg);
  try {
    const res = await doFetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS) });
    const data = (await res.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
    if (res.ok && typeof data.id === "string") return { status: "sent", id: data.id };
    const why = typeof data.name === "string" ? data.name : `http-${res.status}`;
    console.warn(`[jx-admin] email not sent via resend: ${why} (status ${res.status})`);
    return { status: "failed", error: why };
  } catch (e) {
    const why = (e as Error)?.name === "TimeoutError" ? "timeout" : "network";
    console.warn(`[jx-admin] email not sent via resend: ${why}`);
    return { status: "failed", error: why };
  }
}

// ── THE "YOU'RE IN" TEMPLATE (the portal's approved email, word for word) ──────────────────────────────────────

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The first name for the greeting ("Hi Wanda,"), or "" (then just "Hi,"). Never more than 40 characters. */
export function firstName(name: string | null | undefined): string {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return first.replace(/[\r\n<>]/g, "").slice(0, 40);
}

function layout(heading: string, paragraphs: string[], cta?: { label: string; href: string }): string {
  const p = paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#c9ccd3">${t}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0b0c10">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<p style="margin:0 0 18px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7c818c">Jazaix</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#f4f5f7">${heading}</h1>${p}${button}
</div></body></html>`;
}

/** The approval email. `base` is the portal's public origin (the link the person signs in at). */
export function approvalEmail(user: { email: string; name?: string | null }, base: string = PORTAL_PUBLIC_URL): Omit<EmailMessage, "idempotencyKey"> {
  const first = firstName(user.name);
  const hi = first ? `Hi ${first},` : "Hi,";
  return {
    to: user.email,
    subject: "You're in: welcome to Jazaix",
    text: `${hi}\n\nGood news: you're off the waitlist. Sign in with the same account and the whole platform is open to you:\n\n${base}/\n\nSee you in a game.\nThe Jazaix team\n`,
    html: layout("You're in", [
      escapeHtml(hi),
      "Good news: you're off the waitlist. Sign in with the same account and the whole platform is open to you.",
    ], { label: "Open Jazaix", href: `${base}/` }).replace("</div></body>", `<p style="margin:18px 0 0;font-size:15px;color:#c9ccd3">See you in a game.<br>The Jazaix team</p></div></body>`),
  };
}

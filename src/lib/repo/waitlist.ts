/**
 * THE PORTAL WAITLIST, on the platform database directly. The model is the portal's (jx-portal src/lib/waitlist.ts,
 * owner 2026-11-13): one field on the user document, no second collection.
 *   users.access = "waitlist"  signed in, waiting
 *   users.access = "approved"  let in by an admin (approvedAt + approvedBy { id, email } say when and who)
 *   users.access absent        APPROVED (every account from before the waitlist; nothing is rewritten)
 * Admins, developers and bots always pass (the role decides for them), so they are never moved back.
 * Bots are never listed. The filters, sorts and updates below are the portal's, field for field, so the portal keeps
 * working against the rows this console writes. The approval email is the portal's too (src/lib/email.ts), recorded
 * on the user as waitlistEmails.approved = { at, status, id? | error? } exactly as the portal records it.
 * No framework imports: node runs this file in the tests.
 */
import { ObjectId, type Db } from "mongodb";
import { approvalEmail, type EmailMessage, type EmailResult } from "../email.ts";
import { recordAdminAction } from "./audit.ts";
import { OBJECT_ID_RE, USER_PROJECTION, regexEscape, roleOf, userView, type UserDoc, type UserView } from "./users.ts";

export type WaitlistAction = "approve" | "waitlist";
export type WaitlistStatus = "waitlist" | "approved";

export const WAITLIST_PAGE_SIZE = 100;
export const WAITLIST_QUERY_MAX = 80;

/** Roles the waitlist never holds back. */
export function waitlistBypass(role: string | null | undefined): boolean {
  return role === "admin" || role === "developer" || role === "bot";
}

/** POST body -> the action, or an error (the portal's parseJxWaitlistAction). */
export function parseWaitlistAction(body: unknown): { ok: true; userId: string; action: WaitlistAction } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { userId?: unknown; action?: unknown };
  if (typeof b.userId !== "string" || !OBJECT_ID_RE.test(b.userId)) return { ok: false, error: "invalid-user" };
  if (b.action !== "approve" && b.action !== "waitlist") return { ok: false, error: "invalid-action" };
  return { ok: true, userId: b.userId.toLowerCase(), action: b.action };
}

/** The update an admin's action writes. Approve stamps who and when; back to the waitlist clears that and restarts the wait. */
export function waitlistUpdate(action: WaitlistAction, admin: { id: string; email: string }, now: Date): Record<string, unknown> {
  if (action === "approve") {
    return { $set: { access: "approved", approvedAt: now, approvedBy: { id: admin.id, email: admin.email } } };
  }
  return { $set: { access: "waitlist", waitlistedAt: now }, $unset: { approvedAt: "", approvedBy: "" } };
}

/** ?status=&q= -> the Mongo filter on users. Bots are never listed. */
export function waitlistFilter(status: unknown, q: unknown): Record<string, unknown> {
  const filter: Record<string, unknown> = { role: { $ne: "bot" } };
  if (status === "approved") filter.access = { $ne: "waitlist" };
  else filter.access = "waitlist";
  const text = typeof q === "string" ? q.trim().slice(0, WAITLIST_QUERY_MAX) : "";
  if (text) {
    const re = { $regex: regexEscape(text), $options: "i" };
    filter.$or = [{ email: re }, { name: re }, { username: re }];
  }
  return filter;
}

/** The sort for a status: the waitlist newest first; approved, most recently approved first. */
export function waitlistSort(status: unknown): Record<string, 1 | -1> {
  return status === "approved" ? { approvedAt: -1, createdAt: -1 } : { waitlistedAt: -1, createdAt: -1 };
}

export type WaitlistCounts = { waiting: number; approved: number };

/** The two counts the portal's admin shows (bots excluded). */
export async function waitlistCounts(db: Db): Promise<WaitlistCounts> {
  const users = db.collection<UserDoc>("users");
  const [waiting, approved] = await Promise.all([
    users.countDocuments({ role: { $ne: "bot" }, access: "waitlist" }),
    users.countDocuments({ role: { $ne: "bot" }, access: { $ne: "waitlist" } }),
  ]);
  return { waiting, approved };
}

/** GET: { counts, users } (at most WAITLIST_PAGE_SIZE rows), the portal's answer. */
export async function listWaitlist(db: Db, status: unknown, q: unknown): Promise<{ counts: WaitlistCounts; users: UserView[] }> {
  const s: WaitlistStatus = status === "approved" ? "approved" : "waitlist";
  const users = db.collection<UserDoc>("users");
  const [counts, list] = await Promise.all([
    waitlistCounts(db),
    users.find(waitlistFilter(s, q), { projection: USER_PROJECTION }).sort(waitlistSort(s)).limit(WAITLIST_PAGE_SIZE).toArray(),
  ]);
  return { counts, users: list.map(userView) };
}

export type WaitlistRefusal = { ok: false; status: 404 | 409; error: string; message: string };
export type WaitlistActionResult = { ok: true; user: UserView; email: EmailResult["status"] | null } | WaitlistRefusal;

/** Records one waitlist email's outcome on the user, the portal's shape: waitlistEmails.<kind> = { at, status, id? | error? }. */
export async function recordWaitlistEmail(db: Db, userId: ObjectId, kind: "joined" | "approved", result: EmailResult, at: Date = new Date()): Promise<void> {
  const record = { at, status: result.status, ...(result.status === "sent" ? { id: result.id } : {}), ...(result.status === "failed" ? { error: result.error } : {}) };
  try {
    await db.collection<UserDoc>("users").updateOne({ _id: userId }, { $set: { [`waitlistEmails.${kind}`]: record } });
  } catch {
    /* the record is a convenience; the email outcome stands */
  }
}

export type SendEmailLike = (msg: EmailMessage) => Promise<EmailResult>;

/**
 * Approve or move back, the portal's semantics: approve acts only on someone still waiting (409 already-approved
 * otherwise, in the same atomic update, so two admins at once approve and email exactly once); admins, developers
 * and bots are never moved back (409 always-has-access). On approve the "You're in" email goes through `sendEmail`
 * (null when email is not configured: the approval stands and `email` answers "not-configured") and its outcome is
 * recorded on the user. Every success appends an admin_actions document.
 */
export async function applyWaitlistAction(
  db: Db,
  input: { userId: string; action: WaitlistAction; admin: { id: string; email: string }; sendEmail: SendEmailLike | null; portalBase?: string; now?: Date },
): Promise<WaitlistActionResult> {
  const users = db.collection<UserDoc>("users");
  const _id = new ObjectId(input.userId);
  const target = await users.findOne({ _id }, { projection: { role: 1 } });
  if (!target) return { ok: false, status: 404, error: "not-found", message: "No user with that id." };
  if (input.action === "waitlist" && waitlistBypass(roleOf(target))) {
    return { ok: false, status: 409, error: "always-has-access", message: "Admins, developers and bots always have access." };
  }
  const now = input.now ?? new Date();
  const filter = input.action === "approve" ? { _id, access: "waitlist" } : { _id };
  const updated = await users.findOneAndUpdate(filter, waitlistUpdate(input.action, input.admin, now), { returnDocument: "after", projection: USER_PROJECTION });
  if (!updated) return { ok: false, status: 409, error: "already-approved", message: "Already approved." };

  let email: EmailResult["status"] | null = null;
  if (input.action === "approve") {
    // Keyed by this approval's time: a retry of the same approval is dropped by Resend, a second approval later
    // (after a move back) sends again.
    const at = updated.approvedAt instanceof Date ? updated.approvedAt.getTime() : now.getTime();
    let result: EmailResult;
    if (!input.sendEmail) result = { status: "not-configured" };
    else {
      try {
        const to = typeof updated.email === "string" ? updated.email : "";
        result = await input.sendEmail({ ...approvalEmail({ email: to, name: typeof updated.name === "string" ? updated.name : "" }, input.portalBase), idempotencyKey: `waitlist-approved-${input.userId}-${at}` });
      } catch {
        result = { status: "failed", error: "internal" };
      }
    }
    await recordWaitlistEmail(db, _id, "approved", result, now);
    email = result.status;
  }
  await recordAdminAction(db, {
    actor: input.admin.email,
    action: input.action === "approve" ? "waitlist-approve" : "waitlist-move-back",
    target: input.userId,
    details: email ? { email } : undefined,
    at: now,
  });
  const fresh = (await users.findOne({ _id }, { projection: USER_PROJECTION })) ?? updated;
  return { ok: true, user: userView(fresh), email };
}

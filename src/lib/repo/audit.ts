/**
 * THE AUDIT TRAIL. Every write the console makes appends one document to `admin_actions`:
 *   { at, actor, action, target, via: "admin-console" } (+ details when the action has some, e.g. a role's from/to).
 * The portal's own rows carry only the portal's fields; who did what from here lives in this collection.
 * No framework imports.
 */
import type { Db } from "mongodb";
import { pageLimit, paged, parsePage, type Paged } from "./paging.ts";
import { displayValue, idString, isoOrNull, regexEscape, stringOr } from "./values.ts";

export const AUDIT_COLLECTION = "admin_actions";
export const AUDIT_VIA = "admin-console";

export type AdminAction = "waitlist-approve" | "waitlist-move-back" | "set-role" | "game-member";

export type AuditInput = {
  /** The signed-in admin's email. */
  actor: string;
  action: AdminAction;
  /** The user id (24-hex) the action was about. */
  target: string;
  details?: Record<string, unknown>;
  at?: Date;
};

export type AuditDoc = {
  at: Date;
  actor: string;
  action: AdminAction;
  target: string;
  via: typeof AUDIT_VIA;
  details?: Record<string, unknown>;
};

/** Pure: the document that is appended. */
export function auditDoc(input: AuditInput): AuditDoc {
  const doc: AuditDoc = { at: input.at ?? new Date(), actor: input.actor.trim().toLowerCase(), action: input.action, target: input.target, via: AUDIT_VIA };
  if (input.details && Object.keys(input.details).length) doc.details = input.details;
  return doc;
}

/** The one method the audit needs, so a fake collection works in the tests. */
export type AuditWriteLike = { insertOne(doc: AuditDoc): Promise<unknown> };

export async function appendAudit(col: AuditWriteLike, input: AuditInput): Promise<AuditDoc> {
  const doc = auditDoc(input);
  await col.insertOne(doc);
  return doc;
}

/** Appends the audit document to the platform database. */
export function recordAdminAction(db: Db, input: AuditInput): Promise<AuditDoc> {
  return appendAudit(db.collection<AuditDoc>(AUDIT_COLLECTION), input);
}

// ── THE AUDIT LIST (read side, /audit) ────────────────────────────────────────────────────────────────────────

export const AUDIT_PAGE_SIZE = 100;
export const AUDIT_ACTOR_MAX = 120;
/** The actions this console writes; the filter accepts these (other writers' actions show, unfiltered). */
export const AUDIT_ACTIONS: readonly AdminAction[] = ["waitlist-approve", "waitlist-move-back", "set-role", "game-member"];

export type AuditRow = { id: string; at: string | null; actor: string; action: string; target: string; via: string; details: string };
export type AuditFilterInput = { actor?: unknown; action?: unknown; page?: unknown };

/** Pure: ?actor= (case-insensitive substring of the email) and ?action= (one of AUDIT_ACTIONS) -> the filter. */
export function auditFilter(input: AuditFilterInput = {}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const actor = typeof input.actor === "string" ? input.actor.trim().slice(0, AUDIT_ACTOR_MAX) : "";
  if (actor) filter.actor = { $regex: regexEscape(actor), $options: "i" };
  if (typeof input.action === "string" && (AUDIT_ACTIONS as readonly string[]).includes(input.action)) filter.action = input.action;
  return filter;
}

export function auditRow(doc: Record<string, unknown>): AuditRow {
  return {
    id: idString(doc._id) ?? "",
    at: isoOrNull(doc.at),
    actor: stringOr(doc.actor),
    action: stringOr(doc.action),
    target: displayValue(doc.target),
    via: stringOr(doc.via),
    details: displayValue(doc.details),
  };
}

/** Newest first, AUDIT_PAGE_SIZE at a time, shown cumulatively (?page=n). */
export async function listAuditActions(db: Db, input: AuditFilterInput = {}): Promise<Paged<AuditRow> & { actor: string; action: string }> {
  const page = parsePage(input.page);
  const filter = auditFilter(input);
  const col = db.collection(AUDIT_COLLECTION);
  const [total, docs] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ at: -1, _id: -1 }).limit(pageLimit(page, AUDIT_PAGE_SIZE)).toArray(),
  ]);
  return {
    ...paged(docs.map(auditRow), total, page),
    actor: typeof filter.actor === "object" ? String(input.actor).trim().slice(0, AUDIT_ACTOR_MAX) : "",
    action: typeof filter.action === "string" ? filter.action : "",
  };
}

/** The newest `n` admin actions (the overview's "recent admin actions"). */
export async function recentAuditActions(db: Db, n = 10): Promise<AuditRow[]> {
  const docs = await db.collection(AUDIT_COLLECTION).find({}).sort({ at: -1, _id: -1 }).limit(Math.max(1, Math.min(n, 50))).toArray();
  return docs.map(auditRow);
}

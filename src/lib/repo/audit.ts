/**
 * THE AUDIT TRAIL. Every write the console makes appends one document to `admin_actions`:
 *   { at, actor, action, target, via: "admin-console" } (+ details when the action has some, e.g. a role's from/to).
 * The portal's own rows carry only the portal's fields; who did what from here lives in this collection.
 * No framework imports.
 */
import type { Db } from "mongodb";

export const AUDIT_COLLECTION = "admin_actions";
export const AUDIT_VIA = "admin-console";

export type AdminAction = "waitlist-approve" | "waitlist-move-back" | "set-role";

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

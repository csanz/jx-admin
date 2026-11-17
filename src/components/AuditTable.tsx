import Link from "next/link";
import { shortWhen } from "@/lib/format";
import type { AuditRow } from "@/lib/repo/audit";
import { BODY_ROW, HEAD_ROW, TableFrame, TD, TH } from "./ListBits";

/** The admin_actions rows as a table (the audit page and the overview's "recent admin actions"). */
export function AuditTable({ rows, empty }: { rows: AuditRow[]; empty: string }) {
  return (
    <TableFrame>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-[14%]`}>When</th>
          <th className={TH}>Actor</th>
          <th className={`${TH} w-[14%]`}>Action</th>
          <th className={TH}>Target</th>
          <th className={TH}>Details</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-8 text-center text-text-subtle">{empty}</td>
          </tr>
        )}
        {rows.map((a, i) => (
          <tr key={a.id || i} className={BODY_ROW}>
            <td className={`${TD} text-xs text-text-muted`}>{shortWhen(a.at)}</td>
            <td className={TD}>{a.actor || "n/a"}</td>
            <td className={`${TD} text-admin`}>{a.action || "n/a"}</td>
            <td className={`${TD} text-xs text-text-muted font-mono`}>
              {/^[a-f0-9]{24}$/i.test(a.target) ? <Link href={`/users/${a.target}`} className="text-admin hover:text-admin-hover no-underline">{a.target}</Link> : a.target}
            </td>
            <td className={`${TD} text-xs text-text-muted font-mono`}>
              {a.details}
              {a.via && a.via !== "admin-console" && <span className="block text-text-subtle">via {a.via}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

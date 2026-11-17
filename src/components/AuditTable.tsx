import { when } from "@/lib/format";
import type { AuditRow } from "@/lib/repo/audit";
import { BODY_ROW, HEAD_ROW, TableFrame, TD, TH } from "./ListBits";

/** The admin_actions rows as a table (the audit page and the overview's "recent admin actions"). */
export function AuditTable({ rows, empty }: { rows: AuditRow[]; empty: string }) {
  return (
    <TableFrame>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={TH}>When</th>
          <th className={TH}>Actor</th>
          <th className={TH}>Action</th>
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
            <td className={`${TD} text-text-muted whitespace-nowrap`}>{when(a.at)}</td>
            <td className={`${TD} break-all`}>{a.actor || "n/a"}</td>
            <td className={`${TD} whitespace-nowrap text-accent`}>{a.action || "n/a"}</td>
            <td className={`${TD} text-xs text-text-muted font-mono break-all`}>{a.target}</td>
            <td className={`${TD} text-xs text-text-muted font-mono break-all`}>
              {a.details}
              {a.via && a.via !== "admin-console" && <span className="block text-text-subtle">via {a.via}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

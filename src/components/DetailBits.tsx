import Link from "next/link";
import type { ReactNode } from "react";

/** Pieces the detail pages share: a titled section with a count note, a field, a user-id link. No hooks. */

export function Section({ title, note, children, right }: { title: string; note?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mt-8 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
        <h2 className="text-lg text-text font-semibold">{title}</h2>
        {note && <p className="text-xs text-text-subtle">{note}</p>}
        {right && <div className="ml-auto text-xs">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** "12 in all" or "200 newest of 1,204" for a capped list. */
export function cappedNote(count: number, shown: number, what = "newest"): string {
  return count > shown ? `${shown.toLocaleString()} ${what} of ${count.toLocaleString()}` : `${count.toLocaleString()} in all`;
}

/** Every field of a document as a definition list that wraps (never scrolls sideways). */
export function FieldList({ fields }: { fields: Array<[string, string]> }) {
  return (
    <dl className="bg-surface border border-border rounded-xl p-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] text-text-subtle font-mono">{k}</dt>
          <dd className="mt-0.5 text-sm text-text break-words [overflow-wrap:anywhere]">{v === "" ? <span className="text-text-subtle">(empty)</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A player or user id: a link to the user page when it is a 24-hex account id, plain text otherwise (guests). */
export function PlayerIdLink({ id }: { id: string }) {
  if (/^[a-f0-9]{24}$/i.test(id)) {
    return (
      <Link href={`/users/${id}`} className="block truncate font-mono text-[11px] text-admin hover:text-admin-hover no-underline" title={id}>
        {id}
      </Link>
    );
  }
  return <span className="block truncate font-mono text-[11px] text-text-subtle" title={id}>{id || "n/a"}</span>;
}

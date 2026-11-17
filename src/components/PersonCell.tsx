import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { avatarSrc } from "@/lib/avatar";

export type PersonLike = { id: string; name: string; username: string; email: string; image: string };

/** A person in a table cell: avatar + name (or @username / email), linking to the user page. Fits its column. */
export function PersonCell({ person, portalUrl, fallback = "unknown user" }: { person: PersonLike | null; portalUrl: string | null; fallback?: string }) {
  if (!person || !person.id) return <span className="text-text-subtle">{fallback}</span>;
  const label = person.name || (person.username ? `@${person.username}` : "") || person.email || person.id;
  const sub = person.username ? `@${person.username}` : person.email;
  return (
    <Link href={`/users/${person.id}`} className="flex items-center gap-2 min-w-0 no-underline group">
      <Avatar src={avatarSrc(person.image, portalUrl)} label={label} size={24} />
      <span className="min-w-0">
        <span className="block truncate text-text group-hover:text-admin" title={label}>{label}</span>
        {sub && sub !== label && <span className="block truncate text-[11px] text-text-subtle" title={sub}>{sub}</span>}
      </span>
    </Link>
  );
}

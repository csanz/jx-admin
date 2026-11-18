/**
 * THE RAIL GEOMETRY AND ICON, verbatim from the portal (jx-portal src/components/rail-row.ts and the Icon in
 * src/components/LeftRail.tsx). The owner (2026-11-17): the admin's left menu is the website's left menu, same size,
 * same colours, same icons, same place; only the logo colour differs. test/rail-parity.test.mjs compares these
 * strings with the portal's source when it is checked out next to this repo.
 */

// Every rail row shares one geometry so the collapsed strip lines up on a single centre line
// with one rhythm. Expanded: full-width row. Collapsed: 40px square.
export const railRow = (collapsed: boolean) =>
  collapsed
    ? "flex items-center justify-center w-10 h-10 mx-auto rounded-lg"
    : "flex items-center gap-3.5 w-full h-10 px-3 rounded-lg";

/** A rail row that is a link: the portal's active and resting colours. */
export const railLink = (collapsed: boolean, active: boolean) =>
  `${railRow(collapsed)} transition-colors ${active ? "bg-bg text-text" : "text-text-muted hover:text-text hover:bg-bg/60"}`;

export function RailIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

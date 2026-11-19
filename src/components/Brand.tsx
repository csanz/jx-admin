import Link from "next/link";

/**
 * THE JAZAIX MARK AND LOCKUP.
 *   JxMark   the portal's own logo (public/images/logo/logo-icon-dark.png, copied from jx-portal, the file its rail and
 *            header render) drawn through a CSS mask (.jx-mark in globals.css), so the shape is exactly the portal's
 *            and the fill is currentColor: the admin colour (owner 2026-11-17: the same logo, only the colour differs;
 *            owner 2026-11-18: "wrong logo" when it was a traced vector). The rail (SidebarFrame) draws it alone at
 *            h-8, exactly where the portal draws its logo.
 *   Brand    the lockup for the plain pages (sign-in): the mark at 24 px, the wordmark from the portal's horizontal
 *            logo (.jx-wordmark masks public/brand/jazaix-wordmark.png) in the text colour, and the ADMIN tag.
 * No hooks.
 */
export function JxMark({ className = "h-8 w-auto" }: { className?: string }) {
  return <span className={`jx-mark ${className}`} role="img" aria-label="Jazaix" />;
}

/** The lockup: mark (admin colour) + wordmark (text colour) + ADMIN (admin colour). A link home unless `plain`. */
export function Brand({ plain = false }: { plain?: boolean }) {
  const body = (
    <>
      <JxMark className="h-6 w-auto text-admin shrink-0" />
      <span className="jx-wordmark h-3.5 text-text" role="img" aria-label="Jazaix" />
      <span className="text-[11px] leading-none uppercase tracking-[0.16em] text-admin">Admin</span>
    </>
  );
  const cls = "flex items-center gap-2.5 no-underline";
  return plain ? <span className={cls}>{body}</span> : <Link href="/" className={cls} aria-label="Jazaix admin home">{body}</Link>;
}

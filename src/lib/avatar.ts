/**
 * Avatar sources, pure (no JSX). The portal stores `users.image` either as an absolute provider URL (Google) or as a
 * portal path (/api/images/u/<id>/<key>-512.webp, with `imageSmall` at 96 px). A portal path only loads from the
 * portal, so it is resolved against JX_PORTAL_URL when that is set; otherwise there is no source and the avatar shows
 * its fallback (the portal's own: the first letter on the surface colour, jx-portal FriendAvatar).
 */
export function avatarSrc(image: string | null | undefined, portalUrl: string | null | undefined): string | null {
  const v = typeof image === "string" ? image.trim() : "";
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return v;
  if (v.startsWith("/") && !v.startsWith("//") && portalUrl) return `${portalUrl.replace(/\/+$/, "")}${v}`;
  return null;
}

/** The fallback letter: the first letter of the name, username or email, upper-cased; "?" when there is none. */
export function initialOf(...labels: Array<string | null | undefined>): string {
  for (const l of labels) {
    const t = typeof l === "string" ? l.trim().replace(/^@/, "") : "";
    if (t) return Array.from(t)[0]!.toUpperCase();
  }
  return "?";
}

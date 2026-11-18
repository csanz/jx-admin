import Link from "next/link";

/**
 * THE JAZAIX LOCKUP, as the portal draws it (jx-portal LeftRail: the JX mark; 24 px here, the owner found 32 px too bulky for the admin), followed by the wordmark
 * from the portal's horizontal logo and the ADMIN tag. The mark is the portal's vector (public/brand/jx-mark-v2.svg,
 * the same path inline) with fill currentColor, so it takes the admin colour (the notice orange) in both themes; the
 * wordmark takes the text colour (.jx-wordmark in globals.css masks public/brand/jazaix-wordmark.png). No hooks: the
 * sidebar, the mobile strip and the sign-in page all use it.
 */
export const JX_MARK_PATH =
  "M880 939 l-128 -127 -127 126 -127 127 -111 -111 -112 -111 23 -23 22 -23 -23 -22 -22 -22 104 -104 c57 -58 104 -105 104 -105 0 -1 -19 -21 -42 -44 l-42 -42 -88 87 -87 87 -112 -111 -111 -112 22 -22 22 -23 -22 -23 -22 -22 103 -103 c69 -69 107 -106 114 -112 107 -85 255 -84 363 1 6 5 42 41 91 89 l81 81 137 -137 137 -137 111 111 112 111 -23 23 -22 23 23 22 22 22 -115 115 -114 115 105 105 105 106 -22 22 -22 23 22 23 22 22 -111 112 c-61 61 -112 111 -112 111 0 0 -58 -57 -128 -128z m197 -26 l69 -69 -128 -128 -128 -127 137 -138 137 -137 -69 -69 -68 -69 -138 137 -137 137 -103 -103 c-99 -99 -108 -106 -124 -118 -59 -39 -135 -48 -203 -24 -22 7 -49 22 -69 38 -4 4 -43 42 -87 86 l-80 80 68 69 69 69 73 -72 c47 -47 74 -74 77 -75 15 -9 36 -9 50 -1 2 1 46 44 97 96 l94 93 -127 127 -126 127 69 69 68 69 127 -127 127 -126 128 127 c70 71 128 128 128 128 0 0 31 -31 69 -69z";

export function JxMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1250 1068" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" transform="translate(0,1068) scale(1,-1)" d={JX_MARK_PATH} />
    </svg>
  );
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

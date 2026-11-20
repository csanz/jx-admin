"use client";

/**
 * A CLIP'S POSTER, never a broken image (the Avatar rule, owner 2026-11-17, for the clips list): the CDN picture
 * when there is one and it loads; without one, or when it fails (onError), a blank 16:9 surface box. `src` is an
 * http(s) URL already checked by src/lib/clips.ts (clipRow).
 */
import { useState } from "react";

export function Poster({ src, width = 112 }: { src: string | null; width?: number }) {
  const [failed, setFailed] = useState(false);
  const className = "block w-full aspect-video rounded-md object-cover bg-surface-light";
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={width} height={Math.round((width * 9) / 16)} style={{ maxWidth: width }} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    );
  }
  return <span style={{ maxWidth: width }} className={className} aria-hidden="true" />;
}

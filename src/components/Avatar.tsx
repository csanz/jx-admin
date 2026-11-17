"use client";

/**
 * THE USER AVATAR, never a broken image (owner 2026-11-17): the picture when there is one and it loads; when `src` is
 * missing, or the image fails (onError), the portal's own fallback (jx-portal FriendAvatar): the first letter on the
 * surface colour. `src` comes already resolved (src/lib/avatar.ts avatarSrc).
 */
import { useState } from "react";
import { initialOf } from "@/lib/avatar";

export function Avatar({ src, label, size = 32 }: { src: string | null; label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" style={style} className="rounded-full shrink-0 object-cover bg-surface-light" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    );
  }
  return (
    <span style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.42)) }} className="rounded-full shrink-0 bg-surface-light text-text-muted flex items-center justify-center font-sans" aria-hidden="true">
      {initialOf(label)}
    </span>
  );
}

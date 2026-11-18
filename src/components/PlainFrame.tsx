import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Brand, JxMark } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

/**
 * THE PAGE WITHOUT A RAIL: the rail's logo row (pt-6 pb-4 pl-6 pr-3, the mark at h-8) with the theme row at its right,
 * then the content. Used for everything that is NOT the admin console: /sign-in, the forbidden page a non-admin gets,
 * and the config error. Nothing in it links into the console, and it never renders the section tree.
 * `bare` (the forbidden page): the mark alone, no wordmark and no ADMIN tag, so the page says nothing about what
 * is behind it (owner 2026-11-17: "you don't give away too much information").
 */
export async function PlainFrame({ bare = false, children }: { bare?: boolean; children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  return (
    <>
      <div className="h-header pl-6 pr-3 flex items-center justify-between">
        {bare ? <JxMark className="h-8 w-auto text-admin" /> : <Brand plain />}
        <ThemeToggle initial={theme} collapsed />
      </div>
      <div className="px-4 sm:px-8">{children}</div>
    </>
  );
}

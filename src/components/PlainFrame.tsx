import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

/**
 * THE PAGE WITHOUT A SIDEBAR: a slim strip with the lockup and the theme toggle, then the content. Used for
 * everything that is NOT the admin console: /sign-in, the forbidden page a non-admin gets, and the config error.
 * Nothing in it links into the console, and it never renders the section tree.
 */
export async function PlainFrame({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  return (
    <>
      <div className="h-header px-4 sm:px-8 flex items-center justify-between border-b border-border-subtle">
        <Brand plain />
        <ThemeToggle initial={theme} />
      </div>
      <div className="px-4 sm:px-8">{children}</div>
    </>
  );
}

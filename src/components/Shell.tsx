import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { sessionEmail, signOut, SIGN_IN_PAGE } from "@/lib/auth";
import { SidebarFrame } from "./SidebarFrame";
import { ThemeToggle } from "./ThemeToggle";

/**
 * THE CONSOLE SHELL: the left sidebar (src/lib/nav.ts) and the content pane in the middle. Rendered once by
 * src/app/(console)/layout.tsx, so every page in the console sits inside it and no page can forget it. A server
 * component: it reads the session and the theme cookie and hands the account block (theme toggle, signed-in email,
 * Sign out) to the sidebar's bottom. The section links show only when someone is signed in; the gate on each page
 * still decides who sees the content.
 */
export async function Shell({ children }: { children: ReactNode }) {
  const [email, jar] = await Promise.all([sessionEmail(), cookies()]);
  const theme = jar.get("theme")?.value === "light" ? "light" : "dark";
  const footer = (
    <div className="space-y-2">
      {email && (
        <p className="text-xs text-text-subtle truncate" title={email}>
          {email}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle initial={theme} />
        {email && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: SIGN_IN_PAGE });
            }}
          >
            <button type="submit" className="px-2.5 py-1 text-xs text-text-muted border border-border rounded-md hover:text-text cursor-pointer">
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
  return (
    <SidebarFrame showNav={Boolean(email)} footer={footer}>
      {children}
    </SidebarFrame>
  );
}

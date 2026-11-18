import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { signOut, SIGN_IN_PAGE } from "@/lib/auth";
import { requireAdminPage } from "@/lib/require-admin";
import { ConfigError, Forbidden } from "./AdminGate";
import { PlainFrame } from "./PlainFrame";
import { SidebarFrame } from "./SidebarFrame";
import { ThemeToggle } from "./ThemeToggle";

/**
 * THE CONSOLE SHELL: the left sidebar (src/lib/nav.ts) and the content pane in the middle. Rendered once by
 * src/app/(console)/layout.tsx, so every page in the console sits inside it and no page can forget it.
 *
 * The shell runs the admin gate itself and ONLY AN ADMIN gets the sidebar and the page:
 *   signed out    -> /sign-in
 *   not an admin  -> the plain "Access forbidden" page (no sidebar, no section tree, the page is not rendered)
 *   config error  -> the plain config page (no sidebar)
 *   admin         -> sidebar + the page
 * Each page still renders through gatedPage (src/components/AdminGate.tsx), so a page can never show its content to
 * a non-admin even if it were mounted outside this shell; the decision is cached per request, so the shell and the
 * page share one database read.
 */
export async function Shell({ children }: { children: ReactNode }) {
  const g = await requireAdminPage();
  if (g.kind === "signed-out") redirect(SIGN_IN_PAGE);
  if (g.kind === "config-error") {
    return (
      <PlainFrame>
        <ConfigError missing={g.missing} />
      </PlainFrame>
    );
  }
  if (g.kind === "not-admin") {
    return (
      <PlainFrame>
        <Forbidden email={g.email} message={g.message} />
      </PlainFrame>
    );
  }

  const email = g.actor.email;
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  const footer = (
    <div className="space-y-2">
      <p className="text-xs text-text-subtle truncate" title={email}>
        {email}
      </p>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle initial={theme} />
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
      </div>
    </div>
  );
  return <SidebarFrame footer={footer}>{children}</SidebarFrame>;
}

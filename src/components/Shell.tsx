import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { signOut, SIGN_IN_PAGE } from "@/lib/auth";
import { requireAdminPage } from "@/lib/require-admin";
import { ConfigError, Forbidden } from "./AdminGate";
import { PlainFrame } from "./PlainFrame";
import { SidebarFrame } from "./SidebarFrame";

/**
 * THE CONSOLE SHELL: the left rail (src/components/SidebarFrame.tsx, the portal's rail with the tree from
 * src/lib/nav.ts) and the content beside it. Rendered once by src/app/(console)/layout.tsx, so every page in the
 * console sits inside it and no page can forget it.
 *
 * The shell runs the admin gate itself and ONLY AN ADMIN gets the rail and the page:
 *   signed out    -> /sign-in
 *   not an admin  -> the plain "Access forbidden" page (no rail, no tree, the page is not rendered, no admin wording)
 *   config error  -> the plain config page (no rail)
 *   admin         -> rail + the page
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
      <PlainFrame bare>
        <Forbidden />
      </PlainFrame>
    );
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: SIGN_IN_PAGE });
  }
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  const account = { label: g.actor.email, href: `/users/${g.actor.id}`, avatar: null };
  return (
    <SidebarFrame account={account} theme={theme} signOut={signOutAction}>
      {children}
    </SidebarFrame>
  );
}

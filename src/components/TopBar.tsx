import Link from "next/link";
import { sessionEmail, signOut, SIGN_IN_PAGE } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The console's only chrome: the Jazaix mark (text), "Admin", the section links, the signed-in email and Sign out.
 * A server component: it reads the session itself, so every page shares one bar and no page can forget it.
 */
export async function TopBar({ theme }: { theme: "dark" | "light" }) {
  const email = await sessionEmail();
  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-sm border-b border-border-subtle">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 h-12 flex items-center gap-3 sm:gap-5 min-w-0">
        <Link href="/" className="flex items-baseline gap-2 shrink-0 no-underline">
          <span className="font-sans font-bold text-text tracking-tight text-[17px]">Jazaix</span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-accent">Admin</span>
        </Link>
        {email && (
          <nav className="flex items-center gap-1 sm:gap-2 text-sm min-w-0 overflow-x-auto" aria-label="Sections">
            <Link href="/waitlist" className="px-2 py-1 rounded text-text-muted hover:text-text whitespace-nowrap">Waitlist</Link>
            <Link href="/users" className="px-2 py-1 rounded text-text-muted hover:text-text whitespace-nowrap">Users</Link>
            <Link href="/jbux" className="px-2 py-1 rounded text-text-muted hover:text-text whitespace-nowrap">JBux</Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
          <ThemeToggle initial={theme} />
          {email ? (
            <>
              <span className="hidden sm:inline text-xs text-text-subtle truncate max-w-[16rem]" title={email}>{email}</span>
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
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

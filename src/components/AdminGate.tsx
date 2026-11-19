import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PAGE } from "@/lib/auth";
import { requireAdminPage, type AdminActor } from "@/lib/require-admin";

/**
 * Every page renders through gatedPage: signed out -> /sign-in; not an admin -> the plain "Access forbidden" page;
 * config missing -> a plain "unavailable" page (the names go to the server log only); admin -> the page. The shell (src/components/Shell.tsx)
 * makes the same decision first and does not mount the page or the sidebar for a non-admin; this is the second lock.
 */
export async function gatedPage(render: (actor: AdminActor) => ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const g = await requireAdminPage();
  if (g.kind === "signed-out") redirect(SIGN_IN_PAGE);
  if (g.kind === "config-error") return <ConfigError />;
  if (g.kind === "not-admin") return <Forbidden />;
  return render(g.actor);
}

/** The public home a forbidden visitor is sent back to. */
export const HOME_URL = "https://jazaix.com";

/**
 * What a signed-in account that is not an admin sees (owner 2026-11-17): "Access forbidden" and a link back to the
 * home page, that is it. No admin wording, no reason, no email: the page gives nothing away about what is behind it.
 */
export function Forbidden() {
  return (
    <section className="max-w-md mx-auto mt-16">
      <h1 className="text-2xl text-text font-semibold">Access forbidden</h1>
      <p className="mt-4 text-sm">
        <a href={HOME_URL} className="text-text-muted hover:text-text">Back to jazaix.com</a>
      </p>
    </section>
  );
}

/**
 * What ANYONE sees while the console's configuration is incomplete (owner 2026-11-18, production screenshot: the page
 * listed a variable name to the world). Nothing about what is missing: the names go to the server log only (the gate
 * module logs the EnvError), where the person who can fix it reads them.
 */
export function ConfigError() {
  return (
    <section className="max-w-md mx-auto mt-16">
      <h1 className="text-2xl text-text font-semibold">The console is unavailable right now</h1>
      <p className="mt-4 text-sm">
        <a href={HOME_URL} className="text-text-muted hover:text-text">Back to jazaix.com</a>
      </p>
    </section>
  );
}

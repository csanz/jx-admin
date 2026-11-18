import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PAGE } from "@/lib/auth";
import { requireAdminPage, type AdminActor } from "@/lib/require-admin";

/**
 * Every page renders through gatedPage: signed out -> /sign-in; not an admin -> the plain "Access forbidden" page;
 * config missing -> the names (never values); admin -> the page. The shell (src/components/Shell.tsx)
 * makes the same decision first and does not mount the page or the sidebar for a non-admin; this is the second lock.
 */
export async function gatedPage(render: (actor: AdminActor) => ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const g = await requireAdminPage();
  if (g.kind === "signed-out") redirect(SIGN_IN_PAGE);
  if (g.kind === "config-error") return <ConfigError missing={g.missing} />;
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

export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <section className="max-w-md mx-auto mt-16 bg-surface border border-danger/50 rounded-xl p-6">
      <h1 className="text-xl text-text font-semibold">The console is not configured</h1>
      <p className="mt-2 text-sm text-text-muted">These environment variables are missing:</p>
      <ul className="mt-2 text-sm text-danger list-disc pl-5">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-subtle">See .env.example and the README&apos;s Vercel setup.</p>
    </section>
  );
}

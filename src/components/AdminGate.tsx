import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PAGE, signOut } from "@/lib/auth";
import { requireAdminPage, type AdminActor } from "@/lib/require-admin";

/**
 * Every page renders through gatedPage: signed out -> /sign-in; not an admin -> the plain "Not an admin" page with
 * Sign out; config missing -> the names (never values); admin -> the page.
 */
export async function gatedPage(render: (actor: AdminActor) => ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const g = await requireAdminPage();
  if (g.kind === "signed-out") redirect(SIGN_IN_PAGE);
  if (g.kind === "config-error") return <ConfigError missing={g.missing} />;
  if (g.kind === "not-admin") return <NotAdmin email={g.email} message={g.message} />;
  return render(g.actor);
}

export function NotAdmin({ email, message }: { email: string; message: string }) {
  return (
    <section className="max-w-md mx-auto mt-16 bg-surface border border-border rounded-xl p-6">
      <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
      <h1 className="text-2xl text-text font-semibold mt-1">Not an admin</h1>
      <p className="mt-3 text-sm text-text-muted">{message}</p>
      {email && <p className="mt-1 text-xs text-text-subtle break-all">Signed in as {email}</p>}
      <form
        className="mt-5"
        action={async () => {
          "use server";
          await signOut({ redirectTo: SIGN_IN_PAGE });
        }}
      >
        <button type="submit" className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:text-text cursor-pointer">
          Sign out
        </button>
      </form>
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

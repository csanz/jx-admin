import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { sessionEmail, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const ERROR_TEXT: Record<string, string> = {
  Configuration: "The sign-in is not configured yet (check AUTH_SECRET, AUTH_URL and the Google client).",
  AccessDenied: "Google did not sign you in.",
  OAuthCallbackError: "Google sent back an error. Try again.",
  OAuthAccountNotLinked: "That account cannot be used here.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  if (await sessionEmail()) redirect("/");
  const { error } = await searchParams;
  const errorText = error ? ERROR_TEXT[error] ?? "Sign-in failed. Try again." : null;
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  // The only page outside the console shell: a slim strip with the mark and the theme toggle, then the card.
  return (
    <>
    <div className="h-12 px-4 sm:px-8 flex items-center justify-between border-b border-border-subtle">
      <span className="flex items-baseline gap-2">
        <span className="font-sans font-bold text-text tracking-tight text-[17px]">Jazaix</span>
        <span className="text-[11px] uppercase tracking-[0.16em] text-accent">Admin</span>
      </span>
      <ThemeToggle initial={theme} />
    </div>
    <section className="max-w-md mx-auto mt-16 bg-surface border border-border rounded-xl p-6">
      <p className="text-[11px] text-text-subtle uppercase tracking-[0.16em]">Jazaix admin</p>
      <h1 className="text-2xl text-text font-semibold mt-1">Sign in</h1>
      <p className="mt-3 text-sm text-text-muted">Admins only. Use the Google account that is on the admin list.</p>
      {errorText && <p role="alert" className="mt-3 text-sm text-danger">{errorText}</p>}
      <form
        className="mt-5"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit" className="w-full px-3 py-2 text-sm font-semibold bg-accent text-accent-ink rounded-md hover:bg-accent-hover cursor-pointer">
          Continue with Google
        </button>
      </form>
    </section>
    </>
  );
}

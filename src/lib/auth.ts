/**
 * Auth.js (next-auth v5): Google only, JWT sessions, no adapter, no database. Signing in proves an email; whether
 * that email is an ADMIN is decided per request by src/lib/require-admin.ts (allowlist + the portal's role check).
 * Env is read lazily through process.env here so `next build` runs with nothing set; the gate validates the full
 * config (src/lib/env.ts) on the first request.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const SIGN_IN_PAGE = "/sign-in";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: SIGN_IN_PAGE, error: SIGN_IN_PAGE },
  trustHost: true,
  callbacks: {
    // Only the email is kept on the token; nothing else from Google is needed.
    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.email === "string") session.user.email = token.email;
      return session;
    },
  },
});

/** The signed-in email (lowercased), or null. */
export async function sessionEmail(): Promise<string | null> {
  const s = await auth();
  const e = s?.user?.email;
  return typeof e === "string" && e.includes("@") ? e.trim().toLowerCase() : null;
}

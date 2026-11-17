import { Shell } from "@/components/Shell";

/**
 * Every console page lives under this route group, so every page renders inside the shell (sidebar + content).
 * Only /sign-in sits outside it. test/shell-layout.test.mjs pins this.
 */
export default function ConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Shell>{children}</Shell>;
}

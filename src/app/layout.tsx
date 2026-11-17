import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Jazaix Admin", template: "%s · Jazaix Admin" },
  description: "The Jazaix admin console.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

// The layout reads the theme cookie and the session (TopBar), so it renders per request.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme comes from a cookie so the server already knows which tokens to render: no flash, no mismatch.
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body className={`${geist.variable} ${jetbrainsMono.variable} font-mono antialiased min-h-screen bg-bg text-text`}>
        <TopBar theme={theme} />
        <main className="px-4 py-6 sm:px-8">
          <div className="max-w-5xl mx-auto">{children}</div>
        </main>
      </body>
    </html>
  );
}

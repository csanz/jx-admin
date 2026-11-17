import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Jazaix Admin", template: "%s · Jazaix Admin" },
  description: "The Jazaix admin console.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // The Jazaix mark in ORANGE (the brand's secondary accent), so an admin tab never looks like the portal's black one.
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

// The layout reads the theme cookie, so it renders per request.
export const dynamic = "force-dynamic";

/**
 * The document only (fonts, theme, metadata). The console chrome (sidebar + content pane) is the (console) route
 * group's layout, so /sign-in stays a plain page.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme comes from a cookie so the server already knows which tokens to render: no flash, no mismatch.
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body className={`${geist.variable} ${jetbrainsMono.variable} font-mono antialiased min-h-screen bg-bg text-text`}>{children}</body>
    </html>
  );
}

import type { NextConfig } from "next";

/**
 * Security headers on every response. The console is never framed (frame-ancestors none), browsers never sniff
 * types, referrers stay on this origin, and search engines never index it (the pages repeat noindex in metadata).
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The waitlist moved under Users in the sidebar; old links keep working (the query string is carried over).
  async redirects() {
    return [
      { source: "/waitlist", destination: "/users/waitlist", permanent: true },
      // the Assets section has one item so far
      { source: "/assets", destination: "/assets/catalog", permanent: false },
    ];
  },
};

export default nextConfig;

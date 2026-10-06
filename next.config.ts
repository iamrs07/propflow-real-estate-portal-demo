import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Listing photographs arrive through a server action; the Storage bucket
      // allows 10 MB, so the action ceiling is set to match.
      bodySizeLimit: "10mb",
    },
  },
  images: {
    /*
     * Listing imagery is served by the same-origin /listing-image route, which
     * authorizes each request, so there is no remote host to allow and nothing
     * for remotePatterns to keep in sync. Passing images through untouched keeps
     * the build independent of the deploy-time Storage hostname while still
     * using next/image for intrinsic sizing and lazy loading.
     */
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

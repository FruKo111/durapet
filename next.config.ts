import type { NextConfig } from "next";

/**
 * Plan B (aynı domain): tarayıcı /api/... (örn. /api/v1/...) çağırır;
 * Next sunucusu bunu arka plandaki Express'e iletir (CORS gerekmez).
 * Üretimde API_PROXY_TARGET zorunlu (örn. http://127.0.0.1:4000). Geliştirmede boşsa 127.0.0.1:4000 kullanılır.
 */
const apiProxyKokRaw = (process.env.API_PROXY_TARGET || process.env.INTERNAL_API_URL || "").trim();
const apiProxyKok =
  apiProxyKokRaw.replace(/\/+$/, "") ||
  (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:4000" : "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  poweredByHeader: false,
  async rewrites() {
    if (!apiProxyKok) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyKok}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;


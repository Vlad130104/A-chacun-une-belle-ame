/** En-têtes de sécurité appliqués à toutes les réponses. */
const CSP = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' : nécessaire au moteur de voix et à l'encodeur (WebAssembly), sans autoriser eval()
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data: https://images.pexels.com",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' https://videos.pexels.com",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  // Sur Vercel tout est en HTTPS ; en local (http://localhost) cette règle casserait les formulaires.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Isolation : permet au moteur de voix d'utiliser plusieurs cœurs (SharedArrayBuffer)
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages et API : jamais en cache, pour qu'une page protégée ne reste pas dans un cache partagé.
      { source: "/:path((?!fonts/|voices/|vendor/).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Voix et moteurs : fichiers lourds et immuables, gardés par le navigateur de l'utilisateur seulement
      { source: "/:dir(voices|vendor)/:path*", headers: [{ key: "Cache-Control", value: "private, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;

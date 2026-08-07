/**
 * Back-office — application distincte, domaine distinct, cookies distincts (ADR-014).
 * Une XSS sur le site public ne doit pas pouvoir atteindre une session administrateur.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@acuba/contracts'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Le back-office ne doit jamais être indexé ni mis en cache.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

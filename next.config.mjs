/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // The account navigation uses the plural route; keep the singular URL that
  // customers sometimes type/browse to from landing on a 404.
  async redirects() {
    return [
      {
        source: '/account/address',
        destination: '/account/addresses',
        permanent: false,
      },
    ];
  },
  // Conservative hardening headers. No CSP is set here: the app relies on an
  // inline theme script/style and Next.js inline bootstrap scripts, so a strict
  // policy needs a nonce-based setup and should be introduced deliberately.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Cache Components (the Next.js 16.4 default): nothing is cached unless a
  // function says 'use cache'. Every page that reads the session cookie
  // does so inside <Suspense>, so the rest of the page can still be sent
  // straight away.
  cacheComponents: true,
  partialPrefetching: true,

  // SECURITY HEADERS, sent with every response.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // CLICKJACKING: no other site may show our pages in a frame. Otherwise
          // a page could lay the real login or "delete account" button under
          // an invisible frame and trick you into clicking it.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Browsers must trust our Content-Type and never "guess" that a
          // text response is a script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Other sites we link to learn only our domain, never the full URL.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // This app never needs these, so no script on it can ask for them.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
      {
        // Pages whose URL contains a secret token: send NO Referer at all, so
        // the token can't leak to another site if a link on the page is
        // followed. (Matching later, this replaces the policy above.)
        source: '/(reset-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },

  turbopack: {
    // Pin the project root: there is an unrelated package-lock.json higher up
    // in the home folder that Turbopack would otherwise consider.
    root: __dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig

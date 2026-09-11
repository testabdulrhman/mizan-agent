import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // إخراج مستقل لبناء صورة Docker خفيفة.
  output: 'standalone',
  // pdf-parse / mammoth / playwright must stay on the Node runtime and never be
  // bundled into the client. serverExternalPackages keeps them as real requires.
  serverExternalPackages: ['pdf-parse', 'mammoth', 'playwright'],
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

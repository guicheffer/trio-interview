import type { NextConfig } from 'next';

const config: NextConfig = {
  // Production-like: no dev toolbar, no error overlays
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        // Preview route: serves candidate's exercise files as static assets
        source: '/preview/:path*',
        destination: 'http://localhost:3001/preview/:path*',
      },
    ];
  },
};

export default config;

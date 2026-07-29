import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['got-scraping', 'header-generator'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'jobagenthq.com',
          },
        ],
        destination: 'https://www.jobagenthq.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;


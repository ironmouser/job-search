import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['got-scraping', 'header-generator'],
  env: {
    NEXT_PUBLIC_AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME || '',
    NEXT_PUBLIC_AWS_REGION: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'upload.wikimedia.org', // Wikimedia Commons
      'commons.wikimedia.org'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.wikimedia.org',
      },
    ],
  },
  // Optimize production builds
  productionBrowserSourceMaps: false,
  // Environment variables
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

module.exports = nextConfig;


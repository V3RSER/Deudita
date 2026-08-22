import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  allowedDevOrigins: [
    'ais-dev-a5n627k2pa3bqyowz4rurd-535048014345.us-east1.run.app',
    'ais-pre-a5n627k2pa3bqyowz4rurd-535048014345.us-east1.run.app',
    '*.us-east1.run.app',
    '*.run.app',
    'localhost:3000',
  ],
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // Suppress non-critical webpack cache serialization warnings
    config.infrastructureLogging = {
      level: 'error',
    };

    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;

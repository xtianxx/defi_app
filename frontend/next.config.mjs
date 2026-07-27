/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ethers v6 + Buffer for some legacy paths
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
  // SC-004: portfolio read-heavy — allow route handlers to opt into caching.
  experimental: {
    typedRoutes: true,
  },
  // Transpile shadcn primitives in /src/components/ui
  transpilePackages: [],
};

export default nextConfig;

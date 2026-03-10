/** @type {import('next').NextConfig} */
const rawBasePath = process.env.PAGES_BASE_PATH || '';
const normalizedBasePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: normalizedBasePath,
  assetPrefix: normalizedBasePath || undefined,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

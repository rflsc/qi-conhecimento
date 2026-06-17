/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@qi-conhecimento/api-client',
    '@qi-conhecimento/shared-types',
    '@qi-conhecimento/shared-validators',
  ],
};

module.exports = nextConfig;

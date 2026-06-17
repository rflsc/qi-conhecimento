const path = require('path');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(path.join(__dirname, '../..'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@qi-conhecimento/api-client',
    '@qi-conhecimento/shared-types',
    '@qi-conhecimento/shared-validators',
    '@qi-conhecimento/shared-utils',
  ],
};

module.exports = nextConfig;

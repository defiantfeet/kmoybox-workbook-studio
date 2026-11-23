import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.STUDIO_TEST_BUILD === '1' ? '.next-test' : '.next',
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default config;

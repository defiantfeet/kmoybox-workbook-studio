import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.STUDIO_TEST_BUILD === '1' ? '.next-test' : '.next',
  devIndicators: false,
};

export default config;

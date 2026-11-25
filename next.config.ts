import type { NextConfig } from 'next';
import { studioBasePath } from './lib/studio-path';

if (studioBasePath !== '' && studioBasePath !== '/studio') {
  throw new Error("NEXT_PUBLIC_STUDIO_BASE_PATH must be empty or '/studio'.");
}

const build = process.env.STUDIO_TEST_BUILD;
const config: NextConfig = {
  basePath: studioBasePath,
  distDir: build === '1' ? '.next-test' : build === 'auth' ? '.next-auth-test' : build === 'staging' ? '.next-staging' : '.next',
  devIndicators: false,
  // Development logs can include private responses and one-time authentication links.
  logging: { serverFunctions: false, incomingRequests: false },
  allowedDevOrigins: ['127.0.0.1'],
};

export default config;

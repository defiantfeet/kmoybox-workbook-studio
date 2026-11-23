import { studioBasePath } from '../studio-path';

export const authCookieOptions = {
  path: studioBasePath || '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production' || process.env.STUDIO_SITE_URL?.startsWith('https://') === true,
};

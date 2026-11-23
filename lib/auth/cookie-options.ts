export const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production' || process.env.STUDIO_SITE_URL?.startsWith('https://') === true,
};

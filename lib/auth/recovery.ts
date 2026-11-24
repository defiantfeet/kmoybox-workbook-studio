import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { studioPath } from '../studio-path';
import { authCookieOptions } from './cookie-options';

const cookie = 'studio-recovery';
const maxAge = 15 * 60;

export function authURL(path: string) {
  const configured = process.env.STUDIO_SITE_URL;
  if (!configured && process.env.NODE_ENV === 'production') return null;
  try {
    const url = new URL(configured || 'http://localhost:3000');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (local && (process.env.VERCEL === '1' || process.env.VERCEL_ENV))) return null;
    return new URL(studioPath(path), url.origin);
  } catch {
    return null;
  }
}

export function authRedirect(path: string) {
  return new Response(null, {
    status: 307,
    headers: { Location: studioPath(path), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

function signature(value: string) {
  const secret = process.env.STUDIO_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function recoveryConfigured() {
  return signature('studio-recovery') !== null;
}

export async function allowRecovery(userId: string, sessionId: string) {
  const expires = Math.floor(Date.now() / 1000) + maxAge;
  const payload = [userId, sessionId, expires].join('.');
  const digest = signature(payload);
  if (!digest) return false;
  (await cookies()).set(cookie, payload + '.' + digest, {
    ...authCookieOptions, maxAge,
  });
  return true;
}

export async function recoveryAllowed(userId: string, sessionId: string) {
  const raw = (await cookies()).get(cookie)?.value;
  if (!raw) return false;
  const [owner, session, expires, digest, extra] = raw.split('.');
  if (extra !== undefined || owner !== userId || session !== sessionId || !/^\d+$/.test(expires ?? '')
    || Number(expires) <= Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(digest ?? '')) return false;
  const expected = signature([owner, session, expires].join('.'));
  return !!expected && timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(expected, 'hex'));
}

export async function clearRecovery() {
  (await cookies()).set(cookie, '', { ...authCookieOptions, maxAge: 0 });
}

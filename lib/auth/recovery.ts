import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { authCookieOptions } from './cookie-options';

const cookie = 'studio-recovery';
const maxAge = 15 * 60;

export function authOrigin() {
  return new URL(process.env.STUDIO_SITE_URL || 'http://localhost:3000').origin;
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
    ...authCookieOptions, path: '/', maxAge,
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
  (await cookies()).delete(cookie);
}

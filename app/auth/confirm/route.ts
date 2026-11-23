import { NextRequest, NextResponse } from 'next/server';
import { authOrigin, clearRecovery } from '../../../lib/auth/recovery';
import { demo, supabase } from '../../../lib/session';

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const client = demo ? null : await supabase(true);
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (token_hash && token_hash.length <= 400 && client) {
    const { error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
    if (!error) {
      await clearRecovery();
      return NextResponse.redirect(new URL('/', authOrigin()), { headers });
    }
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', authOrigin()), { headers });
}

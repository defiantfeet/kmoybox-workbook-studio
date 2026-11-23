import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/session';

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const client = await supabase(true);
  if (token_hash && client) {
    const { error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
    if (!error) return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', request.url));
}

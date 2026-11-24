import { NextRequest } from 'next/server';
import { authRedirect, clearRecovery } from '../../../lib/auth/recovery';
import { demo, supabase } from '../../../lib/session';

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const client = demo ? null : await supabase(true);
  if (token_hash && token_hash.length <= 400 && client) {
    const { error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
    if (!error) {
      await clearRecovery();
      return authRedirect('/');
    }
  }
  return authRedirect('/login?confirmation=failed');
}

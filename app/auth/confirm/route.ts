import { NextRequest } from 'next/server';
import { emailLinkPage, emailToken, submittedEmailToken } from '../../../lib/auth/email-link';
import { authRedirect, clearRecovery } from '../../../lib/auth/recovery';
import { demo, supabase } from '../../../lib/session';

export async function GET(request: NextRequest) {
  return emailLinkPage('/auth/confirm', emailToken(request.nextUrl.searchParams.get('token_hash')),
    'Confirm your email', 'Confirm email', '/login?confirmation=failed');
}

export async function POST(request: Request) {
  const token_hash = await submittedEmailToken(request);
  const client = demo ? null : await supabase(true);
  if (token_hash && client) {
    const { error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
    if (!error) {
      await clearRecovery();
      return authRedirect('/', 303);
    }
  }
  return authRedirect('/login?confirmation=failed', 303);
}

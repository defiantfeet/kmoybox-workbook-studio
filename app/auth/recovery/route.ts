import { NextRequest } from 'next/server';
import { emailLinkPage, emailToken, submittedEmailToken } from '../../../lib/auth/email-link';
import { allowRecovery, authRedirect, clearRecovery, recoveryConfigured } from '../../../lib/auth/recovery';
import { demo, supabase } from '../../../lib/session';

export async function GET(request: NextRequest) {
  return emailLinkPage('/auth/recovery', emailToken(request.nextUrl.searchParams.get('token_hash')),
    'Reset your password', 'Continue to password reset', '/forgot-password?expired=1');
}

export async function POST(request: Request) {
  const token_hash = await submittedEmailToken(request);
  let destination = '/forgot-password?expired=1';
  const client = demo ? null : await supabase(true);
  if (client && recoveryConfigured() && token_hash) {
    await clearRecovery();
    const verified = await client.auth.verifyOtp({ token_hash, type: 'recovery' });
    if (!verified.error && verified.data.user && verified.data.session) {
      const { data } = await client.auth.getClaims(verified.data.session.access_token);
      const sessionId = data?.claims.session_id;
      if (typeof sessionId === 'string' && await allowRecovery(verified.data.user.id, sessionId)) {
        destination = '/reset-password';
      } else {
        await client.auth.signOut({ scope: 'local' });
      }
    }
  }
  return authRedirect(destination, 303);
}

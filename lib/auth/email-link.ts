import { studioPath } from '../studio-path';
import { authRedirect, authURL } from './recovery';

export function emailToken(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,400}$/.test(value) ? value : null;
}

export function emailLinkPage(path: string, token: string | null, title: string, button: string, fallback: string) {
  if (!token) return authRedirect(fallback);
  return new Response(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · KMOYBOX Workbook Studio</title>
<style>
body { background: #f8edeb; color: #292421; font: 1rem system-ui, sans-serif; margin: 0; padding: 12vh 1rem 2rem; }
main { background: #fffaf5; border-radius: 1rem; max-width: 28rem; margin: auto; padding: 2rem; }
h1 { font: 2rem Georgia, serif; }
button { background: #303547; color: white; font: inherit; padding: .75rem 1rem; border: 0; border-radius: .5rem; cursor: pointer; }
</style>
<main>
  <p>KMOYBOX WORKBOOK STUDIO</p>
  <h1>${title}</h1>
  <form method="post" action="${studioPath(path)}">
    <input type="hidden" name="token_hash" value="${token}">
    <button type="submit">${button}</button>
  </form>
</main>
</html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function submittedEmailToken(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  if (site !== 'same-origin' && (site || !origin || origin !== authURL('/')?.origin)) return null;
  if (origin && origin !== 'null' && origin !== authURL('/')?.origin) return null;
  try {
    return emailToken((await request.formData()).get('token_hash'));
  } catch {
    return null;
  }
}

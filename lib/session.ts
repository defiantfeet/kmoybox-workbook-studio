import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const demo = process.env.NODE_ENV === 'development' && process.env.STUDIO_DEMO === '1';

export async function supabase(writable = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        if (writable) values.forEach(({ name, value, options }) => jar.set(name, value, options));
      },
    },
  });
}

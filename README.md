# KMOYBOX Workbook Studio

A private growth studio for Keep Me Out of Your Box. Members can work through guided exercises, keep a journal, set goals, track completion, and revisit purchased digital workbooks.

## Local development

Use Node.js 24, npm, a running Docker engine, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). The local setup was checked with CLI v2.80.0.

```sh
npm ci
supabase start
cp .env.example .env.local
```

Copy the local publishable key from `supabase status` into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and check that the API URL matches. Keep `.env.local` outside Git. The app uses only the publishable key and the signed-in user's session.

Run `npm run dev` and open http://localhost:3000. Register with an email and password and open the email confirmation link in the local email inbox reported by Supabase, usually http://127.0.0.1:54324. The starter workbook is available after sign-in. To test a purchase, use the local SQL editor or a trusted database session to grant a catalog item to your local user.

```sql
insert into public.entitlements (user_id, product_slug)
select id, 'the-boundaries-edit' from auth.users where email = 'your-local-test-email@example.com'
on conflict do nothing;
```

The product library uses these entitlements. A checkout or external store integration is outside this development implementation. The workbooks in the seed catalog are sample editorial content.

For a credential-free preview, run `STUDIO_DEMO=1 npm run dev`. The preview uses sample content and small, browser-scoped cookies. Use fictitious text in this mode.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run test:db
```

Browser tests start an isolated sample server. Database tests run on the local Supabase stack and check privacy and product access with two users. The [development plan](DEVELOPMENT.md) records schema, routes, and acceptance criteria.

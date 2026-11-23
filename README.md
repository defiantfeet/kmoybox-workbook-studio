# KMOYBOX Workbook Studio

A private growth studio for Keep Me Out of Your Box. Members can work through guided exercises, keep a journal, set goals, track completion, and revisit purchased digital workbooks.

## Local development

Use Node.js 24, npm, a running Docker engine, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). The local configuration targets CLI v2.80.0.

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

For a credential-free preview, run `STUDIO_DEMO=1 npm run dev`. Open http://localhost:3000 to explore the labeled sample dashboard. Sample workbook, journal, and goal edits use browser-scoped cookies. The daily prompt and weekly goal date range use Pacific time. Use fictitious text in this mode.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run test:db
```

Browser tests start an isolated sample server. Database tests run on the local Supabase stack and check privacy and product access with two users. The [development plan](DEVELOPMENT.md) records schema, routes, and acceptance criteria.

## Author interactive workbooks

Open **Workbooks** and choose **The Dancer Mindset** for the original demonstration. The reader resumes the latest unfinished module with saved responses, or opens the first unfinished module. Saving responses can leave exercises blank. Completing a module requires answers to every exercise. **Download my responses (PDF)** exports the signed-in reader’s saved answers and module status.

From **Account → Workbook content editor**, create a workbook, choose **New module**, enter a chapter and its order, and add lesson and exercise blocks using the form. Blocks can be reordered, and multiple-choice options can be added or removed. **Preview module** renders the current form. **Save draft** keeps changes in the editor. **Publish saved draft** makes that module visible to signed-in learners independently of its other modules. Publishing a revision preserves responses with matching exercise IDs. Readers review the revised module and complete it again.

The demo editor is enabled by `STUDIO_DEMO=1` and uses browser-isolated, local SQLite data. In an authenticated local Supabase workspace, apply the migrations and grant an existing account editor access from a trusted SQL session.

```sql
insert into public.workbook_editor_accounts (user_id)
select id from auth.users where email = 'your-local-test-email@example.com'
on conflict do nothing;
```

The [demo content file](content/the-dancer-mindset.json) documents format version 1. Workbook metadata contains a title, description, and URL slug. Each module has a chapter title, chapter order, module order, and ordered blocks with stable UUIDs. Each block has a type and the corresponding lesson, prompt, choices, or range labels. Reuse a chapter title and its order to group modules together. The editor generates and retains the IDs automatically, so adding a workbook requires no source changes.

# Customer transition review

The existing Studio layout and workflows are retained. These changes are local for review. No production deployment, database write, account deletion, or payment was performed.

## What was already connected

| Feature | Signed-in application | Development demo |
| --- | --- | --- |
| Registration, confirmation, login, logout, and recovery | Supabase Auth with email templates, server actions, and authenticated session cookies | Synthetic session, enabled only by `STUDIO_DEMO=1 npm run dev` |
| Dashboard, journal, and goals | Profile and user records loaded through Supabase. Journal, milestones, goals, and activity are saved to Postgres under RLS. Daily reflection prompts are editorial copy. | Sample account, journal, and goals with browser-scoped demo edits |
| Workbooks and progress | Published modules, draft modules, entitlements, and answers are backed by Supabase. Paid modules and PDFs enforce entitlement. | Local samples and browser-scoped workbook state |
| Purchases | Stripe test Checkout, signed test webhook, and Supabase purchase history and entitlement updates | Separate sample content with no checkout |

The development demo branch is disabled in production builds. The old database seed also inserts three sample legacy products and publishes The Dancer Mindset with its sample flag. Before this change, the customer catalog and reader still exposed those database rows to eligible signed-in users. Production authenticated contents and hosted migration history were not directly accessible for inspection.

A live no-token confirmation probe returned HTTP 307 to `http://localhost:3000/login?confirmation=failed`. This verifies that the deployed callback still uses the old behavior. It does not establish whether Vercel is missing `STUDIO_SITE_URL` or has a localhost value. The earlier production audit also recorded a webhook 503. Provider-side environment values, migration state, and the exact running Git SHA have not been verified.

## Review changes

- Confirmation and recovery callbacks redirect to the same host using fixed relative destinations. Registration and reset email requests require a valid configured origin in production. Hosted Vercel builds reject a localhost origin. Local production-shaped tests can still use an explicitly configured loopback URL.
- Migration `20261123000600_customer_catalog.sql` marks the three identified legacy samples, hides their catalog and prompt rows, and excludes flagged interactive samples from storefront and module access. It retains existing content, entitlements, and personal records. A customized legacy title may need review and manual sample classification. The development demo still shows its sample catalog.
- Published interactive workbooks available to the customer appear in the dashboard’s existing library and continuation areas. Purchase counts include paid interactive workbooks.
- The existing Account content editor remains administrator-only. **New module** accepts an optional version 1 JSON file. Import validates the file and fills the editor for review. Edit chapter and module order, preview, save a draft, then publish separately. Each module from `content/the-dancer-mindset.json` illustrates the format. Import handles individual JSON modules. PDFs and Word documents need conversion to module content first.
- Journal errors retain the unsaved text in the open editor, show an explicit unsaved state, and offer a user-initiated copy action. Leaving an unsaved editor via an app link prompts for confirmation. Browser unload protection is best-effort. Retries reconcile identical content if a save committed but the network response was lost. Journal drafts are kept in memory rather than persistent browser storage. Forced tab termination can still lose unsent text.
- Editor permissions are assigned only through the database allowlist. Registration metadata cannot add a user to that list. Existing RLS and checkout policies still gate private and paid content.

## Manual configuration and release checks

1. Verify that Vercel serves the intended **reviewed commit** through the deployment assigned to `studio.kmoybox.com`. Follow the repository privacy resolution in [the Vercel report](VERCEL-READINESS.md) before moving new code to a remote. Keep live payment credentials out of the rollout.
2. In the serving Vercel environment, set `STUDIO_SITE_URL=https://studio.kmoybox.com` for a root deployment. Verify the Supabase URL, publishable key, server-only Supabase secret, and recovery signing secret. Leave `STUDIO_DEMO` and the local build switches unset. Use the exact canonical URL with the matching Supabase project.
3. In Supabase Auth, set the Site URL and allow the exact `https://studio.kmoybox.com/auth/confirm` and `https://studio.kmoybox.com/auth/recovery` URLs. Enable email confirmation, verify the repository’s confirmation and recovery templates, and test SMTP delivery with fresh messages.
4. Compare the target migration history against all six repository migrations using `supabase migration list` and `supabase db push --dry-run` after verifying the project reference. Back up the target and apply reviewed migrations in order. Do not load the sample seed into production. Review the three legacy sample identifiers before rollout if any were repurposed. No database records are removed by the migration.
5. Register the owner account normally and verify the exact user UUID. From a trusted SQL session, grant editor access with `insert into public.workbook_editor_accounts (user_id) values ('OWNER-UUID') on conflict do nothing;`. Sign in and choose **Account → Workbook content editor**. Create a workbook, import or author the modules, and publish only approved content. A published workbook created in the UI is free by default. Paid workbook pricing uses the existing separate test-only configuration.
6. On protected staging, then on the serving deployment after approval, verify fresh signup and recovery links, two-account isolation, persistence across login, checkout entitlement and refund revocation in Stripe test mode, and the deployment marker. Review policy and support links, logging, backups, and device checks in the [production audit](PRODUCTION-AUDIT.md) before inviting users.

The local customer browser suite requires an isolated Supabase/Auth/Mailpit stack and the synthetic SQL fixture at `auth-tests/fixtures/customer.sql`. Never apply that fixture to a customer database.

## Executed verification

- Production-mode Next.js build and TypeScript check passed. Its prefixed confirmation error returned a same-origin 307 in the local smoke check.
- The 16-test Playwright regression run passed. It includes JSON module import and publication in the demo editor, journal retry and navigation protection, and workbook draft, completion, and resume.
- The Auth browser suite registered a fresh synthetic user against local Supabase and Mailpit. It confirmed email, rejected unconfirmed sign-in, hid the seeded samples and editor from a normal user, saved workbook answers, journal and goal data, and checked persistence across logout, login, and refresh. Password reset and deletion of that newly created test account passed.
- All 79 local PostgreSQL authorization and integrity assertions passed, including cross-account reads and updates for journal, goals, and workbook responses, denial of editor self-assignment, and paid access and refund fixture checks.
- The public callback still returned localhost during this review. It did not match the locally tested callback behavior. The exact production commit, Vercel variables, Supabase migration history, and signed-in customer data were not directly verified.

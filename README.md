# KMOYBOX Workbook Studio

A private growth studio for Keep Me Out of Your Box. Members can work through guided exercises, keep a journal, set goals, track completion, and revisit purchased digital workbooks.

## Local development

Use Node.js 24, npm, a running Docker engine, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). The local configuration targets CLI v2.80.0.

```sh
npm ci
supabase start
cp .env.example .env.local
```

Copy the local publishable or legacy `anon` key from `supabase status` into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and check that the API URL matches. Set `STUDIO_SITE_URL` to the app origin. Generate `STUDIO_AUTH_SECRET` with `openssl rand -hex 32` and copy the local secret or legacy `service_role` key into `SUPABASE_SECRET_KEY`. Keep `.env.local` outside Git. The secret key is used only by server-side account deletion and Stripe purchase processing.

Run `npm run dev` and open http://localhost:3000. Register with an email and password and open the email confirmation link in the local email inbox reported by Supabase, usually http://127.0.0.1:54324. The starter workbook is available after sign-in. To test a purchase, use the local SQL editor or a trusted database session to grant a catalog item to your local user.

```sql
insert into public.entitlements (user_id, product_slug)
select id, 'the-boundaries-edit' from auth.users where email = 'your-local-test-email@example.com'
on conflict do nothing;
```

The product library uses these entitlements. Stripe Checkout is available in test mode when configured. The workbooks in the seed catalog are sample editorial content.

For a credential-free preview, run `STUDIO_DEMO=1 npm run dev` and open http://localhost:3000 in the browser on the same machine. In Codex Cloud, open **New tab (+) → Desktop** in the right panel and use the shared Chrome window. Cloud localhost is reachable from the cloud desktop. A separate browser needs a forwarded port or an approved hosted staging URL.

Confirm that the dashboard says **Sample content**. Go to **Workbooks → Open The Dancer Mindset** to try the interactive exercises, **Journal** to save a sample reflection, and **Goals** to add a goal or complete a milestone. Sample edits are scoped to the browser’s local demo session. Use fictitious text. The daily prompt and weekly goals use Pacific time.

## Checks

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run test:db
```

Browser tests start an isolated sample server. Database tests run on the local Supabase stack and check privacy and product access with two users. The [development plan](DEVELOPMENT.md) records schema, routes, and acceptance criteria.

## Launch and staging

The [launch review](LAUNCH.md) records release verification, open issues, hosted staging setup, domain routing, and rollback.

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

## Journal, goals, and personal data

Journal changes save after a short pause or when you leave the editor. You can also save immediately. Search matches saved titles and reflection text. The mood check-in records a mood you choose. Use the workbook selector to link a saved response or connect a goal to a workbook exercise.

Goal completion and milestone completion are tracked separately. Each goal displays its milestone progress and dated activity, and the dashboard shows totals from saved records.

In **Account → Personal data**, download your journal entries, goals, milestones, goal history, and workbook responses as JSON, or permanently delete that activity by typing `DELETE` and submitting the confirmation. The reset preserves sign-in and purchases. Demo activity is isolated by browser session in the local SQLite store.


## Authentication and authorization

Supabase Auth owns identities and credentials in `auth.users`. The profile migration creates and backfills `public.profiles` with owner-only read and display-name update policies. The legacy catalog uses `products` and `prompts`, and the structured catalog uses `engine_workbooks` and `engine_modules`. Purchases use `entitlements`. Journals, goals, milestones, and workbook progress have owner policies. The editor allowlist governs publishing separately. The app verifies the user session before loading private routes or processing account actions.

Local Supabase is configured for email confirmation and a minimum password length of 12. In a hosted workspace, configure the HTTPS site URL, exact callback allowlist, transactional SMTP, email confirmation, and the same password minimum. Use the supplied [confirmation](supabase/confirmation.html) and [recovery](supabase/recovery.html) templates, which deliver token hashes to the Studio callbacks. Reuse one strong `STUDIO_AUTH_SECRET` across app instances. A reset grant expires after 15 minutes and is bound to the verified Supabase session. A password change revokes active refresh sessions.

From **Account**, a signed-in user can change their display name. Full account deletion requires the current password and the exact confirmation phrase. It deletes the Supabase identity and cascades to its owner-linked Studio records, including its profile, purchase entitlements, private activity, and editor grant. Published studio content is shared catalog data and remains available. The separate personal activity reset preserves credentials and purchase access.

Run `npm run test:db` against a disposable local Supabase stack for authorization and cascade tests. With the signed-in app running locally, `npm run test:auth` exercises registration confirmation, route protection, profile updates, password recovery, and deletion using synthetic accounts and local Mailpit. If needed, override the app and Mailpit origins with `STUDIO_AUTH_TEST_URL` and `STUDIO_AUTH_TEST_MAIL`. Both test URLs are restricted to loopback. The standard `npm test` uses synthetic demo data.

## Backup and restore recommendations

- Enable managed backups and choose retention based on how much data loss the studio can tolerate. Use point-in-time recovery if changes between daily backups matter. [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- Protect backups as private journal data. Encrypt any exported copies, limit operator access, and record expiry and deletion handling. A backup taken before account deletion can still contain the deleted account until that backup expires.
- Test restores into an isolated project before launch and periodically afterward. Verify Auth identities, purchases, migrations, RLS, and a synthetic sign-in before a restored environment serves users. Reapply any account deletions that occurred after the backup point before reopening access.
- Back up any future Supabase Storage file objects separately. Database backups cover storage metadata. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)

## Stripe test Checkout

Checkout is available for structured interactive workbooks with a server-managed USD price. Free workbooks and legacy purchase entitlements keep their existing access rules. This integration accepts only Stripe test keys and test-mode events. It uses Stripe-hosted Checkout for card entry.

1. Apply the Checkout migration to your local Supabase database. Keep `SUPABASE_SECRET_KEY`, `STRIPE_TEST_SECRET_KEY`, and `STRIPE_TEST_WEBHOOK_SECRET` in the server environment, outside Git.
2. In Stripe test mode, create a one-time USD Price. Set its exact ID and amount in cents while the workbook is still a draft. Then publish the workbook. The values below are placeholders for a synthetic test offer.

   ```sql
   begin;
   update public.engine_workbooks set requires_purchase = true where slug = 'your-test-workbook';
   insert into public.workbook_prices (workbook_slug, stripe_price_id, amount, currency)
   values ('your-test-workbook', 'price_ReplaceWithTestPriceId', 1200, 'usd');
   commit;
   ```

3. Run the Stripe CLI in test mode and copy the signing secret that it reports to `STRIPE_TEST_WEBHOOK_SECRET`. Restart the app after setting the environment.

   ```sh
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,refund.created,refund.updated --forward-to http://localhost:3000/stripe/webhook
   ```

4. Sign in with a synthetic account, open the priced workbook, and use a [Stripe test card](https://docs.stripe.com/testing). Check **Account → Purchase history** for payment status and **My Library** for the workbook. Use another synthetic account to verify that its module and PDF remain locked.

Issue test refunds from the Stripe Dashboard. The webhook records successful partial refunds and preserves access. A full successful refund removes access. An authorized database operator can set a paid purchase’s status to `revoked` and update `updated_at` to block access and repurchase. For a pending order, expire its Checkout session before manually revoking access. Set a price’s `active` flag to false to pause sales without making the workbook free. Expire open sessions before changing a price. A Checkout that returns before webhook delivery stays pending, and the customer can refresh purchase history.

Run `npm test` for signature and payment-event fixtures and `npm run test:db` for purchase isolation, payment idempotency, refunds, and revocation.

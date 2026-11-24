# Personal Growth deployment checklist

Production remains at **https://studio.kmoybox.com**. Use the existing Vercel project, Supabase Auth project, workbook catalog, and domain assignment. The pull request targets the GitHub default branch, `development`. Confirm the Vercel production branch separately before approving the merge because merging into it may start a production deployment.

## 1. Prepare the isolated preview database

- [ ] Confirm the Vercel project that owns the existing production domain, its Git integration, and its current healthy deployment ID. Confirm the production Supabase project by matching the deployed public URL to the project reference. Record identifiers in the release ticket without storing secrets.
- [ ] Use a separate Supabase project or isolated database branch for Preview. Compare its migration ledger with the version-controlled directory. Apply the missing migrations in timestamp order before exercising the preview. A clean database needs all 28 migrations. An existing Studio installation with the six base migrations needs the 22 Growth migrations from `20261124170952_becoming_studio.sql` through `20261124212000_growth_content_manager.sql`, minus versions already applied and verified.
- [ ] Rehearse upgrading a production-shaped schema with synthetic records. Verify workbook progress, entitlements, profiles, journal entries, goals, and existing Growth history before and after. Keep real private records and production credentials out of Preview.
- [ ] Set Vercel Preview variables for the isolated Supabase endpoint and auth keys. Configure `STUDIO_SITE_URL` to the stable HTTPS Preview origin and exact confirmation and recovery URLs in Preview Supabase Auth. Use the current email templates and test mail transport. See [environment variables](RELEASE_READINESS.md#required-configuration).

## 2. Test the Vercel Preview

- [ ] Verify that the branch Preview is scoped to the isolated Supabase project before signing in or writing data. If Git integration created a Preview before isolation was configured, update Preview configuration and rebuild the same commit. Record the tested commit SHA and deployment ID.
- [ ] Confirm a successful Node.js 24 build and inspect logs for configuration errors and sensitive data. Exercise registration, confirmation, session reload, reset, and account deletion with synthetic accounts.
- [ ] Compare a new account's empty Growth views with an established account's retained records. Check cross-account exports, Timeline images, reports, and ordinary-member denial of editor actions. Check workbook authoring, publishing, completion, resume, PDF export, and entitlement access.
- [ ] Verify representative Growth drafts and charts, date boundaries, browser reminder permissions, public support, keyboard and mobile flows, and real-device assistive technology. Check private/no-store headers, log redaction, and hosted rate limits. Record results against [release readiness](RELEASE_READINESS.md).

## 3. Release only after approval

- [ ] Confirm the tested commit and approval. Verify a recent production backup and rehearse restore in isolation. Record the prior healthy Vercel deployment and confirm that it works with the forward schema. If Git integration auto-deploys the production branch, schedule the merge only after the database is ready.
- [ ] Verify the production Supabase target and ledger. Review `supabase db push --dry-run` against the verified project. Apply only approved, missing migrations before deploying the app. Review lock timing and monitor migration execution. Keep existing Auth settings, users, workbook records, domain, TLS, and redirects in place.
- [ ] Deploy the approved commit as a **new production build** using the existing Production-scoped variables. Next.js embeds public Supabase settings and the base path at build time. A Preview artifact configured for a test database is unsuitable for promotion to production.
- [ ] Confirm `https://studio.kmoybox.com` still points to the expected deployment. Verify production auth callbacks, workbook access and export, Growth empty states, and private/no-store responses with approved test accounts. Check for elevated error rates and retain the previous artifact.

## Rollback

1. If a migration fails, stop the deploy. Record the failed migration and actual ledger, and reconcile the partial state in an isolated copy before retrying.
2. For app failures, switch traffic back to the last verified Production deployment compatible with the current schema using Vercel rollback. Verify the same domain, Auth flows, workbook access, and private-data headers. If the prior artifact cannot safely read the forward schema, use maintenance mode or a forward fix.
3. Keep migrated data and the forward schema during app rollback. Avoid resets, down-migrations, or restoring over live writes. For database recovery, restore a backup into isolation, reconcile subsequent writes, and verify Auth, ownership policies, entitlements, and member history before any approved cutover.

## Evidence for this pull request

- Local upgrade rehearsal passed with an existing synthetic profile, workbook answer and progress, entitlement, journal entry, goal, and Growth draft. A second synthetic account saw no private rows belonging to the existing account.
- A local production-build smoke test with `STUDIO_DEMO=1` still redirected signed-out requests for the dashboard, workbooks, Growth, and the content editor to sign-in. The reminder poll returned 401.
- The staged diff had no matches for the checked credential patterns. Type checking, the audited production build, and the test results in [release readiness](RELEASE_READINESS.md) passed across the audited runs and targeted reruns.
- Hosted Preview configuration and test results still need verification. The Vercel team rejected the read-only project lookup with HTTP 403.

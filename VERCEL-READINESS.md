# KMOYBOX Workbook Studio deployment readiness

## Status

The application built successfully with Node.js 24.22.3, npm 11.19.1, and Next.js 16.4.6. The production build completed its TypeScript check. The PDF route’s file trace includes the workbook font. Vercel still needs a hosted smoke test for PDF downloads and authenticated routes.

GitHub confirmed that `defiantfeet/kmoybox-workbook-studio` is **public** and its default branch is `development`. At the time of the review, local application commit `5a60bf65e10421ca7f36049dd78c179d6bc0db5c` matched the live remote branch. Only documentation had local edits. The available GitHub account returned no accessible private repository with the same name. Supply the intended private repository or explicitly approve making the current repository private before pushing new work or importing it into Vercel.

The tracked environment template contains an example local URL and empty credential values. The current tree and local Git history contain no tracked environment files beyond that template. A targeted history scan found no matching Stripe secret keys, Supabase secret keys, or PEM private keys. Git ignores local and production environment files.

The repository contains five Supabase migrations in order, covering the Studio schema, workbook engine, personal activity, profiles, and checkout. The synthetic local PostgreSQL 17 database was missing the checkout migration. After applying it locally, all 67 assertions across the five authorization and data-integrity suites passed. Hosted migration state and configuration remain to be verified.

## Manual setup in Vercel

1. After the private repository is confirmed and deployment is separately authorized, grant the Vercel GitHub integration access to that repository. Use a dedicated staging project, the **Next.js** preset, repository root, and **Node.js 24.x**. Use `npm ci` to install and `npm run build` to build. Leave the output directory on the Next.js default. The app uses server-rendered routes and cannot use a static export.
2. Protect staging with **Deployment Protection** and restrict it to reviewers. Use a stable Vercel-hosted HTTPS address for review. Coordinate branch settings before enabling Git deployments. Because GitHub’s default branch is `development`, Vercel may select it as the production branch by default. For Preview-scoped settings, confirm that `development` targets Preview before importing or deploying. If using a dedicated staging project’s primary URL instead, scope all credentials to that staging-only project and keep deployment protection enabled on that URL.
3. Add the values below in the matching Vercel environment. Use the same Supabase project for both Supabase keys. Set or change build-time values before a build.

| Variable | Value or purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Isolated staging Supabase project URL. Public build input. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key for that project. Public build input. |
| `STUDIO_SITE_URL` | Exact stable staging HTTPS origin. Exclude any path and trailing slash. |
| `STUDIO_AUTH_SECRET` | Server-only signing value. Generate a unique value with `openssl rand -hex 32`. |
| `SUPABASE_SECRET_KEY` | Server-only secret key or legacy service-role key. Used for account deletion and payment processing. |
| `NEXT_PUBLIC_STUDIO_BASE_PATH` | Leave unset for the staging hostname root. Set `/studio` only for an approved subpath build. |
| `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` | Leave unset for the first reviewer preview. Configure only in a separate test-mode payment pass. |

Leave `STUDIO_DEMO` and `STUDIO_TEST_BUILD` unset on Vercel. The demo is development-only. Reviewers sign in using synthetic accounts in the isolated staging database.

## Manual setup in Supabase

1. Create a separate staging project and verify its project reference before linking the CLI. Run `supabase db push --dry-run`, review the migration list, then apply with `supabase db push` after authorization. For a fresh isolated staging database only, load the synthetic catalog from `supabase/seed.sql`. The seed inserts fixed IDs, so apply it once.
2. Under **Authentication → URL Configuration**, set **Site URL** to the stable review URL, including the prefix if the build uses one. Allow the exact `/auth/confirm` and `/auth/recovery` URLs under that address. Enable email confirmation, require a 12-character minimum password, and install the repository’s `supabase/confirmation.html` and `supabase/recovery.html` templates. Configure staging email delivery for the synthetic reviewer mailboxes.
3. With two synthetic accounts, verify confirmation, sign-in, password reset, private journal isolation, goal and workbook persistence, PDF export, and account deletion. Test the protected Vercel address in a signed-out browser too. For a later Stripe test pass, forward signed events to `/stripe/webhook` under the same base path and verify checkout and refund-driven access changes before any paid launch.

See [launch and rollback guidance](LAUNCH.md) for domain routing and release rollback.

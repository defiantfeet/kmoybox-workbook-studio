# Signed-in dashboard diagnosis

## Root cause and scope

The existing signup and login actions call Supabase Auth. The server session uses Supabase cookies, and private page data requires a successful `auth.getUser()`. Missing Supabase settings lead to a sign-in screen that reports missing configuration. A query error takes the app to its error boundary. The inspected normal customer path has no automatic demo fallback.

Two separate sources can look like the same issue:

- `lib/demo.ts` contains the two completed exercises, one journal entry, and three sample goals. `lib/data.ts` supplies Alex Morgan and uses that dataset only when the development-only flag in `lib/session.ts` is enabled. The dashboard, Journal, Goals, Account, Progress, and legacy workbook cards render the data they receive. The demo workbook store uses `content/the-dancer-mindset.json`; sample exercise and goal identifiers are fixture identifiers rather than authenticated user UUIDs.
- `supabase/seed.sql` also inserts an actual catalog into Postgres, including three legacy example workbooks and the published Dancer Mindset sample. On the prior build, signing in could display those seeded rows through normal customer catalog and workbook queries. The dashboard’s reflection prompt and decorative imagery are shared editorial content. Personal counts come from the signed-in account’s records.

The latest live confirmation probe still redirected to `http://localhost:3000/login?confirmation=failed`, which differs from the reviewed local callback. The provider’s running revision, exact hosted environment values, database migration ledger, and a signed-in production view were unavailable. If the live dashboard literally shows Alex’s journal or goals, verify the serving deployment and database provenance. The seed-catalog defect explains sample titles. The inspected signed-in path does not explain why a real user would receive Alex’s personal records.

## Changes

- `lib/data.ts` explicitly scopes entitlements, legacy responses, journal entries, goals, milestones, and goal activity to the verified Supabase user ID. Profile lookup uses that ID. Private records remain protected by database RLS. The queries page the legacy entitlement and answer lists. Auth service failures and database query errors surface an error. Unauthorized sessions go to sign-in.
- `lib/data.ts` and `lib/workbooks/repository.ts` add customer-side sample filtering and enforce the demo mode guard. Migration `20261123000600_customer_catalog.sql` also hides sample catalog and module content through database policy and RPC changes, retaining the underlying rows.
- `app/error.tsx` clarifies the data load error and preserves the retry action and existing layout.
- `auth-tests/lifecycle.spec.ts` exercises two synthetic accounts, profile identity, new-account zero counts, private record isolation, journal and goal edits and deletion, workbook persistence, and recovery from a simulated read failure. `auth-tests/fixtures/fault-gateway.mjs` provides the loopback-only test fixture.

## Configuration after review

1. Verify the Git SHA serving `studio.kmoybox.com` and the matching Supabase project. Ensure Vercel has the correct Supabase URL and publishable key, `STUDIO_SITE_URL=https://studio.kmoybox.com`, a server-only `STUDIO_AUTH_SECRET` and the server-only Supabase key for account deletion. Leave demo flags unset.
2. Compare the target history against the repository migrations. Back up the target and apply the reviewed customer catalog migration before serving the new customer code. Skip loading sample seeds. Have the owner verify whether any legacy titles were repurposed before classification.
3. Match Supabase Site URL, confirmation and recovery URLs, and templates to the serving domain. After an approved rollout, verify a fresh signup and two isolated accounts on the deployed application. Review the [customer transition steps](CUSTOMER-TRANSITION.md) for workbook publishing setup.

The local fault check runs the listed Auth suite with `STUDIO_AUTH_TEST_FAULT_URL=http://127.0.0.1:55436/__test/journal`, the app's Supabase URL pointed at the fixture on port 55436, and a separate local Supabase gateway behind the fixture. Use synthetic data and load `auth-tests/fixtures/customer.sql` only into the isolated test database.

## Executed results

- The production-mode Next.js and TypeScript build passed.
- All 16 regular Playwright regressions passed.
- The Auth lifecycle scenario passed against local Supabase and Mailpit with two freshly registered synthetic accounts. The first account’s saved workbook answer, journal entry, and goal survived reauthentication. The second account saw its own profile and empty journal, goal, and workbook progress states. Journal and goal changes and deletions persisted after reload.
- The same browser run received a deliberate HTTP 503 from the journal read path while still authenticated. It rendered the Studio error screen without a dashboard greeting or demo content, then restored the real dashboard when the test gateway resumed service. The server recorded the affected data source and synthetic error code.
- All 79 local PostgreSQL assertions passed, including cross-account read and update denial and sample catalog access.

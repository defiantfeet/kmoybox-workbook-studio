# The Becoming Studio

Research and implementation plan · November 24, 2026

Add The Becoming Studio as an authenticated area inside KMOYBOX Workbook Studio. The existing dashboard remains the entry point for workbook continuation and discovery. The new area brings together goals, habits, weekly reflections, and progress, with links back to the existing workbook and journal flows.

## Inspection scope

- Reviewed [defiantfeet/kmoybox-workbook-studio](https://github.com/defiantfeet/kmoybox-workbook-studio) at [development commit 1656949](https://github.com/defiantfeet/kmoybox-workbook-studio/tree/1656949abe7427810b6999d0ba244d4a620d1aaa), the default branch.
- A signed-out request to the [production origin](https://studio.kmoybox.com) returned a 307 redirect to `/login` with private, no-store cache control. The login page returned 200 with the Workbook Studio title. The response included a Vercel cache header. The serving Git revision, deployment settings, and authenticated production behavior were unavailable.
- The Supabase connector listed a project named **KMOYBox Workbook Studio**. Read-only metadata calls returned an empty public-table inventory and an empty migration ledger. The production hostname’s backend association remains unverified. Resolve that association before any migration or environment change. Application-data rows and credential values were outside this review.
- Testing findings come from repository source and configuration. Historical test results in the repository are prior evidence. This planning pass did not run the test suites or change application code, hosted settings, or production data.

## Application architecture and navigation

| Area | Repository evidence |
| --- | --- |
| Runtime | Next.js 16 App Router, React 19, TypeScript, Node 24+, and npm lockfile. `package.json`, `next.config.ts`, `app/layout.tsx` |
| Main routing | `app/[[...section]]/page.tsx` dispatches `/`, `/workbooks`, `/workbooks/[slug]`, `/journal`, `/goals`, `/account`, `/progress`, `/library`, `/content-editor`, `/purchases`, and `/login`. It checks route shape and returns 404 for unsupported paths. |
| Dedicated routes | Email confirmation and recovery handlers, forgot/reset password pages, private workbook PDF downloads, personal JSON export, and a Stripe webhook for test-mode checkout. See `app/`. |
| Navigation | `components/studio.tsx` supplies the shared sidebar, top bar, active-link state, account shortcut, skip link, and main landmark. Sidebar links are Dashboard, Workbooks, Journal, Goals, and Account. Progress, My Library, Purchase history, and Content Editor are reached contextually. |
| Dashboard | `components/dashboard.tsx` offers workbook continuation, the available workbook library, a daily reflection prompt linked to Journal, a weekly checklist backed by the same goal records as Goals, and progress totals for exercises, journals, goals, and owned products. It adds module and milestone counts when present. |
| Components | `components/personal.tsx`, `journal-editor.tsx`, and `journal-history.tsx` handle existing personal workflows. `components/forms.tsx` supplies shared action forms. Workbook reader, blocks, editor, storefront, and account have their own components. |
| Styling | Tailwind CSS 4 through PostCSS plus global rules and tokens in `app/studio.css`. DM Sans and Instrument Serif are loaded via Fontsource. The shared visual system uses cream, rose, navy, panel and button classes, responsive breakpoints, and visible focus states. Icons come from Lucide. |
| Deploy shape | Server-rendered pages, route handlers, and Server Actions require a Next.js server runtime. The optional `/studio` base path is build-time configuration. See `lib/studio-path.ts`, `next.config.ts`, and `VERCEL-READINESS.md`. |

## Authentication and persistence

**Identity and session.** `lib/session.ts` creates a cookie-backed `@supabase/ssr` server client with the public project URL and publishable key. The client uses no-store fetches. `proxy.ts` refreshes cookies through `auth.getUser()` and sets private, no-store caching when Supabase is configured. `account()` in `lib/data.ts` separately verifies the user at the data boundary and redirects unsigned requests to login. Transient auth failures surface an error. Profile identity comes from `profiles` using the verified user ID.

**Lifecycle.** `lib/auth/actions.ts` implements email/password registration, sign-in, sign-out, recovery, profile edits, and password-confirmed deletion. Confirmation and recovery routes use a user action before redeeming email tokens. Recovery uses a short-lived grant bound to the verified session. The server-only privileged Supabase client supports account deletion and checkout processing. Ordinary growth reads and writes should use the signed-in client.

**Reads.** The existing catch-all calls `studio()` before rendering private sections. It fetches catalog and prompts, explicitly filters private entitlements, answers, journals, goals, milestones, and history by verified user ID, and pages those queries in 500-row batches. The profile query uses the same identity. Query failures go to the error boundary. The structured workbook repository separately checks access through its RPCs and scopes progress by user. This confirms the retrieval path in source. A new summary route should avoid loading full journal bodies, answer payloads, or the entire workbook catalog into unrelated views.

**Writes.** Server Actions validate inputs, derive ownership from `account(true)`, and rely on row-level security (RLS) in addition to owner predicates. `lib/actions.ts` saves legacy answers and goals, including dashboard checklist actions. `lib/personal/actions.ts` saves milestones and performs revision-checked journal autosaves, preserving the editor’s unsaved state on conflicts. `lib/workbooks/actions.ts` upserts structured answers and completion, while database rules check published revision and workbook access. These actions revalidate their dependent pages. End-to-end authenticated saves were traced in source and covered by existing test scenarios. Live persistence was outside the verified scope.

**Personal data controls.** `app/personal-data/route.ts` invokes the owner-scoped `export_personal_activity` RPC and returns a private, no-store JSON attachment. The separate typed-confirmation reset uses `delete_personal_activity` to remove journals, goals and their dependents, legacy answers, and engine progress. The reset preserves the account and purchases. Full account deletion uses the Auth identity and cascading ownership relationships.

## Repository migrations and tables

All entries below refer to files under `supabase/migrations/`. The connected project metadata is described separately above.

| Migration | Public tables and changes |
| --- | --- |
| `20261123000100_studio.sql` | `products`, `prompts`, `entitlements`, `responses`, `journal_entries`, `goals`. Legacy workbook catalog, entitlement and answer rules, private journals and goals. |
| `20261123000200_workbook_engine.sql` | `workbook_editor_accounts`, `engine_workbooks`, `engine_module_drafts`, `engine_modules`, `engine_progress`. Author grants, published module revisions, entitlement and progress checks. |
| `20261123000300_personal_activity.sql` | Adds journal mood and workbook links to personal flows. Creates `goal_milestones` and `goal_activity`, goal-history triggers, workbook-link validation, and export/reset RPCs. |
| `20261123000400_profiles.sql` | `profiles` with owner-only reads and display-name updates, provisioning trigger on `auth.users`, and a backfill. |
| `20261123000500_workbook_checkout.sql` | `workbook_prices`, `workbook_purchases`, `workbook_payment_events`, checkout and ledger RPCs, and purchase-aware access. |
| `20261123000600_customer_catalog.sql` | Adds a legacy catalog sample marker and adjusts catalog, reader, and editor policies/RPCs to retire sample offers from customer access while retaining stored rows. |

Supabase Auth manages `auth.users` outside these public application tables. The repository enables RLS on the application tables. Private rows use owner predicates, while catalog, editor, and payment access use different rules.

## Demo and fallback inventory

- `lib/session.ts` requires both development mode and `STUDIO_DEMO=1`. `lib/data.ts` supplies Alex Morgan and uses the fixture goals, journal, and answers in `lib/demo.ts`. The shared shell labels this mode **Sample content**.
- Demo persistence uses browser-session-scoped SQLite in `lib/workbooks/demo-store.ts`. `demoSnapshot()` can fall back to legacy demo cookies or built-in fixtures. `content/the-dancer-mindset.json` supplies a demo workbook. Demo editing, sample account views, and demo export/reset have separate paths.
- `supabase/seed.sql` inserts example catalog rows into a real database. The private customer loader filters legacy `sample=false`, the structured repository filters sample offers, and migration 006 applies database-side catalog restrictions. An environment running older code or migrations, or carrying repurposed seeded titles, needs separate review.
- Daily reflection prompts and decorative covers are shared editorial content. The current signed-in source has no automatic demo substitution on query errors or missing configuration. A missing client routes to login, while read failures surface an error. Empty data gets an empty state.
- Some onboarding text in `README.md` and older deployment notes still describe the seeded starter as visible to signed-in users. Use the latest migration, customer-transition notes, and a synthetic authenticated check to establish current sample visibility.

## Recommended architecture

1. Add a dedicated authenticated page at `/becoming`, rendered via the existing `Shell` and a navigation entry in `components/studio.tsx`. A dedicated App Router page keeps the new data loader focused. Keep the root dashboard and its workbook links in place. Add a contextual link from the root dashboard after the new area is verified.
2. Render a server-side overview for weekly focus, existing goals and milestone progress, habit completion, and reflection status. Reuse existing Studio tokens, headings, panels, meters, and action form conventions. Use client components for habit controls and editing state where needed. Keep unrelated routes independent of the new tables.
3. Reuse `goals`, `goal_milestones`, and `goal_activity`. Link to the existing Goals editor and preserve current definitions of goal completion and milestone progress. Link daily reflection and freeform journal workflows to existing Journal. Use a dedicated weekly record for structured prompts and enforce one per week. Start with weekly wins, challenges, and one next step. Use a bounded history view with prior weeks and derived trends.
4. Put focused reads, validation, and Server Actions under a feature directory such as `lib/becoming/`. Authorize reads and each mutation using `account()` or `account(true)`. Use small summary queries and fetch full reflection text only for an explicitly opened week. Index owner/date reads, revalidate the affected views, and keep private responses out of shared caches.
5. Keep habits and reflections personal to the signed-in member. For any future workbook-linked shortcut, reuse existing reference validation and entitlement checks. Workbook publishing, revision history, progress, PDF access, library, and purchase flows keep their existing rules.
6. Start with the existing Pacific calendar convention in `lib/model.ts`, which uses Monday-based weeks. Share date helpers across rendering and server validation. Store habit and reflection dates as calendar `date` values and event timestamps as `timestamptz`. A later timezone preference requires an explicit rule for historical dates and week boundaries.

## Proposed schema and data behavior

| Table | Fields and constraints |
| --- | --- |
| `growth_habits` | UUID PK, `user_id` FK to `auth.users` with deletion cascade, bounded title, start date, optional archive date, created/updated timestamps. Add unique `(id, user_id)` for the composite log FK and index owner and active state. Start with daily habits. |
| `growth_habit_logs` | `habit_id`, `user_id`, `local_date`, and completion timestamp. A composite FK `(habit_id, user_id)` enforces parent ownership and cascades on habit deletion. Unique `(habit_id, local_date)` makes checked writes idempotent. Add an index on `(user_id, local_date)`. |
| `growth_weekly_reflections` | UUID PK, `user_id` with deletion cascade, Monday `week_start`, bounded wins/challenges/next-step text, timestamps, and revision token. Unique `(user_id, week_start)` and a Monday check. Add an owner/week index only if the unique index does not cover the required queries. |

- Apply explicit, minimal authenticated grants and per-operation owner RLS to each new table. Use both `USING` and `WITH CHECK` for updates. Enforce ownership at the database boundary even if a caller sends forged identifiers. Review API exposure settings in the actual target project. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Log the desired checked state rather than inverting stored state. Checking inserts by unique key, and unchecking deletes that owner/date record. Accept retries and test concurrent requests. Preserve history on archive and use the habit’s active dates for trend denominators. Reject future dates and dates outside the tracking window with server-side validation. Put invariant checks in the database where direct Data API writes could otherwise bypass them.
- Save the weekly reflection using an expected revision or insert-once flow. On conflicts, retain unsaved text and offer reload/retry. Treat missing rows as an empty state and distinguish failures. Use database counts and bounded queries for trends so journal and workbook payloads stay outside the summary.
- Extend the existing security-invoker export/reset RPCs in the same additive migration. Preserve existing JSON fields and add explicit named growth sections, assessing export versioning for consumers. Delete growth reflections and habit parents in the same transaction as personal reset. Verify cascading habit logs and Auth account deletion. Update Account copy before exposing the feature. Existing workbook answer deletion remains covered by the existing personal activity reset contract.
- No goal or journal backfill is required to display existing data. Initialize new accounts and existing accounts with empty growth tables. Treat the previously generated standalone dashboard as a prototype outside this integration. Any later import of browser-local entries needs a separate, member-initiated mapping and deduplication design.

## Test infrastructure and release gates

| Existing check | Coverage and additions |
| --- | --- |
| `npm run typecheck`, `npm run build` | TypeScript and production Next build. Verify root and optional base-path builds where used. |
| `npm test` | Playwright runs an isolated development demo server. Existing suites cover dashboard navigation, workbook saving/resuming, editor publishing, private PDF, journal/goal behavior, activity export, payment-event fixtures, keyboard and viewport checks, and axe accessibility. Extend navigation and regression checks to cover the new route. If using a demo fixture for UI tests, label it and keep authenticated persistence checks separate. |
| `npm run test:auth` | Separate loopback-only Playwright config exercises signed-in behavior using synthetic users and local Supabase/Mailpit. It includes two-account isolation and a local fault gateway. Add direct route protection, empty-state reads, reload persistence, data export/reset, and account deletion with growth rows. Verify database outages preserve error states without samples. |
| `npm run test:db` | Supabase pgTAP SQL tests cover isolation, personal activity, profiles, editor/workbook access, checkout, and customer catalog. Add tests for unauthenticated denial, two owners, forged parent IDs, ownership reassignment, uniqueness, concurrent replay, export scope, and reset/account-delete cascades. |
| Hosted smoke test | Use an isolated staging project with synthetic accounts. Verify sign-in, cookies and private headers, week rollover, keyboard and phone layouts, workbook resume, journal autosave, goal edits, entitlement gates, private PDFs, and editor publishing. Keep Stripe verification in test mode. |

No checked-in CI workflow was present in the reviewed tree. Before merge, require the checks above in the repository’s actual review workflow and capture results from a clean migration apply.

## Risks and implementation sequence

| Risk | Mitigation and release condition |
| --- | --- |
| Wrong database target or migration drift | Match the serving Vercel deployment SHA, environment scope, and Supabase project reference using read-only deployment settings. Reconcile the live migration ledger and catalog with the repository before applying anything. An empty ledger alone cannot establish a safe migration baseline. |
| Cross-account exposure | Use RLS, verified credential-bound owners, parent ownership FKs, private cache headers, and two-user staging tests. Keep the privileged key out of the growth feature. Any views or RPCs used for summaries should preserve caller authorization. |
| Sensitive text leakage | Exclude journal and reflection contents from telemetry, request logs, shared caches, test artifacts, and analytics events. Limit export access to the owner. Document backup retention and any restore-time deletion replay. Use synthetic staging records. |
| Inconsistent writes and calendar edges | Validate date boundaries on the server, test Monday and DST transitions, use idempotent check-ins, and enforce revision conflicts on reflection writes. Preserve previously logged days when habits are archived. |
| Workbook regressions or risky rollback | Add tables and policies without changing workbook contracts. Deploy migration before exposing the feature. Use an environment-controlled route and navigation flag for staged rollout. Have a compatible rollback build that hides the feature and retains export/reset coverage for growth rows already created. |
| Hosting, auth, and repository visibility | Verify hosted callback allowlists, recovery templates, SMTP, cookie behavior, preview environment separation, and production branch settings. Keep secrets scoped to the correct environment. GitHub currently reports the source repository as public. Confirm repository visibility before pushing internal deployment material. |

1. **Establish the baseline.** Confirm the serving revision and database target, compare migration histories, and record the workbook and auth baseline in local or isolated staging. Confirm product decisions for weekly prompts, deletion and archive behavior, and whether release one needs progress trends beyond the current week.
2. **Implement the data layer.** Add the new migration, ownership constraints, explicit grants, RLS, and updates to export/reset. Test migration from a clean database and from the current migration set with synthetic legacy activity. Keep existing workbook tables and access policies out of the feature migration.
3. **Integrate into Workbook Studio.** Add the feature route and shared-shell entry, focused authenticated reads/actions, goal summaries, habit grid, weekly reflection editor, and history. Use empty/loading/error states and test session expiry and retry behavior.
4. **Verify staging.** Run build, typecheck, Playwright, Auth, and pgTAP checks. Exercise existing workbook and account behavior and confirm private responses carry appropriate cache headers in the hosted runtime.
5. **Roll out after review.** Reconcile the target ledger, verify backup/restore readiness, apply the reviewed additive migration, deploy with the feature hidden, then enable and verify. If there is a rollout failure, hide the entry and route and preserve saved growth records and privacy controls.

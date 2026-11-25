# KMOYBOX Personal Growth pre-production audit

**Audit date** November 24, 2026 (Pacific time)

**Recommendation** Hold the production rollout until the hosted staging checks below are complete. The audit used local synthetic data and did not change production.

## Scope and method

The review covered all 15 module entry points and the dashboard, Insights, weekly/monthly Reports, onboarding, reminders, and the Personal Growth Content Manager. Authenticated flows exercised the browser, Next.js server actions and route handlers, the local Supabase Auth and PostgREST services, and PostgreSQL. Cross-account tests used independent browser sessions. The browser regression suite also uses explicitly marked, development-only demo data for UI and pure computation tests.

## Results and release gates

| Check | Result |
| --- | --- |
| Browser regression and unit-style Playwright checks | **Passed.** 55 baseline tests, including keyboard controls, narrow viewports, workbook workflow regressions in demo mode, chart arithmetic and date boundaries, reminder recurrence, and journal retry behavior. |
| PostgreSQL migrations and pgTAP | **Passed.** All 28 migrations and the development seed applied in an empty local PostgreSQL 17 database with a minimal Auth fixture. All 328 assertions in 28 SQL files passed. Included owner isolation, editor authorization, timeline image isolation, input constraints, timezones, reminders, export and deletion. A catalog check found RLS enabled on all 23 audited private tables. |
| Type checking and production build | **Passed.** TypeScript, `git diff --check`, and the final production build passed. The running bundle returned 200 for public support, 307 for a signed-out dashboard request, and 401 for signed-out engagement. Server-only canaries were absent from compiled browser assets. |
| Dependency audit | **Passed.** The npm registry reported zero known advisories for the resolved dependency graph at audit time. |
| Credential and HTML rendering review | **Passed for the checked scope.** A scan of 250 repository text files found no matches for Supabase secret keys, Stripe API/webhook secrets, or private-key headers. Reviewed user content rendering uses React text nodes. The email link renderer validates the token and escapes its static URL context. |
| Lint and Supabase CLI | **Unavailable.** No lint script or repository linter configuration is present. `npm run test:db` failed because the Supabase CLI is unavailable. All database test files were run directly with `psql` as described above. |
| Expanded mobile accessibility and chart rechecks | **Passed after fixes.** Eighteen of twenty primary-view checks passed on the initial sweep. Both failing chart views passed the WCAG A/AA rescan. The original Emotional Wheel and Wheel of Life keyboard chart tests also passed on rerun. The support page passed the keyboard, overflow, reduced-motion, and axe checks. |
| Protected HTTP endpoints and content editor | **Passed.** Three signed-in and signed-out integration tests covered editorial draft, preview, schedule, publish, and archive, blocked an ordinary member, and checked the public support, private export, PDF, image, engagement and reminder endpoints. |
| Timeline data and images | **Passed.** A signed-in browser test covered upload, cache headers, unauthenticated denial, export, hiding, deletion, and the corrected saved-event dashboard label. The SQL suite covers owner isolation for image storage in PostgreSQL. |
| Account lifecycle | **Passed in the focused check and full lifecycle rerun.** Signup and email confirmation used local Mailpit. Reload preserved the authenticated session with an HttpOnly cookie. A separate browser session reset the password, the new password worked, and credentials stopped working after deletion. The full rerun also verified cross-account isolation, Growth and workbook activity, export, and that synthetic markup stayed plain text. |
| Reflection, social, and body modules | **Passed.** Authenticated browser flows covered Thought Record, Emotional Wheel, the Values/Identity/Boundary/Relationship/Inner Critic workflow, Social Integration with two independent accounts, and Body Awareness. Related transitions, saved drafts, persisted content, export and history were exercised by the applicable tests. |
| Future-Self and Habit Tracker | **Passed.** Browser integration covered private vision text and letters, dated comparison, goal and milestone creation, the habit handoff, schedules, rest days, partial amounts, and pause history. |
| Mood, aggregation and onboarding | **Passed.** The signed-in tests verified distinct same-day entries, date retrieval and export in Pacific/Kiritimati, a 4.5/10 mean from ratings of 1 and 8, six unobserved days, edit/delete controls, real Insights aggregates and sample sizes, and a skippable and editable starting plan. |
| Reports and reminders | **Passed.** Signed-in tests covered private report snapshots, period comparison, owner-only PDFs, generic opt-in browser notification payloads, duplicate prevention, snooze, pause and disable. Browser notifications were tested with a simulated permission API. |

Across the initial run and focused reruns, all 18 distinct authenticated and HTTP integration tests passed. The first 16-test Auth run finished with 11 passes and five failures. Each failed case passed when rerun after the changes below. The 55 browser regression tests and all 20 expanded mobile checks passed across their respective runs and chart rescans. The optional signed-in transport-fault subcase was disabled because no fault URL was configured for the audit server.

### Failed initial attempts and recoveries

- The first mobile sweep found speech-control label mismatches in the Emotional Wheel and Wheel of Life. Both chart views passed the focused rescans after the fixes.

- The first authenticated editor run lost the local server connection when the development server restarted to apply the logging change. The ordinary-member admin access check in that run passed.
- The initial account lifecycle test expected four empty check-in cards for the second account. The dashboard correctly renders five, including the added afternoon slot. The assertion was updated. Its next full run passed that check and later exceeded the 240-second browser-test budget at the goal editing stage under concurrent local verification. The focused account lifecycle passed. The full regression also passed when rerun with a longer budget.
- The combined relationship/values workflow and Social Integration initially timed out at 120 seconds. Both passed with budgets sized for the number of interactions.
- The Future-Self integration used a text selector that matched the same habit in three locations. Scoping it to the habit heading resolved the test failure, and the rerun passed.


## Findings fixed during the audit

- Added a public, keyboard-accessible support page and a notice on the dashboard that the Studio is not monitored for emergencies. The page explains the educational scope, opt-out, and channels for immediate help. The Personal Growth navigation links to it.
- Disabled Next.js development request logging because it included one-time authentication token query strings. Server-function argument logging remains disabled. The post-change local log scan found neither an authentication token query nor the synthetic journal marker. The source review found sanitized error-code logging for Studio data failures, and the in-app reminder payload carries generic copy.
- Saved Life Timeline events now appear as saved events in progress history and are excluded from the dashboard's completed-exercise list. Hidden events remain excluded from dashboard history.
- Fixed speech-control label mismatches on both interactive charts. Emotional Wheel segments use matching visible and accessible text and a dashed selection outline. Wheel of Life axis button names include their visible numbers.
- The engagement API verifies the signed-in session before parsing the request body and rejects cross-site requests.

## Content and safety review

| Area | Review |
| --- | --- |
| Wheel of Life, Values Assessment, Identity Mapping and Life Timeline | User-controlled labels, domains and ratings. Review copy treats records as reflections rather than clinical outcomes or personality classifications. Timeline images and event descriptions are optional. |
| Thought Record, Emotional Wheel, Cognitive Reframing, Inner Critic Dialogue and Mood Tracker | Educational framing, user-selected feelings and perspectives, and neutral treatment of missing ratings. No diagnosis or automated classification workflow was found in these modules. |
| Boundary Builder, Relationship Inventory and Social Integration | Private planning for unsafe situations, optional ratings and activities, and member-selected goals and participation. The dashboard now makes the social prompt expressly optional. |
| Body Awareness, Future-Self Visualization and Habit Tracker | Skip and non-movement options, flexible time horizons, and neutral rest/skip states. The reviewed features do not promise outcomes or send punitive streak messages. |
| Insights, Reports, onboarding, notifications and editorial content | User-entered aggregates, sample sizes and empty states. Onboarding is rule-based and skippable. Reminder notifications use generic copy. Review future editor-authored copy for the same standards before publication. |

## Remaining risks and manual staging verification

1. **Target and deployment.** Independently verify the Supabase project that serves `studio.kmoybox.com`, its migration ledger and current configuration. Rehearse a schema upgrade from a production-shaped snapshot with synthetic data, including lock timing. A clean local migration run tests installation, not the live target's migration history.
2. **Privacy and security.** Verify CDN and reverse proxy headers for signed-in pages and exports, production log redaction for callback queries and request bodies, SQL log settings, APM, session replay and backup access. Confirm that ordinary users and content editors cannot read other accounts' private records. Test credential separation, session revocation and deletion on staging, including backup retention. The repository credential scan is a pattern check and does not cover Git history or deployed credentials.
3. **Abuse and performance.** Confirm hosted Supabase Auth quotas and rate-limit responses for signup, sign-in, email, reset and verification. The app has no independent distributed throttle for the engagement, reminder or export endpoints. Stage load tests with realistic visit, exercise and image volumes and configure edge limits if measured or policy needs require them. PostgreSQL timeline images have an enforced per-image size limit, but bulk storage and complete export size still need capacity testing. Some module history screens intentionally show bounded recent history. Check older-entry access and full exports against representative account sizes.
4. **Accessibility and device behavior.** Test VoiceOver/Safari and TalkBack/Chrome on real devices, chart readout and focus order, mobile target sizes, keyboard-only workflows, contrast across states and zoom to 200–400%. Test permission denial and real OS reminder delivery. The Studio delivers browser notifications only while a signed-in Personal Growth tab is open and visible. Check the public support page on the deployed hostname and periodically verify its resource links.
5. **Staging smoke test.** Register and confirm two synthetic users through the hosted mail transport. Save, edit, retrieve and export representative entries across the modules, including a timezone crossover and multiple same-day check-ins. Verify account deletion, password reset, both editor roles, private images/PDFs, and browser settings persistence after reload. Keep workbook authoring, completion, and PDF checks in the rollout smoke test. If checkout is enabled, separately exercise signed Stripe test checkout, webhook delivery and refund. Live checkout is outside this audit.

## Required configuration

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required public project endpoint and publishable key. Use isolated staging values and the verified production values for the production artifact. |
| `STUDIO_SITE_URL` | Required exact HTTPS app origin in hosted environments, with no path. Configure Supabase Auth site URL and the exact confirmation and recovery redirects for the actual base path. |
| `STUDIO_AUTH_SECRET` | Server-only recovery-signing secret of at least 32 bytes. Use a different value for each environment. |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret or legacy service-role key for account deletion. Enable for release if account deletion is available. Required for optional Stripe test checkout and webhook RPCs. |
| `NEXT_PUBLIC_STUDIO_BASE_PATH` | Empty for a root deployment on the Studio subdomain. Use `/studio` only for a deliberately routed subpath. Match build and runtime. |
| `STUDIO_DEMO` | Omit or set to `0` in hosted environments. |
| `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` | Optional, test-mode Checkout and webhook only. Leave unset when not exercising Checkout. |

Enable email confirmation, install the version-controlled confirmation and recovery templates, and configure the hosted mail provider. Authorize editorial accounts through the trusted `workbook_editor_accounts` database allowlist. Personal Growth reminders and scheduled publications need no external scheduler.

## Database migrations and deployment

- Use Node.js 24 and the committed lockfile. Run `npm ci`, `npm run typecheck`, and `npm run build`. Ship the repository's `assets` directory with the runtime for PDF fonts.
- In a new database, apply the ordered files in `supabase/migrations`, starting at `20261123000100_studio.sql`. Growth starts at `20261124170952_becoming_studio.sql` and requires every following migration through `20261124212000_growth_content_manager.sql`. This audit adds no migration. For an existing project, compare migration histories with `supabase migration list`. After confirming the staging link, review `supabase db push --dry-run`, then apply only the reviewed missing migrations on the independently verified target. Avoid development seeds on production.
- Back up the target and prove restore to an isolated environment. Review the migration plan and schedule potentially locking changes. Apply the approved migration set before releasing the compatible immutable application build. Verify no-store behavior, the smoke checks above, and error and latency baselines before directing production traffic to it.

## Rollback

1. Record and retain the prior app artifact, origin rules, environment config, and migration ledger. Rehearse switching traffic to a previous app build compatible with the forward schema. If compatibility is uncertain, use maintenance mode and forward-fix.
2. Restore traffic to the last verified compatible build. Preserve private user data, editorial revisions, and the purchase ledger. Avoid down-migrations or database resets as a rollback shortcut. Older Growth builds that assume one row per module are incompatible with stored history.
3. If recovery requires a backup, restore it into isolation first and reconcile writes after the restore point. Verify Auth, RLS, browser flows, and the migration ledger before switching traffic. Keep signature-verified delivery for outstanding Stripe test events when applicable.

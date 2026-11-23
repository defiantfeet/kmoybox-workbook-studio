# KMOYBOX Studio launch review

## Release status

The Studio has a local staging deployment built with production settings and mounted under `/studio`. It uses synthetic accounts, local Supabase Auth and PostgreSQL, and a local mail catcher. A public staging deployment requires a selected Node host and separate hosted staging credentials. Production deployment and changes to Wix or DNS require approval.

- Studio staging in the cloud desktop is at `http://localhost:3103/studio`.
- Local confirmation and reset emails are available in Mailpit at `http://127.0.0.1:55435`.
- The source build supports both the existing development root and the production-shaped `/studio` path.

## Launch issues by severity

| Severity | Issue | Exit condition |
| --- | --- | --- |
| P0 · Paid launch blocker | Hosted Stripe Checkout and a real Stripe **test-mode** refund have yet to be exercised. The application rejects live keys and live events. | Configure an isolated test account, one-time test Price, and signing secret. Complete hosted test Checkout, verify unlock, refund it in Stripe, and verify revocation and webhook retries. Treat any future live enablement as a separate approved change. |
| P1 · Public launch blocker | The public apex redirects to Wix’s `www` hostname and the current `/studio` path returns 404. A hosted staging project and an edge capable of proxying the path are pending. | Choose the hosting and routing option below. Verify DNS, TLS, callbacks, assets, Stripe delivery, and rollback on a hosted staging domain before changing public traffic. |
| P2 · Accessibility and capacity verification | Automated WCAG scans and local keyboard and viewport checks are limited to the tested Chromium flows. Local timing does not measure hosted latency or concurrent-user capacity. | Check VoiceOver or TalkBack and Safari on a physical device. Run a hosted baseline and load test before paid rollout. |
| P2 · Draft recovery boundary | A failed journal save retains the current text for retry in the open editor. Reload or reopen restores the last server-saved version. | If cross-close offline recovery is required, define a private local-draft policy and add that feature before advertising offline recovery. |

## Hosted staging

1. Provision a separate Node.js 24 app service and Supabase project. Build from an immutable commit on the development branch with `npm ci` and `npm run build`. Serve it with `npm run start`. Ship the repository’s `assets` directory with the runtime because PDF generation uses it.
2. Set `NEXT_PUBLIC_STUDIO_BASE_PATH=/studio` at **build and runtime**, and set `STUDIO_SITE_URL=https://studio-staging.kmoybox.com`. Use staging Supabase keys, a different `STUDIO_AUTH_SECRET`, and Stripe **test** credentials in the host’s environment settings. Disable demo mode. Apply the migrations in order and use only synthetic fixtures. Public Supabase settings are build inputs.
3. Point `studio-staging.kmoybox.com` at the staging service with the host-provided CNAME or supported DNS target. Verify TLS before testing. Set Supabase’s site URL to `https://studio-staging.kmoybox.com/studio`, add the exact `/studio/auth/confirm` and `/studio/auth/recovery` callback URLs, and install the repository’s mail templates. Forward Stripe test events to `https://studio-staging.kmoybox.com/studio/stripe/webhook`.
4. Restrict human access to staging through the host. If that protection blocks Stripe deliveries, exempt only the webhook path. The application still verifies signatures on that path. Repeat the checks below with a synthetic buyer and a second synthetic account.

## Connecting kmoybox.com/studio

DNS maps hostnames to services. The path split needs an HTTP router.

- **Keep the exact address.** Use an edge router you control in front of both the Studio and Wix. Route exact `/studio` and prefix `/studio/` to the Studio service before the existing apex-to-`www` redirect. Preserve the prefix and query string. Route other requests using the current website behavior. If `www.kmoybox.com/studio` also needs to work, route it to the Studio or redirect it to the canonical apex path. Confirm the Wix origin and TLS configuration with your provider before putting an edge in front of the existing website.
- **Keep Wix in front.** Add a Wix redirect from `/studio` to a dedicated Studio hostname after proving the redirect in a staging or disposable Wix page. The entry URL works and the visitor continues on the subdomain. Use a temporary redirect wherever the edge or Wix configuration supports it during activation, since permanent redirects can be cached.
- **Routing contract.** Forward `/studio/_next/*`, public assets, auth callbacks, PDF and data exports, and `/studio/stripe/webhook`. Preserve methods, request bodies, cookies, and the original forwarded host and protocol. Set the upstream Host and TLS SNI as required by the app host. Preserve the raw Stripe request body and signature header. Honor private/no-store responses and disable shared caching for authenticated pages and exports.
- **Cutover checks.** Verify apex and www redirects, an unrelated Wix path, a signed-out deep link, login and reset mail, image and font assets, the PDF and journal JSON exports, and signed Stripe test delivery. Use the canonical site URL `https://kmoybox.com/studio` in Supabase and the origin `https://kmoybox.com` in the app. Check exact callback paths and session cookie scope.

## Rollback

- Export the existing DNS and edge rules. Lower relevant DNS TTLs ahead of the approved cutover and keep the previous origin available while changes propagate. Verify rollback using a fresh client with no redirect cache.
- Pin the release and its configuration. Roll back traffic to the last verified **prefix-compatible** version using the host’s deployment switch. For the first release, remove the new path rule or send it to a maintenance page. Keep the rest of the website on its existing route. DNS rollback can take until the previous TTL expires.
- Keep the database schema and purchase ledger intact during a code rollback. Test that the rollback build works with the forward schema. Keep the signed webhook endpoint reachable for pending test orders, or pause Checkout, expire open sessions, and replay failed deliveries after a compatible handler is restored. Never drop payment or journal records as a rollback shortcut.
- Take and verify a database backup before the approved cutover. Restore into an isolated project to check schema, Auth, RLS, and data. See the [backup guidance](README.md#backup-and-restore-recommendations).

## Verification results

| Area | Result |
| --- | --- |
| Registration and login | Production-build browser test passed against local Supabase Auth and Mailpit. It covered confirmation, login, reset, protected routes, profile editing, and account deletion. The staged login and reset screens also passed a manual keyboard navigation check. |
| Purchase and access | A synthetic buyer saw the paid offer and remained locked after visiting the Checkout return URL. A verified-payment database fixture unlocked lessons and PDF downloads. A simulated full refund revoked both. Hosted Stripe Checkout and refunds remain open. |
| Autosave and recovery | A simulated network failure preserved the draft in the open editor. Retrying saved the text, and a reload restored it. Workbook response, resume, and completion tests passed. |
| Journal privacy and database authorization | 67 pgTAP assertions passed against PostgreSQL 17, including separate-user privacy and paid-content access. The staged private JSON export also worked for the signed-in user. |
| Goal tracking | Browser regression tests checked saved goals, milestones, and the dashboard’s progress display. |
| Mobile and accessibility | Layout checks found no horizontal overflow at 360 and 768 CSS pixels across the six core views. Axe reported no WCAG violations in those views or the staged sign-in, locked offer, and mobile workbook. Manual keyboard checks exercised sign-in, reset, and the skip link. The workbook card labels were corrected and rescanned. |
| Payment webhook security | Five HTTP probes against a staging build rejected missing, invalid, and tampered signatures and a signed live event with HTTP 400. A valid, irrelevant test event returned 204. The unconfigured handler returned 503. |
| Error handling | Signed-out private routes redirected to the prefixed login, unknown paths returned 404, and paid PDF downloads returned 404 before purchase and after revocation. An initial intermittent dashboard fetch failed during the Auth run. The final staging run passed after explicitly disabling caching for session-bound Supabase fetches and adding sanitized error logging. |

The production build and TypeScript check passed, along with 16 browser regression tests and the separate Auth lifecycle test. All account and payment fixtures were synthetic.

Local Chromium timings below are medians from three runs per page at 390 CSS pixels without network or CPU throttling. They establish a local baseline for the hosted staging retest.

| View | TTFB | Largest Contentful Paint |
| --- | ---: | ---: |
| Dashboard | 328 ms | 476 ms |
| Journal | 708 ms | 852 ms |
| Goals | 501 ms | 628 ms |

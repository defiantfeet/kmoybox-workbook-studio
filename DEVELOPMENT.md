# Development plan

## Milestones

1. Scaffold Next.js, TypeScript, Tailwind, and a repeatable local Supabase environment.
2. Implement Supabase authentication, account-scoped data, and entitlement-gated content.
3. Build the editorial dashboard and responsive workbook, journal, goal, progress, and library flows.
4. Verify builds, keyboard navigation, persistence, and two-account isolation with automated checks.

## Database schema

| Table | Purpose and keys |
| --- | --- |
| products | Catalog keyed by slug with title, summary and free access flag |
| prompts | Ordered workbook exercises keyed by ID with product foreign key |
| entitlements | Purchased access keyed by user and product, written by trusted administrators |
| responses | Private answers keyed by user and prompt, with completion flag |
| journal_entries | Private entries keyed by ID with owner, title, body and timestamps |
| goals | Private goals keyed by ID with owner, target date and completion flag |

Owned records use Supabase Auth user IDs. RLS restricts private rows to the signed-in owner and gates premium prompts by entitlement. Dashboard and progress use derived counts and per-workbook completion.

## Route map

| Route | Purpose |
| --- | --- |
| / | Growth dashboard |
| /workbooks | Available workbooks |
| /workbooks/[slug] | Guided prompts and completion |
| /journal | View, write and manage entries |
| /goals | Set and manage goals |
| /account | Signed-in profile, purchased library, and sign-out |
| /progress | Workbook and goal completion |
| /library | Purchased products |
| /login | Email and password authentication |
| /auth/confirm | Email confirmation |

## Acceptance criteria

- The studio works at phone and desktop widths, with labeled forms and visible keyboard focus.
- Users can sign in, save and revisit workbook answers, manage journal entries and goals, and see derived progress.
- Users can open entitled products. Account isolation is enforced by the database and private pages require a session.
- Local development works from documented commands with example configuration and seeded content.
- An explicitly enabled development preview uses sample data. The project has no production deployment or production website integration.
- Automated tests cover progress, core browser flows, and database isolation.

## Interactive workbook engine

1. Define and validate a versioned content format for chapter and module titles, ordered lesson and exercise blocks, and stable exercise IDs. Add original sample content for The Dancer Mindset.
2. Add a learner route for structured workbooks, module-level draft responses, completion validation, resume links, and private PDF downloads. Continue serving legacy workbooks at their existing URLs.
3. Add an editor route with workbook creation and form-based module authoring, draft preview, and independent module publishing. Require an explicit Supabase editor grant outside development preview.
4. Verify response saving and resuming, completion, PDF downloads, and draft-to-published behavior in browser tests. Check row-level privileges for learners and editors.

| Route | Purpose |
| --- | --- |
| /workbooks/[slug] | Chapter outline and resumable module reader |
| /workbook-pdf/[slug] | Private PDF download |
| /content-editor | Workbook and draft-module authoring |

| Table | Purpose |
| --- | --- |
| workbook_editor_accounts | Server-managed editor grants |
| engine_workbooks | Workbook metadata |
| engine_modules | Editable module content plus current publication snapshot |
| engine_progress | Per-account, per-module responses with completion tied to the published revision |

Acceptance requires all exercise types to render from structured content, partial answers to survive reload, completion to require all valid answers, draft content to remain private, and member reports to contain only their own saved responses.

## Private journal and goals

1. Extend existing journal and goal records with optional workbook links and mood. Add owner-scoped milestones and timestamped goal activity.
2. Build a debounced, revision-checked journal editor, past-entry search and workbook response links. Build milestone editing and progress history.
3. Add authenticated JSON export and an explicitly confirmed personal activity reset. Preserve the account and purchase record.
4. Verify autosave, search, workbook linking, milestone progress, dashboard totals, and data controls in browser tests. Check ownership and cascade behavior in PostgreSQL.

## Supabase authentication lifecycle

1. Add user-owned profiles with database provisioning and backfill. Keep Auth identities in `auth.users`, purchases in entitlements, and workbook and module access in the existing catalog.
2. Add email-based password recovery and password-confirmed account deletion. Bind recovery to the verified Supabase session and keep the deletion client server-only.
3. Verify cross-account access for profiles, purchases, journals, goals, and progress with synthetic identities. Exercise confirmation, login, recovery, and deletion through Supabase Auth when the local services are available.
4. Document configuration, migrations, backup and restore testing, and the treatment of deleted accounts in retained backups.

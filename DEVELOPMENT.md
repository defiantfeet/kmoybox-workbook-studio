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

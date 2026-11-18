# Arcanix database migration plan

> Nothing in this plan has been executed. Approval is required before creating a Supabase migration, applying SQL, adding buckets, or wiring the frontend to database tables.

## Preconditions

- Confirm the five product assumptions in `architecture.md`, particularly public-discovery access and recruiter role assignment.
- Back up the Supabase project and test on a local/branch database first.
- Confirm the project uses the reviewed publishable key only in the browser and has no secret/service key in `NEXT_PUBLIC_*` environment variables.
- Decide verification document retention, organization ownership transfer procedure, moderation SLA, and whether recruiters require a distinct verified status before role grant.

## Proposed rollout sequence

### Phase 0 — review and test design

Review the ERD, state machines, Storage limits, and RLS matrix with product and security owners. Write pgTAP/Supabase tests for every allow and deny case before execution. No production change.

### Phase 1 — foundations

Create `private` authorization helpers, `games`, `profiles`, `user_roles`, `user_settings`, `organizations`, and `organization_members`. Add the Auth signup trigger that creates a profile, settings, and `player` role after successful user creation. Enable RLS and apply grants/policies in the same migration.

**Gate:** test sign-up profile creation and deny direct role creation/administrator escalation.

### Phase 2 — player identity and media metadata

Create player details/skills/achievements/experience and profile-media metadata. Provision `profile-media` only after its object RLS policies and path rules are reviewed.

**Gate:** test a user can manage only own data and cannot read a private profile’s media.

### Phase 3 — organizations and verification

Create verification requests, document metadata, immutable history, and trusted administrator decision function. Provision `verification-private` only with private object policies.

**Gate:** test no applicant can approve their own request; test every document read path for applicant, unrelated user, organization owner, and administrator.

### Phase 4 — social graph

Create posts/media, likes, comments, follows, connections, saved posts, and `post-media` bucket. Implement visibility policies before any frontend write path.

**Gate:** test public/connections/organization/private feed visibility and reverse duplicate connection prevention.

### Phase 5 — recruitment and notifications

Create opportunities, applications, notifications, reports, and administrative actions. Wire organization member permissions into all recruitment policies.

**Gate:** test applicant-only application reads and organization recruiter-only review rights.

### Phase 6 — application integration

Generate TypeScript database types from the approved schema. Replace static player/tryout data incrementally with queries, server actions, error states, and cursor pagination. Do not change the visual Arcanix design during this phase.

### Phase 7 — launch hardening

Run RLS tests, migration rollback rehearsal, load tests for discovery/feed indexes, Storage abuse tests, and signed URL expiry checks. Configure monitoring and audit retention. Enable production deployment only after security sign-off.

## Migration rules

- One reviewable migration per phase; include schema, indexes, grants, RLS, triggers/functions, and tests together.
- Use a transaction for schema objects where possible. Bucket creation and large backfills require separately documented compensating actions.
- Never alter historical verification or `admin_actions` rows in a destructive migration.
- Prefer additive nullable columns, backfill, validation, then `not null` for future changes.
- Every state-changing RPC/function writes its audit row inside the same transaction.
- Generate types after every approved migration; do not hand-maintain production database types.

## Rollback approach

1. Pause application writes for the affected module.
2. Restore the previous deployment and retain the forward migration record.
3. Use a specifically reviewed compensating migration; do not run `drop ... cascade` in production as a generic rollback.
4. Preserve verification/audit evidence and Storage objects until retention review is complete.

## Approval checkpoints

The following require explicit approval before any implementation action:

- Applying the proposed SQL or creating a `supabase/migrations` file.
- Creating the three buckets or any Storage object policy.
- Enabling signup triggers, role-management functions, or administrator workflow functions.
- Connecting frontend components to profile, post, opportunity, or application tables.
- Creating test accounts or importing/seed data.

## Task 1B pre-implementation gates

The review SQL must not be moved into `supabase/migrations` until these corrections are represented as executable, tested migration steps:

1. Replace the historical role composite primary key with a surrogate role-grant ID plus an active-role partial unique index; add final-admin protection and an audited re-grant transaction.
2. Split internal verification, application, and report review data from applicant/reporter-visible rows. Grant only safe columns or expose security-invoker views; do not rely on RLS to mask columns.
3. Implement one canonical profile-visibility helper and reuse it for all derived player data and profile media.
4. Create owner-transfer, member-invitation, verification-decision, connection-transition, application-status, and signed-URL transactions with row locks and audit writes.
5. Add a connection event history and a defined cooldown/block model, rather than relying on a uniqueness index alone.
6. Create all bucket policies and metadata constraints in the same approved release; test URL/path tampering and direct `storage.objects` access.
7. Write and pass the explicit allow/deny cases in `security-review.md` before production deployment.

No implementation phase may begin with “representative” RLS. Every client-granted table must have complete operation-specific policies, column grants, and denial tests in the approved migration.

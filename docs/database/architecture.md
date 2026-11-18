# Arcanix PostgreSQL architecture (review draft)

> Status: design only. This document and the companion SQL are **not applied** to Supabase.

## Scope and findings

The current application has Supabase Auth, browser/server SSR clients, a code-exchange callback, and a session-refresh proxy. It has no application-table queries, schema, generated database types, storage buckets, or existing database migration. The player directory, tryouts, profile panel, posts, and recruitment cards are presentational data. This design is therefore additive; it does not replace the Next.js application or alter its navy/lime/coral player-first UI.

### Assumptions to confirm before implementation

1. A newly confirmed user receives the `player` role and an empty profile. `recruiter` is an administrator-granted role after review; `admin` is never client assignable.
2. Clubs are `organizations`; an organization can have several authorized members. There is no separate “club login”.
3. Profile and post media are served from private buckets using short-lived signed URLs so profile visibility and post visibility can be enforced. There is no public bucket in the first release.
4. Public discovery means `profiles.is_discoverable = true`; anonymous browsing is intentionally not enabled in the initial policy set. This can be relaxed later with a deliberate `anon` read policy.
5. Game names are controlled through `games`; game-specific rank systems remain display values until a future ranked-game rules module is approved.

## Global conventions

- All application tables are in `public`; authorization helper functions live in unexposed `private`.
- IDs are `uuid primary key default gen_random_uuid()` unless a join table uses a composite primary key.
- Every time is `timestamptz`, stored in UTC. Mutable entities have `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()` updated by a trigger.
- `auth.users` owns identity, password hashes, sessions, email confirmation, and MFA. No public table has a password column.
- FKs to a person point to `public.profiles(id)`, whose `id` is exactly `auth.users.id`. Application data always follows user deletion through `profiles`.
- Text states use `check` constraints rather than PostgreSQL enums so rollout can be managed through reviewed migrations. Free-form text is trimmed/validated in application code; critical state rules are duplicated in the database.
- `jsonb` is used only for extensible, non-query-critical payloads (notification context, administrative metadata). It is not a replacement for relational fields.
- All exposed tables have RLS enabled and least-privilege grants. No policy trusts editable `raw_user_meta_data`.

## Identity and access

### `profiles`

| Column | Definition |
|---|---|
| `id` | `uuid` PK, FK `auth.users(id) on delete cascade` |
| `handle` | `text not null`; case-insensitive unique index on `lower(handle)`; check `^[a-z0-9_]{3,30}$` |
| `display_name` | `text not null` |
| `headline`, `bio`, `city`, `country_code` | nullable `text`; `country_code` check two uppercase letters when present |
| `is_discoverable` | `boolean not null default true` |
| `is_suspended` | `boolean not null default false`; administrator-only change |
| `deleted_at` | nullable `timestamptz` for soft-hide before Auth deletion |
| timestamps | `created_at`, `updated_at` not null |

Indexes: unique `lower(handle)`; discovery index `(is_discoverable, is_suspended, updated_at desc) where deleted_at is null`.

### `user_roles`

`id uuid primary key`; `user_id uuid not null references profiles(id) on delete cascade`; `role text not null check (role in ('player','recruiter','admin'))`; `granted_by uuid references profiles(id) on delete set null`; `granted_at timestamptz not null default now()`; `revoked_by uuid references profiles(id) on delete set null`; `revoked_at timestamptz`; `revocation_reason text`; `note text`. A partial unique index on `(user_id, role) where revoked_at is null` permits role revocation and later re-granting while preserving lifecycle history.

Deletion: roles disappear with the profile. Only trusted administrator operations may insert, change, or revoke roles. The signup trigger creates the initial active `player` row; it cannot create recruiter/admin rows. A deferred transaction-safe guard rejects revocation/deletion of the last active administrator; bootstrap and break-glass administrator assignment are manual, audited deployment operations.

### `user_settings`

`profile_id uuid primary key references profiles(id) on delete cascade`; `profile_visibility text not null default 'public' check ('public','members','private')`; `allow_messages boolean not null default true`; `notify_email boolean not null default true`; `notify_push boolean not null default true`; `locale text not null default 'en-IN'`; timestamps. Exactly one row per profile; created by the same trusted signup trigger.

## Organizations and player data

### `games` (controlled catalogue)

`id uuid PK`; `slug text not null unique`; `name text not null unique`; `is_active boolean not null default true`; `created_at timestamptz`. This additional table prevents inconsistent game strings and enables indexed discovery. Only administrators/trusted deployment code manage it; authenticated users may read active rows.

### `organizations`

`id uuid PK`; `slug text not null` with unique `lower(slug)` index; `name text not null`; `description text`; `region_code text`; `website_url text`; `created_by uuid not null references profiles(id) on delete restrict`; `verification_status text not null default 'unverified' check ('unverified','pending','verified','rejected')`; `is_active boolean not null default true`; timestamps.

Deletion: organizations are not hard-deleted while opportunities or verification history exist; use `is_active = false`. A creator may be removed only after ownership transfer. Indexes: `(is_active, verification_status, created_at desc)`, `lower(slug)` unique.

### `organization_members`

`organization_id uuid not null references organizations(id) on delete cascade`; `profile_id uuid not null references profiles(id) on delete cascade`; `membership_role text not null check ('owner','admin','recruiter','editor','member')`; `status text not null default 'active' check ('invited','active','removed')`; `granted_by uuid references profiles(id) on delete set null`; timestamps; PK `(organization_id, profile_id)`.

Indexes: `(profile_id, status, organization_id)` and `(organization_id, membership_role) where status='active'`. At least one active owner must remain; enforce through a deferred trigger in the implementation migration.

### `player_details`

One-to-one extension: `profile_id uuid primary key references profiles(id) on delete cascade`; `primary_game_id uuid references games(id) on delete set null`; `primary_role text`; `rank_label text`; `availability text not null default 'open' check ('open','limited','not_looking')`; `birth_year smallint` (optional, check sensible age range); `pronouns text`; `languages text[] not null default '{}'`; `looking_for text[] not null default '{}'`; timestamps.

Index `(primary_game_id, availability, profile_id)` supports discovery filters.

### `player_skills`

`id uuid PK`; `profile_id uuid not null references profiles(id) on delete cascade`; `game_id uuid not null references games(id) on delete restrict`; `role_name text not null`; `rank_label text`; `years_experience numeric(4,1)` check `>= 0`; `is_primary boolean not null default false`; timestamps. Unique `(profile_id, game_id, role_name)`. Partial unique index `(profile_id) where is_primary` permits one featured skill. Discovery index `(game_id, role_name, rank_label, profile_id)`.

### `player_achievements`

`id uuid PK`; `profile_id uuid not null references profiles(id) on delete cascade`; `game_id uuid references games(id) on delete set null`; `title text not null`; `issuer text`; `achieved_on date`; `placement text`; `evidence_url text`; timestamps. Index `(profile_id, achieved_on desc nulls last)`.

### `player_experience`

`id uuid PK`; `profile_id uuid not null references profiles(id) on delete cascade`; `organization_id uuid references organizations(id) on delete set null`; `team_name text`; `title text not null`; `game_id uuid references games(id) on delete set null`; `started_on date`; `ended_on date`; `is_current boolean not null default false`; `description text`; timestamps. Check `ended_on is null or started_on is null or ended_on >= started_on`; index `(profile_id, is_current desc, started_on desc nulls last)`.

### `profile_media` (additional, justified metadata table)

`id uuid PK`; `profile_id uuid not null references profiles(id) on delete cascade`; `bucket_id text not null check (bucket_id='profile-media')`; `storage_path text not null`; `media_kind text not null check ('image','video')`; `mime_type text not null`; `byte_size bigint not null check (byte_size > 0)`; `width integer`; `height integer`; `duration_ms integer`; `purpose text not null check ('avatar','banner','highlight')`; `is_primary boolean not null default false`; timestamps. Check image rows have dimensions; video rows have positive duration. Unique `(bucket_id, storage_path)` and partial unique `(profile_id, purpose) where is_primary`. Storage objects are deleted only by an approved retention worker after metadata deletion.

## Verification

### `verification_requests`

| Column | Definition |
|---|---|
| `id` | UUID PK |
| `requested_by` | UUID not null FK `profiles` restrict |
| `subject_profile_id` | nullable UUID FK `profiles` cascade |
| `subject_organization_id` | nullable UUID FK `organizations` restrict |
| `verification_kind` | text not null check (`player`,`recruiter`,`organization`) |
| `status` | text not null default `pending` check (`pending`,`approved`,`rejected`,`withdrawn`) |
| `submission_number` | `integer not null default 1 check (submission_number > 0)` |
| `applicant_note` | nullable text |
| `reviewed_by` | nullable UUID FK `profiles` set null |
| `reviewed_at` | nullable timestamptz |
| timestamps | created/updated |

Check: player/recruiter requests have only `subject_profile_id`; organization requests have only `subject_organization_id`. `requested_by` must be the subject profile or an active organization member; enforce with a trigger/function. Partial unique indexes prevent more than one pending request per subject and kind. An approved request updates the derived profile/organization verification status inside the same reviewed transaction; a submission never self-verifies.

### `verification_history`

Immutable applicant-visible audit table: `id uuid PK`; `request_id uuid not null references verification_requests(id) on delete restrict`; `action text not null check ('submitted','resubmitted','approved','rejected','withdrawn','appeal_opened')`; `from_status text`; `to_status text`; `actor_id uuid references profiles(id) on delete set null`; `applicant_message text`; `created_at timestamptz not null default now()`. Index `(request_id, created_at desc)`. It contains no administrator-only field and has no update/delete grant for application roles.

### `verification_review_notes` (additional, justified privacy split)

`id uuid PK`; `request_id uuid not null references verification_requests(id) on delete restrict`; `author_id uuid references profiles(id) on delete set null`; `note text not null`; `created_at timestamptz not null default now()`. This append-only table replaces the former unsafe `admin_note`/`internal_note` columns. It is readable and insertable only by administrators; applicants never receive it through a raw table or view.

### `verification_documents` (additional, justified private-media metadata)

`id uuid PK`; `request_id uuid not null references verification_requests(id) on delete cascade`; `bucket_id text not null check (bucket_id='verification-private')`; `storage_path text not null`; `document_type text not null`; `mime_type text not null`; `byte_size bigint not null check (byte_size > 0)`; `uploaded_by uuid not null references profiles(id) on delete restrict`; `created_at timestamptz not null default now()`. Unique `(bucket_id, storage_path)`; no public URL is stored. Index `(request_id, created_at desc)`.

## Social network

### `posts`

`id uuid PK`; `author_id uuid not null references profiles(id) on delete cascade`; `organization_id uuid references organizations(id) on delete set null`; `body text not null check (char_length(body) between 1 and 5000)`; `visibility text not null default 'public' check ('public','connections','organization','private')`; `commenting text not null default 'everyone' check ('everyone','connections','none')`; `is_pinned boolean not null default false`; `deleted_at timestamptz`; timestamps.

Indexes: `(author_id, created_at desc) where deleted_at is null`; public-feed `(visibility, created_at desc) where deleted_at is null`; organization-feed `(organization_id, created_at desc) where deleted_at is null`. An organization post retains its human `author_id` for audit; authorization to set `organization_id` requires an eligible active membership.

### `post_media`

`id uuid PK`; `post_id uuid not null references posts(id) on delete cascade`; `bucket_id text not null check (bucket_id='post-media')`; `storage_path text not null`; `media_kind text not null check ('image','video')`; `mime_type text not null`; `byte_size bigint not null check (byte_size > 0)`; `width integer`; `height integer`; `duration_ms integer`; `position smallint not null check (position between 0 and 9)`; `alt_text text`; timestamps. Unique `(bucket_id, storage_path)` and `(post_id, position)`; media dimension/duration checks match `profile_media`.

### `likes`

Join table: `post_id uuid references posts(id) on delete cascade`; `profile_id uuid references profiles(id) on delete cascade`; `created_at timestamptz not null default now()`; primary key `(post_id, profile_id)`. This prevents duplicate likes. Index `(profile_id, created_at desc)` for “liked by me”.

### `comments`

`id uuid PK`; `post_id uuid not null references posts(id) on delete cascade`; `author_id uuid not null references profiles(id) on delete cascade`; `parent_id uuid references comments(id) on delete set null`; `body text not null check (char_length(body) between 1 and 2000)`; `deleted_at timestamptz`; timestamps. Index `(post_id, created_at asc) where deleted_at is null`; `(parent_id, created_at asc)`. A trigger ensures a parent comment belongs to the same post.

### `follows`

`follower_id uuid references profiles(id) on delete cascade`; `followed_id uuid references profiles(id) on delete cascade`; `created_at timestamptz not null default now()`; PK `(follower_id, followed_id)`; check `follower_id <> followed_id`. Index `(followed_id, created_at desc)`. Follows are intentionally independent of `connections`.

### `connections`

`id uuid PK`; `requester_id uuid not null references profiles(id) on delete cascade`; `recipient_id uuid not null references profiles(id) on delete cascade`; `status text not null default 'pending' check ('pending','accepted','declined','blocked','cancelled')`; `responded_at timestamptz`; `blocked_by uuid references profiles(id) on delete set null`; timestamps; check requester and recipient differ. A unique expression index on `least(requester_id, recipient_id), greatest(requester_id, recipient_id)` prevents simultaneous/reverse duplicates. Index `(recipient_id, status, created_at desc)`.

`connection_events` is an append-only additional audit table (`connection_id`, actor, action, created_at). A trusted `request_connection` transaction locks the canonical pair. It creates a pending row when absent, permits reopening a declined/cancelled request after a 30-day cooldown, and adds an event. A blocked relationship cannot be reopened until the blocker explicitly unblocks it; the UI never discloses who blocked whom. Only the recipient accepts/declines, the requester cancels pending, and either participant can block.

### `saved_posts`

`profile_id uuid references profiles(id) on delete cascade`; `post_id uuid references posts(id) on delete cascade`; `created_at timestamptz not null default now()`; PK `(profile_id, post_id)`. Index `(profile_id, created_at desc)`.

## Recruitment and platform operations

### `opportunities`

`id uuid PK`; `organization_id uuid not null references organizations(id) on delete restrict`; `created_by uuid not null references profiles(id) on delete restrict`; `game_id uuid references games(id) on delete set null`; `title text not null`; `description text not null`; `role_name text`; `location_type text not null default 'remote' check ('remote','hybrid','on_site')`; `region_code text`; `status text not null default 'draft' check ('draft','published','paused','closed')`; `openings smallint not null default 1 check (openings > 0)`; `closes_at timestamptz`; timestamps.

Indexes: public discovery `(status, game_id, created_at desc) where status='published'`; organization management `(organization_id, status, created_at desc)`; optional region `(region_code, created_at desc)`. Closing is stateful, not hard deletion, once applications exist.

### `applications`

`id uuid PK`; `opportunity_id uuid not null references opportunities(id) on delete cascade`; `applicant_id uuid not null references profiles(id) on delete cascade`; `cover_note text`; `status text not null default 'submitted' check ('submitted','under_review','interview','offered','rejected','withdrawn')`; `withdrawn_at timestamptz`; timestamps. Unique `(opportunity_id, applicant_id)` prevents duplicate applications. Indexes `(applicant_id, created_at desc)` and `(opportunity_id, status, created_at desc)`.

`application_reviews` is an administrator/recruiter-only additional table: `id`, `application_id`, `reviewer_id`, `from_status`, `to_status`, `internal_note`, `created_at`. Applicants see the status on `applications`, but never reviewer identity or internal notes. Applicants can edit only `cover_note` while status is `submitted`, or withdraw via a trusted transaction. Authorized opportunity managers alone change status and insert internal review records.

### `notifications`

`id uuid PK`; `recipient_id uuid not null references profiles(id) on delete cascade`; `actor_id uuid references profiles(id) on delete set null`; `type text not null`; `payload jsonb not null default '{}'::jsonb`; `read_at timestamptz`; `created_at timestamptz not null default now()`. Index `(recipient_id, read_at, created_at desc)`; recipients may mark only their own notification read. System notifications have null actor.

### `reports`

`id uuid PK`; `reporter_id uuid not null references profiles(id) on delete restrict`; `subject_profile_id uuid references profiles(id) on delete set null`; `subject_post_id uuid references posts(id) on delete set null`; `subject_comment_id uuid references comments(id) on delete set null`; `subject_opportunity_id uuid references opportunities(id) on delete set null`; `reason text not null`; `detail text`; `status text not null default 'open' check ('open','investigating','resolved','dismissed')`; timestamps. Check `num_nonnulls(subject_profile_id, subject_post_id, subject_comment_id, subject_opportunity_id)=1`; index `(status, created_at asc)` for queues.

`report_reviews` is the administrator-only companion: `id`, `report_id`, `reviewer_id`, `from_status`, `to_status`, `internal_note`, `created_at`. This split prevents reporters from receiving reviewer identity or internal notes; RLS alone cannot hide selected columns on a raw table.

### `admin_actions`

Append-only audit: `id uuid PK`; `actor_id uuid references profiles(id) on delete set null`; `action_type text not null`; `target_profile_id uuid references profiles(id) on delete set null`; `target_organization_id uuid references organizations(id) on delete set null`; `target_verification_request_id uuid references verification_requests(id) on delete set null`; `target_report_id uuid references reports(id) on delete set null`; `metadata jsonb not null default '{}'::jsonb`; `created_at timestamptz not null default now()`. Check at most one target using `num_nonnulls(...) <= 1`; indexes `(actor_id, created_at desc)` and `(created_at desc)`. Application roles receive no update/delete policy.

## Relationship, indexing, and deletion strategy

- `auth.users → profiles` is 1:1 with cascade. Profile-owned child rows cascade; immutable administrator records retain a nullable actor reference where history matters.
- `profiles ↔ organizations` is many-to-many via `organization_members`; organizations are soft-deactivated rather than deleted when referenced.
- `profiles → posts/opportunities` preserves an accountable author/creator, even for organization-scoped content.
- High-volume feeds are ordered with `(filter columns, created_at desc, id desc)` at query time. The implementation should use cursor pagination on `(created_at, id)`, never offset pagination for unbounded feeds.
- No user-visible counter is the source of truth. Like/comment/follower counts may be cached later through a worker/materialized view only after correctness and RLS review.
- Deleting a post cascades its likes, comments, saves, and metadata; physical Storage cleanup must run out-of-band after a retention period. Deleting a user cascades their owned social rows but reports/history retain nullable actor data where necessary.

## Trusted operations and security boundary

The initial migration should create narrowly scoped `private` `security definer` helpers such as `is_admin()`, `has_active_role(role)`, `is_active_org_member(org_id, allowed_roles)`, `can_view_profile(profile_id)`, and `can_view_post(post_id)`. They must pin `search_path = ''`, schema-qualify every object, live outside the exposed API schemas, have `execute` revoked from `public`, and be granted only to `authenticated` when a policy needs them. They return booleans/IDs only for `auth.uid()` and never accept an arbitrary actor ID. This avoids recursive RLS membership queries without creating an authorization bypass.

`auth.uid()` is the row owner input for client requests. RLS enforces row access even if a client bypasses frontend controls. Trusted server-side operations are limited to actions that cannot safely be expressed as direct client writes: creating initial profile/settings/player role from an Auth trigger, administrator role grants, verification decisions, audit rows, and signed-URL issuance after authorization. Any secret/service key used for such operations must be server-only; it is never a `NEXT_PUBLIC_` value and is never shipped to the browser.

## Explicitly excluded

No review/ratings table, Google Forms integration, survey-response import, password field, password hash, migration execution, bucket creation, seed data, or frontend modification is part of this task.

## Task 1B security corrections

### Effective profile visibility

`is_discoverable` controls **search/list discovery only**. It does not override a profile owner's privacy setting. `user_settings.profile_visibility` controls direct profile access:

| Actor | `public` | `members` | `private` |
|---|---|---|---|
| Owner / administrator | Full profile | Full profile | Full profile |
| Accepted connection | Full profile | Full profile | Denied |
| Shared active organization member | Full profile | Full profile | Denied |
| Unrelated authenticated user | Full profile | Denied | Denied |
| Anonymous user | Denied in all cases | Denied | Denied |

Discovery includes only signed-in viewers and profiles with `is_discoverable=true`, no suspension, and effective visibility `public`. Player details, skills, achievements, experience, and profile media inherit this exact access rule. Media is never public solely because its object path is known.

### Column-level protection and safe write surfaces

RLS decides rows, not columns. Before implementation, revoke broad `update`/`insert` grants and use either explicit column grants or trusted transactions/RPCs:

| Relation | Client-writable fields | Protected fields / write mechanism |
|---|---|---|
| `profiles` | handle, display_name, headline, bio, city, country_code, is_discoverable | id, is_suspended, deleted_at, timestamps: trigger/admin only |
| `user_roles` | none | all: signup trigger or audited admin role transaction |
| `verification_requests` | applicant note at submit; withdrawal through RPC | subject identity, status, reviewer fields, timestamps: trusted transaction only |
| `verification_history`, `verification_review_notes` | none | all append-only trusted verification transaction |
| `organization_members` | invitation acceptance only through RPC | role, status, grantor, timestamps: owner/admin ownership transaction |
| `applications` | cover_note while submitted; withdrawal through RPC | applicant/opportunity IDs, status, timestamps: trusted transaction; internal notes reside in `application_reviews` |
| `notifications` | read_at only | recipient, actor, type, payload, timestamps: trusted event producer |
| `reports` | reason/detail at insert; optional withdrawal RPC | target IDs, status, timestamps: trusted report/moderation transaction; review data is `report_reviews` |

`select` access to review tables is administrator-only. Client-facing report/application histories should use security-invoker views or narrowly scoped RPCs that project only safe columns; raw internal tables are never granted to regular authenticated users.

### Transaction-only operations

The following are one transaction with row locks and audit records: role grant/revoke/re-grant; final-admin guard; organization ownership transfer/invitation acceptance/removal; verification review/resubmission/withdrawal/appeal; connection transitions; application status transition; report resolution; and Storage signed-URL authorization. Server-only application code validates request shape and MIME sniffing, but authorization and invariants remain in database transactions/RLS.

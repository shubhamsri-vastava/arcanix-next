# Arcanix RLS policy matrix

> Design contract only; this matrix is not proof that every operation exists in the checked-in migrations or has passed runtime tests. As of 2026-11-18, the migrations have no trusted role-grant or verification-review functions, and no organization member creation/invitation/acceptance/removal flow (ownership transfer is present). The original connection policies let a requester self-accept by updating or inserting an accepted row. Migration `202611180002_connection_update_authorization.sql` prepares a local correction but is not applied or runtime-tested.

## Shared authorization predicates

The authorization migration currently defines these non-exposed helper predicates with `set search_path = ''`:

- `private.actor_is_active()` — current profile exists and is not suspended or deleted.
- `private.is_admin()` — active `admin` role for `auth.uid()`.
- `private.is_org_member(org_id uuid, roles text[])` — current user is an active member with an allowed role.
- `private.is_connected(a uuid, b uuid)` — an accepted connection exists between the profiles.
- `private.can_view_profile(profile_id uuid)` — the viewer is allowed by the profile visibility setting.
- `private.can_view_post(post_id uuid)` — the viewer is allowed by post visibility.
- `private.can_manage_opportunity(opportunity_id uuid)` — viewer has a permitted organization role.

No helper reads editable user metadata. Helpers exist to avoid recursive RLS policies and are never placed in an API-exposed schema.

## Identity, organization, and player data

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Signed-in users: discoverable, non-suspended profiles plus self; administrators all | Trusted signup trigger only | Self, excluding `id`, `is_suspended`, and verification-derived fields; admin may suspend | No direct client delete; account-deletion workflow only |
| `user_roles` | Self may read active roles; admin reads all | Trusted trigger/admin only | Admin only; users cannot grant/revoke roles | Admin only; never allow removal of final admin/organization owner without checks |
| `user_settings` | Self only | Trusted signup trigger only | Self only | No direct delete |
| `games` | Authenticated users read active games | Admin/trusted deployment only | Admin/trusted deployment only | Admin/trusted deployment only, restrict if referenced |
| `organizations` | Authenticated users read active organizations; inactive only members/admin | Active owner/admin/recruiter may create; creator becomes owner transactionally | Active `owner`/`admin`; admin override | No client hard delete; admin may deactivate |
| `organization_members` | Active members of same org and admin | Org `owner`/`admin`; invitation flow may add invited rows | Org owner/admin; a member may accept own invitation only; role/status changes restricted | Org owner/admin; preserve final owner invariant |
| `player_details` | Same visibility as parent profile | Self | Self | Self |
| `player_skills` | Same visibility as parent profile | Self as `profile_id=auth.uid()` | Self | Self |
| `player_achievements` | Same visibility as parent profile | Self | Self | Self |
| `player_experience` | Same visibility as parent profile | Self | Self | Self |
| `profile_media` | Same visibility as parent profile; signed URL only after metadata authorization | Self, only own `profile-media/<uid>/...` path | Self, only own metadata | Self; Storage-object delete has matching policy |

## Verification and private documents

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `verification_requests` | Applicant/target profile; authorized subject-organization members; administrators | Applicant for own profile/recruiter request; active org owner/admin for own organization request | Applicant may withdraw an own pending request only; administrator makes review decisions | Applicant may delete only own unreviewed draft if drafts are introduced; otherwise no client delete |
| `verification_history` | Applicant/subject organization authorized members and admins; contains no internal note | Trusted transaction only | None (append-only) | None |
| `verification_documents` | Applicant who submitted it and admins; organization documents also authorized owner/admin | Applicant/authorized organization owner-admin, constrained to request and private path | No metadata mutation after submit; replacement is new row | Applicant only while request remains pending; admin may remove unsafe content |

Important: no policy allows `reviewed_by = auth.uid()` or `status='approved'` from an applicant update. The verification transaction checks `private.is_admin()`, writes history and `admin_actions`, then changes the request state atomically.

## Social graph and content

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `posts` | `private`: author/admin; `connections`: author, accepted connection, admin; `organization`: active organization members/admin; `public`: authenticated viewers | Self as author; `organization_id` requires eligible active organization membership | Author only; organization membership still required when scoped; admin moderation only through trusted flow | Author soft-deletes own post; admin moderation flow |
| `post_media` | Only when `private.can_view_post(post_id)` | Post author, before/with own post, only own `post-media/<uid>/...` path | Post author only | Post author; matching Storage delete policy |
| `likes` | Viewable when post is viewable | `profile_id=auth.uid()` and post viewable | None | Self only |
| `comments` | Viewable when post is viewable and post allows comments | `author_id=auth.uid()`, post is visible, and comment policy permits | Author only; body only, no reassignment | Author soft-deletes; admin moderation workflow |
| `follows` | Follower/followed participants; optionally public count via safe aggregate later | `follower_id=auth.uid()` and not self | None | Follower only |
| `connections` | Requester, recipient, administrator | `requester_id=auth.uid()`, recipient different, canonical pair absent | Recipient may accept/decline; requester may cancel pending; either participant may block their relationship | Requester cancels only pending request; administrator moderation |
| `saved_posts` | Self only | `profile_id=auth.uid()` and post viewable | None | Self only |

## Recruitment and platform operations

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `opportunities` | Published active opportunities to authenticated users; draft/paused/closed only authorized org members/admin | Active org `owner`/`admin`/`recruiter`; `created_by=auth.uid()` | Same authorized roles, restricted to its organization | Same authorized roles only while no accepted application; otherwise close instead |
| `applications` | Applicant reads own; authorized opportunity managers/admin read applications for their opportunity | Applicant only, own ID, opportunity published/open, one per opportunity | Applicant may withdraw/adjust own pending application; authorized recruiter/owner/admin may move review status and add recruiter note | Applicant may delete/withdraw only before review if product permits; otherwise status change |
| `notifications` | Recipient only; admin only for incident response | Trusted event function/service transaction only | Recipient may set own `read_at`; no payload/recipient change | Recipient may dismiss own row |
| `reports` | Reporter sees own submission without internal fields; administrator sees all | `reporter_id=auth.uid()`, exactly one allowed target, cannot report a hidden resource user cannot see | Administrator changes status/review fields; reporter may only withdraw an open own report if enabled | Reporter only for open own report; admin retention rules otherwise |
| `admin_actions` | Administrator only | Trusted administrator transaction only | None | None |

## Storage object policies

Storage is private by default. `storage.objects` policies must verify both the bucket and path prefix, then the related metadata/ownership predicate:

- `profile-media`: owner can upload/delete only `profile-media/<auth.uid()>/<uuid>.<ext>`; read requires allowed profile visibility.
- `post-media`: uploader/author can write only `post-media/<auth.uid()>/<uuid>.<ext>`; read requires `private.can_view_post` via the corresponding metadata row.
- `verification-private`: requester or active subject-org owner/admin can upload only `verification-private/<request-id>/<uuid>.<ext>` while pending; read and delete only applicant/authorized admin. No public read policy.

Use signed URLs after the metadata authorization check. Do not make the verification bucket public. Storage RLS is mandatory because private-bucket downloads are subject to `storage.objects` policies. [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

## Grants, testing, and trusted operations

1. Revoke default table privileges from `anon` and `authenticated`; grant only the operations named above. RLS policies do not compensate for overly broad grants.
2. Enable RLS before any client-facing grant. The migration must include allow and deny tests for every operation and relevant actor (anonymous, owner, unrelated user, member, recruiter, administrator).
3. The Auth signup trigger and administrator review transaction run with narrowly scoped database ownership. Secret/service credentials, if needed for administrative backend jobs, remain server-only and never use `NEXT_PUBLIC_*` variables.
4. A user JWT identifies a user; it does not grant a role. Authorization always rechecks active roles/membership in the database. This avoids stale JWT role claims and user-editable metadata escalation.

Supabase recommends RLS plus explicit grants for exposed tables, and `auth.uid()` for authenticated ownership checks. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Task 1B authoritative corrections

This section supersedes any earlier shorthand in this matrix.

### Profile and derived-data visibility

`private.can_view_profile(target_profile_id)` implements the following policy: owner and administrator always read; for non-suspended profiles, `public` is readable by authenticated users, `members` only by an accepted connection or a user sharing an active organization, and `private` by neither. Anonymous reads are denied. `is_discoverable` is applied only to search/directory queries, where it must be true and effective visibility must be `public`.

`player_details`, `player_skills`, `player_achievements`, `player_experience`, and `profile_media` call the same helper. A user cannot bypass profile privacy by selecting a child table directly.

### Internal/private splits and column grants

RLS does not hide individual columns. Therefore the following tables are split or only accessed through a safe projection:

| Public-facing relation | Private companion / safe write path | Regular client access |
|---|---|---|
| `verification_requests` | `verification_review_notes`; review/status RPC | submit own allowed fields; view own safe request/history; no raw review note |
| `applications` | `application_reviews`; status-transition RPC | create own; update only `cover_note` while submitted; withdraw own through RPC |
| `reports` | `report_reviews`; moderation RPC | create own report; read own safe projection; no reviewer identity/note |
| `notifications` | event producer only | select own; `update(read_at)` only |
| `organization_members` | ownership/invitation RPC | read eligible membership; accept own invitation only |
| `user_roles` | Auth trigger/admin role RPC | read own active roles; no client writes |

Required grants include `revoke update on public.profiles from authenticated` followed by explicit `grant update (handle, display_name, headline, bio, city, country_code, is_discoverable)`; similarly, notifications grant only `update(read_at)`. Review tables, internal metadata, and raw moderation tables receive no direct regular-user table grant.

### Role and ownership invariants

- `user_roles` has a surrogate `id` and a unique **partial** active-role index, never a `(user_id, role)` primary key. A revocation closes one row; a later approved grant inserts a new active row.
- No client policy permits insert/update/delete on `user_roles`. The role RPC/trusted transaction checks `private.is_admin()`, locks the subject role rows, writes an `admin_actions` record, and rejects removal/revocation of the final active administrator.
- Organization membership status/role is never broadly client-updatable. `transfer_organization_ownership` locks all active owners, validates target membership/acceptance, promotes target, then demotes/removes the former owner in one transaction. A deferred trigger rejects any commit with zero active owners.
- Normal members cannot invite, promote, remove, or alter roles. Owners/admins may invite; only owners may transfer ownership; recruiters can manage recruitment but not memberships by default.

### State transition authorization

| Resource | Allowed transition actor | Disallowed client action |
|---|---|---|
| Verification | Applicant submits/withdraws/resubmits through transaction; administrator approves/rejects/records notes | Applicant setting status, reviewer, review timestamp, or notes |
| Connection | Requester creates/cancels; recipient accepts/declines; either participant blocks; trusted transaction handles cooldown/reopen | Reverse duplicate insert, acceptance by requester, block bypass |
| Application | Applicant creates once and withdraws; authorized org owner/admin/recruiter changes review status | Applicant changing status/opportunity/applicant; unrelated recruiter reviewing |
| Opportunity | Organization owner/admin/recruiter with active membership | Member/unrelated user changing a different organization’s opportunity |
| Report | Reporter creates/withdraws own open report; administrator investigates/resolves | Reporter changing status/review fields |

### Suspended-user rule

Every mutating policy/function starts with `not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended)`. A suspended user cannot create/update/delete social, organization, recruitment, verification, report, or Storage objects; select access is limited to account-recovery/privacy data defined by a separate support workflow.

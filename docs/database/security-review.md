# Arcanix security review — Task 1B

> Scope: review documents and unapplied SQL only. No Supabase object, Storage bucket, account, environment variable, frontend file, or authentication implementation was changed.

> Implementation status: these findings record proposed architecture corrections and tests, not proof that the existing migrations implement every item. The current migration set has no trusted role-grant/revoke or verification-decision functions, and the role/verification tables have no client write workflow. Organization ownership transfer exists, but member creation/invitation/acceptance/removal does not. The connection-participant update issue identified in the final review is addressed only by the unapplied migration `202611180002_connection_update_authorization.sql`.

## Findings and corrections

| ID | Finding / severity | Affected area | Risk | Proposed correction | Test / remaining decision |
|---|---|---|---|---|---|
| SR-01 | **High** — composite role PK prevents re-grant | `user_roles` | A revoked recruiter/admin cannot receive that role again without destructive mutation | Surrogate grant ID + partial unique active-role index; retain revocation actor/reason | Revoke recruiter, re-grant, assert one active + two historical rows. No unresolved decision. |
| SR-02 | **Critical** — last admin could be removed | `user_roles`, admin operations | Platform lockout or forced unsafe recovery | Deferred final-active-admin guard; audited admin role transaction; deployment break-glass procedure | Attempt to revoke/delete sole active admin must fail at commit. Decide break-glass operator ownership. |
| SR-03 | **High** — RLS cannot hide review columns | verification, applications, reports | Applicant/reporter could read internal note/reviewer fields in a permitted row | Split into `verification_review_notes`, `application_reviews`, `report_reviews`; safe projections only | Direct raw-table select denied; owner projection excludes notes. No unresolved decision. |
| SR-04 | **High** — broad updates permit protected-field tampering | profiles, memberships, requests, applications, notifications, reports | Self-unsuspension, role/membership escalation, review/status forgery | Revoke broad updates; explicit safe column grants; state changes via trusted transactions | Attempt every protected-column change as owner/member must fail. |
| SR-05 | **High** — visibility fields were ambiguous | profiles and derived player/media tables | Private profile data/media could leak through child-table query | Single effective visibility helper; discovery and direct read separated | Verify all actors in visibility matrix below. Product decision: whether signed-in discovery stays required (current: yes). |
| SR-06 | **High** — Storage path/bucket conflation | all three buckets | Path substitution or direct object URL access | Fixed bucket IDs; constrained object names; metadata path match; private buckets; authorized short signed URLs | Cross-user path tamper, direct download, and URL reuse tests. |
| SR-07 | **High** — verification lifecycle could expose self-review/internal data | requests/history/documents | Self-approval and private-document disclosure | Applicant-visible history separated from notes; review transaction is admin-only | Applicant approval/update and document read deny tests. Appeals/retention remain product decisions. |
| SR-08 | **High** — final organization owner could be removed | membership | Orphaned organization / privilege escalation | Locked ownership-transfer transaction and deferred owner-count guard | Concurrent owner removal/transfer test. Decide ownership transfer notification/acceptance UX. |
| SR-09 | **Medium** — connection uniqueness blocked controlled repeats | connections | Cannot re-request after decline/cancel, or reverse duplicates possible | Canonical current pair + append-only events + 30-day reopen transaction; block is explicit | Test decline/cancel/reopen/cooldown/block. Decide final cooldown duration. |
| SR-10 | **High** — application fields mixed applicant/recruiter authority | applications | Applicant could alter status or see recruiter notes | Internal review table and status-transition transaction | Cross-role status/note tests. No unresolved decision. |
| SR-11 | **High** — unsafe `security definer` usage | `private` helpers | Search-path hijack, recursive RLS, arbitrary-actor bypass | Private schema, schema-qualified references, `search_path=''`, public EXECUTE revoked, helper derives actor from `auth.uid()` | Verify direct public execute denied and each helper cannot act for supplied UUID. |
| SR-12 | **Medium** — suspended accounts not uniformly denied | all write paths and Storage | Suspended users retain action/upload ability | `private.actor_is_active()` required in mutable policies/functions | Suspended actor select/write/upload deny matrix. Account-recovery read path remains a support decision. |

## Explicit allow/deny actor matrix

Legend: **A** allow, **D** deny, **C** allow only under stated condition. “Member” means an active member who is not owner/admin/recruiter.

| Resource / operation | Anonymous | Owner | Unrelated authenticated | Accepted connection | Org member | Org owner/admin | Recruiter | Administrator | Suspended user |
|---|---|---|---|---|---|---|---|---|---|
| Public profile SELECT | D | A | A | A | A | A | A | A | D |
| Members profile SELECT | D | A | D | A | A if shared org | A | A if shared org | A | D |
| Private profile SELECT | D | A | D | D | D | D unless owner | D | A | D |
| Profile UPDATE | D | C safe columns | D | D | D | D | D | C moderation fields | D |
| Player child/media SELECT | D | A | follows parent visibility | follows parent visibility | follows parent visibility | A when parent visible | follows parent visibility | A | D |
| Role INSERT/UPDATE/DELETE | D | D | D | D | D | D | D | C trusted admin transaction | D |
| Organization membership SELECT | D | C same organization | D | D | A same organization | A | A only own recruitment scope | A | D |
| Membership role/status change | D | D | D | D | D | C ownership transaction | D | C audited action | D |
| Verification request SELECT | D | A own/subject | D | D | C authorized subject-org member | A | A | D |
| Verification approval/note/document SELECT | D | D except own safe history/document | D | D | C org document only if authorized | D except allowed org docs | A | D |
| Post SELECT | D | A own | C visibility | C visibility | C organization visibility | A eligible org post | C visibility | A | D |
| Post INSERT/UPDATE/DELETE | D | A own | D | D | D | C eligible organization post | C eligible organization post | C moderation transaction | D |
| Like/follow/save create/delete | D | A own eligible target | A own eligible target | A own eligible target | A own eligible target | A | A | A | D |
| Connection transition | D | C participant-specific | D | C participant-specific | D | D | D | A moderation | D |
| Opportunity SELECT | D | A own org incl drafts | A published | A published | C same org/draft | A own org | A own org | A | D |
| Opportunity INSERT/UPDATE/DELETE | D | D unless authorized org role | D | D | D | A | A active authorized org member | A | D |
| Application SELECT | D | A own | D | D | D | A for own opportunity | A for own opportunity | A | D |
| Application INSERT / applicant update | D | A own eligible opportunity; cover note/withdraw only | D | D | D | D | D | A support action | D |
| Application status/review update | D | D | D | D | D | A own opportunity | A own opportunity | A | D |
| Notification SELECT / mark read | D | A own | D | D | D | D | D | A incident response | D |
| Report create/select | D | A own safe projection | A own safe projection | A own safe projection | A own safe projection | A own safe projection | A own safe projection | A all | D |
| Report review/admin action | D | D | D | D | D | D | D | A | D |

## Required allow/deny test cases

Each test runs as the listed actor against a disposable local/branch database after implementation. There are no production test accounts.

| Test | Actor | Expected result |
|---|---|---|
| Cross-user profile edit | Unrelated authenticated | Deny `update profiles` where `id != auth.uid()` |
| Protected profile field | Profile owner | Deny `is_suspended`, `deleted_at`, `id`, timestamp change despite owning row |
| Role escalation | Profile owner/recruiter | Deny direct insert/update/delete to `user_roles` |
| Re-grant revoked role | Administrator transaction | Revoke then grant recruiter; historical row remains, exactly one active row |
| Final admin protection | Administrator transaction | Revoke/delete final active admin rolls back; second active admin permits transition |
| Internal verification notes | Applicant/unrelated user | Deny review-note table; safe history contains no internal note |
| Self-verification | Applicant | Deny approve/reviewer/status update; only admin transaction succeeds |
| Verification documents | Other authenticated user | Deny `storage.objects` select/download for `verification-private` |
| Object-path tampering | Profile/post owner | Deny access/upload where bucket/path prefix or metadata owner mismatch |
| Forged membership | Normal member | Deny role/status update or invite/promote/removal |
| Final organization owner | Owner/admin transaction | Concurrent removal of final owner fails; atomic transfer succeeds |
| Opportunity edit | Unrelated user/normal member | Deny update/delete; active recruiter of organization succeeds |
| Application status change | Applicant | Deny status/reviewer/internal note change; recruiter of opportunity succeeds |
| Duplicate social actions | Authenticated owner | Duplicate like/follow/save/application and reverse connection insert violate unique constraint/transaction |
| Connection lifecycle | Participants | Recipient accepts/declines; requester cancels; 30-day reopening respected; block suppresses reopen |
| Visibility inheritance | All visibility actors | Child player rows/profile media exactly match parent visibility table |
| Anonymous discovery | Anonymous visitor | Deny all discovery/profile/media reads in initial release |
| Suspended actor | Suspended user | Deny all mutation/upload; deny normal content reads |

## Trusted-function transaction checklist

| Operation | Database transaction / locks | Server-only responsibility |
|---|---|---|
| Role grant/revoke | Lock subject role rows; final-admin constraint; write `admin_actions` | Require administrator session, validate reason |
| Ownership transfer | Lock organization memberships; validate active target; promote then demote; deferred owner guard | Present confirmation / notify parties |
| Verification decision | Lock request; check admin; update status; write visible history + private note + admin action | Validate document scan/appeal payload |
| Connection request | Lock canonical pair; enforce cooldown/block; write event | Rate limit / abuse detection |
| Application review | Lock application/opportunity; check organization role; change status + write internal review | Validate recruiter UI input |
| Signed URL issue | Re-evaluate row authorization before sign; never accept arbitrary key/path | MIME sniffing, scan/transcode orchestration |

## Remaining decisions

1. Verification appeal eligibility, appeal window, and document retention/legal-hold policy.
2. Exact connection re-request cooldown (30 days proposed) and unblock semantics.
3. Organization ownership transfer UX: invite-first versus existing active member only.
4. Suspension support/recovery access and audit retention duration.
5. Final limits for image dimensions, video duration, and file size before buckets exist.

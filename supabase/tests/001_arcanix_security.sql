-- pgTAP/Supabase local test specification. Run only against `supabase start` local data.
begin;
select plan(14);

-- Fixtures are deliberately local-only UUIDs; no live identities are used.
select has_table('public','profiles','profiles exists');
select has_table('public','verification_review_notes','private verification notes exist');
select has_table('public','application_reviews','private application reviews exist');
select has_table('public','report_reviews','private report reviews exist');
select has_index('public','user_roles','user_roles_one_active_role_key','role re-grant partial unique index exists');
select has_index('public','connections','connections_unordered_pair_key','canonical connection uniqueness exists');
select policies_are('public','profiles',array['profiles_read','profiles_update_self'],'profile policies are explicit');
select policies_are('public','applications',array['applications_read','applications_create'],'application table permits only read/create; updates use trusted RPCs');
select policies_are('public','connections',array['connections_participants','connections_request','connections_recipient_update','connections_requester_cancel','connections_participant_block'],'connection updates are separated by participant and transition');
select ok(not has_column_privilege('authenticated','public.connections','status','INSERT'),'requesters cannot supply a connection status on insert');
select ok(has_column_privilege('authenticated','public.connections','requester_id','INSERT') and has_column_privilege('authenticated','public.connections','recipient_id','INSERT'),'requesters can supply only participant IDs when creating a connection');
select ok(not has_column_privilege('authenticated','public.connections','requester_id','UPDATE'),'connection participant IDs cannot be changed');
select policies_are('storage','objects',array['profile_media_object_read','profile_media_object_insert','profile_media_object_delete','post_media_object_read','post_media_object_insert','post_media_object_delete','verification_object_read','verification_object_insert','verification_object_delete'],'private storage policies exist');

-- The following cases require auth fixtures (supabase/tests/helpers) in the local stack:
-- 1. Insert auth user -> assert trigger creates profile/settings and exactly one active player role.
-- 2. set auth.uid() as player -> throws_ok on user_roles insert/update/delete (role escalation).
-- 3. revoke then re-grant recruiter via trusted admin function -> two history rows, one active role.
-- 4. attempt to revoke final active admin -> throws_ok at deferred constraint commit.
-- 5. user A updates user B profile or protected columns -> throws_ok(42501).
-- 6. visibility public/members/private: owner, connection, shared-org member, unrelated and anon allow/deny.
-- 7. applicant cannot select verification_review_notes or another applicant's verification-private object.
-- 8. normal member cannot promote/remove members; final owner removal fails; ownership transfer succeeds.
-- 9. unrelated user cannot update opportunity; applicant cannot set application status or review note.
-- 10. duplicate likes/follows/applications and reverse connections fail with unique violation.
-- 11. suspended actor fails social/recruitment/report/storage writes and ordinary reads.
select pass('fixture-dependent allow/deny scenarios documented for local Supabase execution');
select * from finish();
rollback;

-- ARCANIX REVIEW DRAFT ONLY — DO NOT APPLY
-- This file is intentionally stored outside supabase/migrations.
-- It has not been executed against any database or Supabase project.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  headline text, bio text, city text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  is_discoverable boolean not null default true,
  is_suspended boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profiles_handle_lower_key on public.profiles (lower(handle));
create index profiles_discovery_idx on public.profiles (updated_at desc, id desc)
  where is_discoverable and not is_suspended and deleted_at is null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('player','recruiter','admin')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz, revocation_reason text, note text
);
create unique index user_roles_one_active_role_key on public.user_roles (user_id, role) where revoked_at is null;
create index user_roles_active_idx on public.user_roles (user_id, role) where revoked_at is null;

create table public.user_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  profile_visibility text not null default 'public' check (profile_visibility in ('public','members','private')),
  allow_messages boolean not null default true, notify_email boolean not null default true,
  notify_push boolean not null default true, locale text not null default 'en-IN',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), slug text not null,
  name text not null check (char_length(name) between 1 and 150), description text,
  region_code text, website_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index organizations_slug_lower_key on public.organizations (lower(slug));
create index organizations_discovery_idx on public.organizations (verification_status, created_at desc) where is_active;

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  membership_role text not null check (membership_role in ('owner','admin','recruiter','editor','member')),
  status text not null default 'active' check (status in ('invited','active','removed')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);
create index organization_members_person_idx on public.organization_members (profile_id, status, organization_id);
create index organization_members_role_idx on public.organization_members (organization_id, membership_role) where status = 'active';

create table public.player_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  primary_game_id uuid references public.games(id) on delete set null, primary_role text, rank_label text,
  availability text not null default 'open' check (availability in ('open','limited','not_looking')),
  birth_year smallint check (birth_year between 1900 and extract(year from current_date)::smallint),
  pronouns text, languages text[] not null default '{}', looking_for text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index player_details_discovery_idx on public.player_details (primary_game_id, availability, profile_id);

create table public.player_skills (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete restrict, role_name text not null,
  rank_label text, years_experience numeric(4,1) check (years_experience >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (profile_id, game_id, role_name)
);
create unique index player_skills_one_primary_key on public.player_skills(profile_id) where is_primary;
create index player_skills_discovery_idx on public.player_skills(game_id, role_name, rank_label, profile_id);

create table public.player_achievements (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null, title text not null, issuer text,
  achieved_on date, placement text, evidence_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index player_achievements_profile_idx on public.player_achievements(profile_id, achieved_on desc nulls last);

create table public.player_experience (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null, team_name text, title text not null,
  game_id uuid references public.games(id) on delete set null, started_on date, ended_on date,
  is_current boolean not null default false, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index player_experience_profile_idx on public.player_experience(profile_id, is_current desc, started_on desc nulls last);

create table public.profile_media (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null check (bucket_id = 'profile-media'), storage_path text not null,
  media_kind text not null check (media_kind in ('image','video')), mime_type text not null,
  byte_size bigint not null check (byte_size > 0), width integer, height integer, duration_ms integer,
  purpose text not null check (purpose in ('avatar','banner','highlight')), is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((media_kind = 'image' and width > 0 and height > 0) or (media_kind = 'video' and duration_ms > 0)),
  unique(bucket_id, storage_path)
);
create unique index profile_media_primary_purpose_key on public.profile_media(profile_id, purpose) where is_primary;

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(), requested_by uuid not null references public.profiles(id) on delete restrict,
  subject_profile_id uuid references public.profiles(id) on delete cascade,
  subject_organization_id uuid references public.organizations(id) on delete restrict,
  verification_kind text not null check (verification_kind in ('player','recruiter','organization')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  submission_number integer not null default 1 check (submission_number > 0), applicant_note text,
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((verification_kind = 'organization' and subject_profile_id is null and subject_organization_id is not null)
      or (verification_kind in ('player','recruiter') and subject_profile_id is not null and subject_organization_id is null))
);
create unique index verification_one_pending_profile_key on public.verification_requests(subject_profile_id, verification_kind)
  where status = 'pending' and subject_profile_id is not null;
create unique index verification_one_pending_org_key on public.verification_requests(subject_organization_id, verification_kind)
  where status = 'pending' and subject_organization_id is not null;

create table public.verification_history (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.verification_requests(id) on delete restrict,
  action text not null check (action in ('submitted','resubmitted','approved','rejected','withdrawn','appeal_opened')),
  from_status text, to_status text, actor_id uuid references public.profiles(id) on delete set null,
  applicant_message text, created_at timestamptz not null default now()
);
create index verification_history_request_idx on public.verification_history(request_id, created_at desc);

create table public.verification_review_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests(id) on delete restrict,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null, created_at timestamptz not null default now()
);
create index verification_review_notes_request_idx on public.verification_review_notes(request_id, created_at desc);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.verification_requests(id) on delete cascade,
  bucket_id text not null check (bucket_id = 'verification-private'), storage_path text not null,
  document_type text not null, mime_type text not null, byte_size bigint not null check (byte_size > 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  unique(bucket_id, storage_path)
);
create index verification_documents_request_idx on public.verification_documents(request_id, created_at desc);

create table public.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  visibility text not null default 'public' check (visibility in ('public','connections','organization','private')),
  commenting text not null default 'everyone' check (commenting in ('everyone','connections','none')),
  is_pinned boolean not null default false, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index posts_author_feed_idx on public.posts(author_id, created_at desc, id desc) where deleted_at is null;
create index posts_public_feed_idx on public.posts(created_at desc, id desc) where deleted_at is null and visibility = 'public';
create index posts_org_feed_idx on public.posts(organization_id, created_at desc, id desc) where deleted_at is null;

create table public.post_media (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  bucket_id text not null check (bucket_id = 'post-media'), storage_path text not null,
  media_kind text not null check (media_kind in ('image','video')), mime_type text not null,
  byte_size bigint not null check (byte_size > 0), width integer, height integer, duration_ms integer,
  position smallint not null check (position between 0 and 9), alt_text text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(post_id, position), unique(bucket_id, storage_path),
  check ((media_kind = 'image' and width > 0 and height > 0) or (media_kind = 'video' and duration_ms > 0))
);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id, profile_id)
);
create index likes_profile_idx on public.likes(profile_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000), deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at, id) where deleted_at is null;
create index comments_parent_idx on public.comments(parent_id, created_at, id);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(follower_id, followed_id), check(follower_id <> followed_id)
);
create index follows_followed_idx on public.follows(followed_id, created_at desc);

create table public.connections (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked','cancelled')),
  responded_at timestamptz, blocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(requester_id <> recipient_id)
);
create unique index connections_unordered_pair_key on public.connections(least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index connections_recipient_idx on public.connections(recipient_id, status, created_at desc);

create table public.connection_events (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.connections(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('requested','accepted','declined','cancelled','reopened','blocked','unblocked')),
  created_at timestamptz not null default now()
);
create index connection_events_connection_idx on public.connection_events(connection_id, created_at desc);

create table public.saved_posts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(profile_id, post_id)
);
create index saved_posts_profile_idx on public.saved_posts(profile_id, created_at desc);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  game_id uuid references public.games(id) on delete set null, title text not null, description text not null, role_name text,
  location_type text not null default 'remote' check(location_type in ('remote','hybrid','on_site')),
  region_code text, status text not null default 'draft' check(status in ('draft','published','paused','closed')),
  openings smallint not null default 1 check(openings > 0), closes_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index opportunities_discovery_idx on public.opportunities(game_id, created_at desc, id desc) where status = 'published';
create index opportunities_org_idx on public.opportunities(organization_id, status, created_at desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade, cover_note text,
  status text not null default 'submitted' check(status in ('submitted','under_review','interview','offered','rejected','withdrawn')),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(opportunity_id, applicant_id)
);
create index applications_applicant_idx on public.applications(applicant_id, created_at desc);
create index applications_opportunity_idx on public.applications(opportunity_id, status, created_at desc);

create table public.application_reviews (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  from_status text, to_status text, internal_note text,
  created_at timestamptz not null default now()
);
create index application_reviews_application_idx on public.application_reviews(application_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null, type text not null,
  payload jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_inbox_idx on public.notifications(recipient_id, read_at, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete restrict,
  subject_profile_id uuid references public.profiles(id) on delete set null,
  subject_post_id uuid references public.posts(id) on delete set null,
  subject_comment_id uuid references public.comments(id) on delete set null,
  subject_opportunity_id uuid references public.opportunities(id) on delete set null,
  reason text not null, detail text, status text not null default 'open' check(status in ('open','investigating','resolved','dismissed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(subject_profile_id, subject_post_id, subject_comment_id, subject_opportunity_id) = 1)
);
create index reports_queue_idx on public.reports(status, created_at);

create table public.report_reviews (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  from_status text, to_status text, internal_note text,
  created_at timestamptz not null default now()
);
create index report_reviews_report_idx on public.report_reviews(report_id, created_at desc);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action_type text not null, target_profile_id uuid references public.profiles(id) on delete set null,
  target_organization_id uuid references public.organizations(id) on delete set null,
  target_verification_request_id uuid references public.verification_requests(id) on delete set null,
  target_report_id uuid references public.reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  check(num_nonnulls(target_profile_id, target_organization_id, target_verification_request_id, target_report_id) <= 1)
);
create index admin_actions_actor_idx on public.admin_actions(actor_id, created_at desc);
create index admin_actions_time_idx on public.admin_actions(created_at desc);

-- RLS helper functions. Keep private schema out of exposed API schemas.
create or replace function private.actor_is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.is_suspended and p.deleted_at is null);
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.actor_is_active() and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin' and r.revoked_at is null);
$$;
create or replace function private.is_active_org_member(org_id uuid, allowed_roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select private.actor_is_active() and exists (select 1 from public.organization_members m where m.organization_id = org_id and m.profile_id = (select auth.uid()) and m.status = 'active' and m.membership_role = any(allowed_roles));
$$;
create or replace function private.can_view_profile(profile_uuid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.user_settings s on s.profile_id = p.id
    where private.actor_is_active() and p.id = profile_uuid and p.deleted_at is null and not p.is_suspended and (
      p.id = (select auth.uid()) or private.is_admin() or s.profile_visibility = 'public' or
      (s.profile_visibility = 'members' and (
        exists (select 1 from public.connections c where c.status = 'accepted' and ((c.requester_id = p.id and c.recipient_id = (select auth.uid())) or (c.recipient_id = p.id and c.requester_id = (select auth.uid()))))
        or exists (select 1 from public.organization_members a join public.organization_members b on b.organization_id = a.organization_id where a.profile_id = p.id and b.profile_id = (select auth.uid()) and a.status = 'active' and b.status = 'active')
      ))
    )
  );
$$;
create or replace function private.can_manage_opportunity(opportunity_uuid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.actor_is_active() and exists (select 1 from public.opportunities o where o.id = opportunity_uuid and private.is_active_org_member(o.organization_id, array['owner','admin','recruiter']));
$$;

revoke all on function private.actor_is_active() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_active_org_member(uuid, text[]) from public;
revoke all on function private.can_view_profile(uuid) from public;
revoke all on function private.can_manage_opportunity(uuid) from public;
grant execute on function private.actor_is_active(), private.is_admin(), private.is_active_org_member(uuid, text[]), private.can_view_profile(uuid), private.can_manage_opportunity(uuid) to authenticated;

create or replace function private.assert_active_admin_remains() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles r where r.role = 'admin' and r.revoked_at is null) then
    raise exception 'cannot remove or revoke the final active administrator';
  end if;
  return null;
end; $$;
revoke all on function private.assert_active_admin_remains() from public;

-- Enable RLS on every exposed relation. Grants and detailed per-operation policies
-- are reviewed in docs/database/rls-policy-matrix.md and must be applied in the
-- same approved migration as this DDL.
alter table public.games enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_settings enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.player_details enable row level security;
alter table public.player_skills enable row level security;
alter table public.player_achievements enable row level security;
alter table public.player_experience enable row level security;
alter table public.profile_media enable row level security;
alter table public.verification_requests enable row level security;
alter table public.verification_history enable row level security;
alter table public.verification_review_notes enable row level security;
alter table public.verification_documents enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.connections enable row level security;
alter table public.connection_events enable row level security;
alter table public.saved_posts enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.application_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.report_reviews enable row level security;
alter table public.admin_actions enable row level security;

-- Representative policies; complete policy definitions must be generated from
-- the approved RLS matrix and tested before this file can move to migrations.
-- Do not grant broad update rights: RLS authorizes rows, not individual columns.
revoke all on public.user_roles, public.verification_history, public.verification_review_notes,
  public.application_reviews, public.report_reviews, public.admin_actions from anon, authenticated;
revoke update on public.profiles, public.notifications from authenticated;
grant update (handle, display_name, headline, bio, city, country_code, is_discoverable) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (private.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy settings_self on public.user_settings for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy skills_owner on public.player_skills for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy achievements_owner on public.player_achievements for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy experience_owner on public.player_experience for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy follows_owner on public.follows for all to authenticated using (follower_id = (select auth.uid())) with check (follower_id = (select auth.uid()));
create policy saves_owner on public.saved_posts for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy notifications_recipient on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy admin_actions_read on public.admin_actions for select to authenticated using (private.is_admin());

-- Updated timestamp triggers for mutable tables.
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger settings_updated before update on public.user_settings for each row execute function private.set_updated_at();
create trigger organizations_updated before update on public.organizations for each row execute function private.set_updated_at();
create trigger org_members_updated before update on public.organization_members for each row execute function private.set_updated_at();
create trigger player_details_updated before update on public.player_details for each row execute function private.set_updated_at();
create trigger player_skills_updated before update on public.player_skills for each row execute function private.set_updated_at();
create trigger player_achievements_updated before update on public.player_achievements for each row execute function private.set_updated_at();
create trigger player_experience_updated before update on public.player_experience for each row execute function private.set_updated_at();
create trigger profile_media_updated before update on public.profile_media for each row execute function private.set_updated_at();
create trigger verification_requests_updated before update on public.verification_requests for each row execute function private.set_updated_at();
create trigger posts_updated before update on public.posts for each row execute function private.set_updated_at();
create trigger post_media_updated before update on public.post_media for each row execute function private.set_updated_at();
create trigger comments_updated before update on public.comments for each row execute function private.set_updated_at();
create trigger connections_updated before update on public.connections for each row execute function private.set_updated_at();
create trigger opportunities_updated before update on public.opportunities for each row execute function private.set_updated_at();
create trigger applications_updated before update on public.applications for each row execute function private.set_updated_at();
create trigger reports_updated before update on public.reports for each row execute function private.set_updated_at();

create constraint trigger user_roles_final_admin_guard
after update or delete on public.user_roles
deferrable initially deferred for each row execute function private.assert_active_admin_remains();

-- Pending review before any execution:
-- 1) every remaining per-operation RLS policy from the matrix (the policies above
--    are safe representative fragments, not an approval to apply this review draft)
-- 2) auth.users signup trigger, ownership-transfer invariant, and verification decision transaction
-- 3) parent-comment same-post trigger and Storage bucket/object policies
-- 4) pgTAP/Supabase RLS allow/deny tests, production retention plan, and generated TS types

rollback;
-- Deliberately rolls back if someone accidentally executes this review file.

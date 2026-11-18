-- Arcanix private Storage buckets and object policies. No public bucket is used.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('profile-media','profile-media',false,104857600,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']),
 ('post-media','post-media',false,157286400,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']),
 ('verification-private','verification-private',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy profile_media_object_read on storage.objects for select to authenticated using(bucket_id='profile-media' and exists(select 1 from public.profile_media m where m.bucket_id=storage.objects.bucket_id and m.storage_path=storage.objects.name and private.can_view_profile(m.profile_id)));
create policy profile_media_object_insert on storage.objects for insert to authenticated with check(bucket_id='profile-media' and name like auth.uid()::text||'/%' and private.actor_is_active());
create policy profile_media_object_delete on storage.objects for delete to authenticated using(bucket_id='profile-media' and owner_id=auth.uid()::text and private.actor_is_active());

create policy post_media_object_read on storage.objects for select to authenticated using(bucket_id='post-media' and exists(select 1 from public.post_media m where m.bucket_id=storage.objects.bucket_id and m.storage_path=storage.objects.name and private.can_view_post(m.post_id)));
create policy post_media_object_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and name like auth.uid()::text||'/%' and private.actor_is_active());
create policy post_media_object_delete on storage.objects for delete to authenticated using(bucket_id='post-media' and owner_id=auth.uid()::text and private.actor_is_active());

create policy verification_object_read on storage.objects for select to authenticated using(bucket_id='verification-private' and exists(select 1 from public.verification_documents d join public.verification_requests r on r.id=d.request_id where d.bucket_id=storage.objects.bucket_id and d.storage_path=storage.objects.name and (r.requested_by=auth.uid() or private.is_admin() or (r.subject_organization_id is not null and private.is_org_member(r.subject_organization_id,array['owner','admin'])))));
create policy verification_object_insert on storage.objects for insert to authenticated with check(bucket_id='verification-private' and private.actor_is_active() and exists(select 1 from public.verification_requests r where r.status='pending' and split_part(storage.objects.name,'/',1)=r.id::text and (r.requested_by=auth.uid() or (r.subject_organization_id is not null and private.is_org_member(r.subject_organization_id,array['owner','admin'])))));
create policy verification_object_delete on storage.objects for delete to authenticated using(bucket_id='verification-private' and exists(select 1 from public.verification_documents d join public.verification_requests r on r.id=d.request_id where d.bucket_id=storage.objects.bucket_id and d.storage_path=storage.objects.name and (private.is_admin() or (r.requested_by=auth.uid() and r.status='pending'))));

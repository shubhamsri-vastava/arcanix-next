# Arcanix Storage architecture

> Review design only. No bucket has been created.

## Access model

All three launch buckets are **private**. This protects profile visibility, post visibility, and verification evidence consistently. The app obtains a short-lived signed URL only after it authorizes the metadata row under RLS. A public bucket is faster for universally public assets, but it cannot enforce an Arcanix profile or post privacy setting once someone has its URL.

| Bucket | Purpose | Access | Supported MIME types | Max size |
|---|---|---|---:|---:|
| `profile-media` | Avatar, banner, player highlight | Private; profile visibility policy | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `video/mp4`, `video/webm` | images 10 MB; videos 100 MB |
| `post-media` | Media attached to posts | Private; post-visibility policy | same image types; `video/mp4`, `video/webm` | images 15 MB; videos 150 MB |
| `verification-private` | ID, roster/organization proof, other verification evidence | Private; applicant + authorized administrator only | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | 15 MB per file |

Supabase private buckets apply RLS to downloading as well as uploads; signed URLs can be used for limited-duration downloads. [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## Object naming

Never derive a path from an untrusted filename. The client requests an upload intent; the server/client generates a UUID object name and saves metadata only after a successful upload.

| Bucket | Path template | Metadata relation |
|---|---|---|
| `profile-media` | `<profile-id>/<media-id>.<safe-extension>` | `profile_media.storage_path` |
| `post-media` | `<author-profile-id>/<post-id>/<media-id>.<safe-extension>` | `post_media.storage_path` |
| `verification-private` | `<verification-request-id>/<document-id>.<safe-extension>` | `verification_documents.storage_path` |

The UUID in a path is not authorization. It only prevents filename collisions and guessing. Authorization is enforced on `storage.objects` and the corresponding metadata table.

## Metadata requirements

PostgreSQL stores metadata, never binary files:

- `bucket_id`, `storage_path` (unique), `media_kind`, MIME type, byte size, creation timestamp.
- Images: width and height required.
- Videos: width, height, duration in milliseconds, and a generated poster/thumbnail reference if added later.
- Posts: ordered `position` (0–9) and optional accessible `alt_text`.
- Profile media: purpose (`avatar`, `banner`, `highlight`) and `is_primary`.
- Verification documents: document type and submitting profile; no publicly accessible URL.

The backend must verify MIME by inspecting file content, not only the browser-supplied MIME value. Video transcoding, malware scanning, and thumbnail generation should be asynchronous jobs before a file becomes visible.

## Storage RLS policy intent

### `profile-media`

- **Insert:** authenticated owner, `storage.foldername(name)[1] = auth.uid()::text`, accepted bucket MIME/size.
- **Select/download:** authenticated viewer if `private.can_view_profile(owner_profile_id)` from the linked metadata record.
- **Update/move:** owner only; avoid moves after metadata is committed.
- **Delete:** owner or administrator; metadata deletion and object deletion are coordinated by a server-side workflow.

### `post-media`

- **Insert:** authenticated author only, path prefix matches their UUID. A metadata record must reference a post owned by that author.
- **Select/download:** viewer passes `private.can_view_post(post_id)`.
- **Delete:** post author or moderator action. Physical files are queued for deletion after a short retention window.
- **Limit:** maximum 10 media rows per post is enforced in the database and mirrored in the upload UI.

### `verification-private`

- **Insert:** the request applicant, or active owner/admin of the subject organization, only while the request is pending.
- **Select/download:** submitting applicant, relevant organization owner/admin, or administrator. No anonymous/public policy.
- **Delete:** applicant before review or administrator for compliance/moderation. Preserve metadata/audit history even when an object is redacted.
- **No direct URL sharing:** UI requests a signed URL with a short expiry after a server-side/RLS authorization check.

## Upload workflow

1. Client creates a draft parent row only when its RLS policy allows it, or calls a narrowly scoped authenticated server action.
2. Server validates requested type/count/path intent; client uploads under a constrained Storage policy.
3. Backend validates reported object metadata (size/type) and writes the metadata row in a transaction or deletes orphan object on failure.
4. For media requiring review/transcoding, store a `processing` state in the metadata model before exposing it.
5. Signed URLs are generated only after the corresponding profile/post/verification authorization check.

## Retention and operational rules

- Do not use a service/secret key in browser code. A server-only cleanup/scanning worker may use elevated credentials, with no user access token attached, and must log only object IDs—not URLs or content.
- Object deletion must be idempotent and queued; never allow an arbitrary browser path to delete a bucket object.
- Define verification-document retention with legal/product owners before launch. The default proposal is 90 days after final decision, unless an active appeal or legal hold exists.
- Monitor orphan objects and orphan metadata separately. Reconciliation jobs must be read-only first, then require an approved deletion mode.

## Task 1B authorization corrections

### Bucket IDs versus object names

The bucket identifier is a fixed value (`profile-media`, `post-media`, or `verification-private`). It is **not** part of `storage.objects.name` and is never supplied by an untrusted client as authorization input. The object name is the path *inside* its bucket:

| Bucket ID | Object name (exact pattern) | Owner/authority check |
|---|---|---|
| `profile-media` | `<auth.uid()>/<media-uuid>.<ext>` | uploader equals first path segment and metadata `profile_id=auth.uid()` |
| `post-media` | `<auth.uid()>/<post-uuid>/<media-uuid>.<ext>` | uploader equals first segment and post author equals `auth.uid()` |
| `verification-private` | `<request-uuid>/<document-uuid>.<ext>` | caller owns request subject or is authorized active organization owner/admin; request is pending |

Every metadata row stores `bucket_id` and `storage_path` separately. It has a unique `(bucket_id, storage_path)` constraint. A policy joins object bucket/name to its metadata row; it never trusts a user-provided alternate path or URL.

### Private-object authorization

1. **Upload:** server/RPC issues an upload intent only after row authorization. Storage RLS independently checks bucket, immutable path structure, owner, and request/post/profile relationship.
2. **Read:** server action first authorizes the metadata row with the same RLS predicate as the parent profile/post/verification request, then creates a signed URL lasting no more than five minutes. It returns no bucket listing or arbitrary-object signed URL.
3. **Update/delete:** only the owning authorized actor or an audited administrator transaction can remove an object. Object moves are disabled for regular clients.
4. **Validation:** server-side code sniffs MIME signature, validates image dimensions and video duration, enforces bucket size/type policy, limits post media to ten rows, and rejects malformed extensions. Browser-provided type/size is advisory only.

Recommended hard limits: profile images 10 MB and video highlights 100 MB/120 seconds; post images 15 MB and videos 150 MB/180 seconds; verification files 15 MB and images/PDF only. These values need product approval before bucket creation.

### Verification privacy and retention

`verification-private` has no `anon` or public-read policy, no permanent URL, and no client-side service key. Applicant-visible verification history excludes internal notes. Appeals, document retention (proposal: 90 days after final decision), legal hold, and whether a rejected applicant may replace documents before resubmission remain product decisions; no cleanup job is authorized until they are decided.

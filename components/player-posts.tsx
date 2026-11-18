'use client'

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PostMedia = { id: string; media_kind: 'image' | 'video'; alt_text: string | null; signedUrl: string }
type Post = { id: string; body: string; visibility: string; created_at: string; media: PostMedia[] }
type UploadMetadata = { kind: 'image' | 'video'; mime: string; size: number; width: number | null; height: number | null; duration: number | null }
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm'])
function parsePostVisibility(value: string): 'public' | 'connections' | 'private' { return value === 'connections' || value === 'private' ? value : 'public' }

async function inspectFile(file: File): Promise<UploadMetadata> {
  if (!allowedTypes.has(file.type)) throw new Error('Use JPEG, PNG, WebP, AVIF, MP4 or WebM media.')
  if (file.size <= 0 || file.size > 100 * 1024 * 1024) throw new Error('Each media file must be smaller than 100 MB.')
  if (file.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(file)
    const metadata = { kind: 'image' as const, mime: file.type, size: file.size, width: bitmap.width, height: bitmap.height, duration: null }
    bitmap.close()
    return metadata
  }
  const url = URL.createObjectURL(file)
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'; video.onloadedmetadata = () => resolve(video.duration); video.onerror = () => reject(new Error('That video could not be read.')); video.src = url
    })
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('That video has invalid duration metadata.')
    return { kind: 'video', mime: file.type, size: file.size, width: null, height: null, duration: Math.round(duration * 1000) }
  } finally { URL.revokeObjectURL(url) }
}

export function PlayerPosts({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [visibility, setVisibility] = useState<'public' | 'connections' | 'private'>('public')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadPosts = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('posts').select('id,body,visibility,created_at').eq('author_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(30)
    if (error) { setMessage('Your posts could not be loaded.'); setLoading(false); return }
    if (!data?.length) { setPosts([]); setLoading(false); return }
    const { data: mediaRows } = await supabase.from('post_media').select('id,post_id,storage_path,media_kind,alt_text,position').in('post_id', data.map((post) => post.id)).order('position')
    const hydrated: Post[] = await Promise.all(data.map(async (post) => {
      const media = await Promise.all((mediaRows ?? []).filter((item) => item.post_id === post.id).map(async (item) => {
        const { data: signed } = await supabase.storage.from('post-media').createSignedUrl(item.storage_path, 3600)
        return signed?.signedUrl ? { id: item.id, media_kind: item.media_kind, alt_text: item.alt_text, signedUrl: signed.signedUrl } : null
      }))
      return { ...post, media: media.filter((item): item is PostMedia => item !== null) }
    }))
    setPosts(hydrated); setLoading(false)
  }, [userId])

  useEffect(() => { void loadPosts() }, [loadPosts])

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    setFiles(selected)
    if (selected.length > 10) setMessage('A post can include at most 10 media files.')
    else setMessage('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('')
    const form = event.currentTarget
    const values = new FormData(event.currentTarget)
    const body = String(values.get('body') ?? '').trim()
    if (!body || body.length > 5000) { setMessage('Write a post between 1 and 5,000 characters.'); return }
    if (files.length > 10) { setMessage('A post can include at most 10 media files.'); return }
    setBusy(true); const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || user.id !== userId) { setBusy(false); setMessage('Your session expired. Sign in again to post.'); return }
    const { data: post, error: postError } = await supabase.from('posts').insert({ author_id: userId, body, visibility }).select('id').single()
    if (postError || !post) { setBusy(false); setMessage('Post could not be saved. Confirm your account is active and database policies are applied.'); return }
    const paths: string[] = []; const metadataRows: Record<string, string | number | null>[] = []
    try {
      for (const [position, file] of files.entries()) {
        const meta = await inspectFile(file)
        const extension = meta.mime === 'image/jpeg' ? 'jpg' : meta.mime.split('/')[1]
        const path = `${userId}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('post-media').upload(path, file, { contentType: meta.mime, upsert: false })
        if (error) throw new Error('Media upload failed. Check the post-media Storage policy.')
        paths.push(path)
        metadataRows.push({ post_id: post.id, bucket_id: 'post-media', storage_path: path, media_kind: meta.kind, mime_type: meta.mime, byte_size: meta.size, width: meta.width, height: meta.height, duration_ms: meta.duration, position, alt_text: file.name.slice(0, 300) })
      }
      if (metadataRows.length) {
        const { error } = await supabase.from('post_media').insert(metadataRows)
        if (error) throw new Error('Media details could not be saved. The post was rolled back.')
      }
    } catch (caught) {
      await supabase.storage.from('post-media').remove(paths)
      await supabase.from('posts').delete().eq('id', post.id).eq('author_id', userId)
      setBusy(false); setMessage(caught instanceof Error ? caught.message : 'Post could not be completed.'); return
    }
    form.reset(); setFiles([]); setBusy(false); setMessage('Post published.')
    await loadPosts()
  }

  return <section className="profile-section post-feed"><h2>Player posts</h2><form className="post-composer" onSubmit={submit}><label className="sr-only" htmlFor="post-body">Write a post</label><textarea id="post-body" name="body" maxLength={5000} placeholder="Share a team update, tournament result, or what you are working on…" required /><div className="post-compose-controls"><label className="post-file-picker">Add photo or video<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" multiple onChange={chooseFiles} /></label><select aria-label="Post visibility" value={visibility} onChange={(event) => setVisibility(parsePostVisibility(event.target.value))}><option value="public">Public</option><option value="connections">Connections</option><option value="private">Only me</option></select><button className="cta" disabled={busy}>{busy ? 'Publishing…' : 'Publish post'}</button></div>{files.length > 0 && <p className="post-file-count">{files.length} attachment{files.length === 1 ? '' : 's'} selected</p>}{message && <p className="post-message" role="status">{message}</p>}</form>{loading ? <div className="status-block">Loading your posts…</div> : posts.length ? <div className="posts-list">{posts.map((post) => <article className="post-card" key={post.id}><p>{post.body}</p><small>{new Date(post.created_at).toLocaleDateString()} · {post.visibility}</small>{post.media.length > 0 && <div className="post-media-grid">{post.media.map((item) => item.media_kind === 'video' ? <video key={item.id} src={item.signedUrl} controls preload="metadata" /> : <img key={item.id} src={item.signedUrl} alt={item.alt_text ?? 'Post attachment'} />)}</div>}</article>)}</div> : <p className="status-block">Your posts will appear here. Share an update to start your player profile feed.</p>}</section>
}

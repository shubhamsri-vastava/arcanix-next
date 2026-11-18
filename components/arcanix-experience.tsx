'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { PlayerPosts } from '@/components/player-posts'

type Profile = { id: string; handle: string; display_name: string; headline: string | null; bio: string | null; city: string | null; country_code: string | null; is_discoverable: boolean }
type Player = Pick<Profile, 'id' | 'handle' | 'display_name' | 'headline' | 'city' | 'country_code'> & { roles: string[] }
type Game = { id: string; name: string }
type Skill = { id: string; game_id: string; role_name: string; rank_label: string | null; years_experience: number | null }
type Achievement = { id: string; title: string; issuer: string | null; placement: string | null; achieved_on: string | null }
type Experience = { id: string; title: string; team_name: string | null; description: string | null; started_on: string | null; ended_on: string | null; is_current: boolean }
type Visibility = 'public' | 'members' | 'private'
type AuthMode = 'login' | 'signup' | 'recovery'
type Founder = { name: string; role: string; description: string; portrait?: string }
const founders: Founder[] = [
  { name: 'Tanai Sri Raj Adapa', role: 'Research Manager & Team Leader', description: 'Leads research and team coordination as Arcanix builds a more connected path for esports talent.', portrait: '/images/founders/tanai-sri-raj-adapa.webp' },
  { name: 'Bhanupratap Singh Rathore', role: 'Cyber Security Analyst', description: 'Brings a security-first perspective to the platform and the way players connect.', portrait: '/images/founders/bhanupratap-singh-rathore.webp' },
  { name: 'Shubham Srivastava', role: 'UI/UX Designer & Graphic Designer', description: 'Shapes the Arcanix interface and visual identity around the needs of players and teams.', portrait: '/images/founders/shubham-srivastava.webp' },
  { name: 'Milind Raaj', role: 'Content Writer', description: 'Turns the team’s ideas into clear stories for the Arcanix community.', portrait: '/images/founders/milind-raaj.webp' },
]
const profileColumns = 'id,handle,display_name,headline,bio,city,country_code,is_discoverable'
function parseVisibility(value: string): Visibility { return value === 'members' || value === 'private' ? value : 'public' }

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'A' }

export function ArcanixExperience() {
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signup')
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageSuccess, setAuthMessageSuccess] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [dashboard, setDashboard] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [filter, setFilter] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [games, setGames] = useState<Game[]>([])
  const [primaryGame, setPrimaryGame] = useState('')
  const [primaryRole, setPrimaryRole] = useState('')
  const [rankLabel, setRankLabel] = useState('')
  const [availability, setAvailability] = useState('open')
  const [skills, setSkills] = useState<Skill[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [experience, setExperience] = useState<Experience[]>([])
  const [avatarUrl, setAvatarUrl] = useState('')
  const [directory, setDirectory] = useState<Player[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = createClient()
    const [profileResult, settingsResult, detailsResult, gameResult, skillsResult, achievementsResult, experienceResult, avatarResult] = await Promise.all([
      supabase.from('profiles').select(profileColumns).eq('id', userId).maybeSingle(),
      supabase.from('user_settings').select('profile_visibility').eq('profile_id', userId).maybeSingle(),
      supabase.from('player_details').select('primary_game_id,primary_role,rank_label,availability').eq('profile_id', userId).maybeSingle(),
      supabase.from('games').select('id,name').eq('is_active', true).order('name'),
      supabase.from('player_skills').select('id,game_id,role_name,rank_label,years_experience').eq('profile_id', userId).order('is_primary', { ascending: false }),
      supabase.from('player_achievements').select('id,title,issuer,placement,achieved_on').eq('profile_id', userId).order('achieved_on', { ascending: false }),
      supabase.from('player_experience').select('id,title,team_name,description,started_on,ended_on,is_current').eq('profile_id', userId).order('started_on', { ascending: false }),
      supabase.from('profile_media').select('storage_path').eq('profile_id', userId).eq('purpose', 'avatar').eq('is_primary', true).maybeSingle(),
    ])
    if (profileResult.error) throw profileResult.error
    setProfile(profileResult.data ? { id: profileResult.data.id, handle: profileResult.data.handle, display_name: profileResult.data.display_name, headline: profileResult.data.headline, bio: profileResult.data.bio, city: profileResult.data.city, country_code: profileResult.data.country_code, is_discoverable: profileResult.data.is_discoverable } : null)
    if (settingsResult.data) setVisibility(parseVisibility(settingsResult.data.profile_visibility))
    if (detailsResult.data) {
      setPrimaryGame(detailsResult.data.primary_game_id ?? ''); setPrimaryRole(detailsResult.data.primary_role ?? '')
      setRankLabel(detailsResult.data.rank_label ?? ''); setAvailability(detailsResult.data.availability)
    }
    if (gameResult.data) setGames(gameResult.data.map((game) => ({ id: game.id, name: game.name })))
    if (skillsResult.data) setSkills(skillsResult.data.map((skill) => ({ id: skill.id, game_id: skill.game_id, role_name: skill.role_name, rank_label: skill.rank_label, years_experience: skill.years_experience })))
    if (achievementsResult.data) setAchievements(achievementsResult.data.map((row) => ({ id: row.id, title: row.title, issuer: row.issuer, placement: row.placement, achieved_on: row.achieved_on })))
    if (experienceResult.data) setExperience(experienceResult.data.map((row) => ({ id: row.id, title: row.title, team_name: row.team_name, description: row.description, started_on: row.started_on, ended_on: row.ended_on, is_current: row.is_current })))
    setAvatarUrl('')
    if (avatarResult.data) {
      const { data } = await supabase.storage.from('profile-media').createSignedUrl(avatarResult.data.storage_path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    }
  }, [])

  const loadDirectory = useCallback(async () => {
    if (!configured || !user) return
    setDirectoryLoading(true); setDirectoryError('')
    const { data, error } = await createClient().from('profiles').select('id,handle,display_name,headline,city,country_code')
      .eq('is_discoverable', true).eq('is_suspended', false).is('deleted_at', null)
      .neq('id', user.id).order('updated_at', { ascending: false }).limit(48)
    if (error) { setDirectory([]); setDirectoryError('Player discovery is temporarily unavailable. Please try again.') }
    else {
      const rows = data ?? []
      const { data: skillRows } = rows.length ? await createClient().from('player_skills').select('profile_id,role_name').in('profile_id', rows.map((row) => row.id)) : { data: [] }
      setDirectory(rows.map((row) => ({ id: row.id, handle: row.handle, display_name: row.display_name, headline: row.headline, city: row.city, country_code: row.country_code, roles: (skillRows ?? []).filter((skill) => skill.profile_id === row.id).map((skill) => skill.role_name) })))
    }
    setDirectoryLoading(false)
  }, [configured, user?.id])

  useEffect(() => {
    if (!configured) { setAuthLoading(false); return }
    const supabase = createClient(); let active = true
    const sync = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!active) return
      if (error || !data.user) { setUser(null); setAuthLoading(false); return }
      setUser(data.user)
      try { await loadProfile(data.user.id) } catch { if (active) setProfileMessage('Some profile information could not be loaded. Refresh or try again.') }
      if (active) setAuthLoading(false)
    }
    void sync().catch(() => {
      if (active) { setUser(null); setAuthLoading(false); setProfileMessage('Supabase is unavailable right now. Try again when the connection is restored.') }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setProfile((current) => current?.id === session.user.id ? current : null)
        queueMicrotask(() => { void loadProfile(session.user.id).catch(() => setProfileMessage('Unable to load your saved profile.')) })
      }
      else { setProfile(null); setAvatarUrl('') }
      setAuthLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [configured, loadProfile])
  useEffect(() => { if (user) void loadDirectory() }, [user, loadDirectory])

  const filteredDirectory = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase()
    return query ? directory.filter((player) => [player.display_name, player.handle, player.headline, player.city, player.country_code, ...player.roles].some((value) => value?.toLocaleLowerCase().includes(query))) : directory
  }, [directory, filter])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authResult = params.get('auth')
    if (authResult === 'callback-error') {
      setAuthMode('login'); setAuthMessage('This confirmation or password-reset link is invalid, expired, or already used. Request a fresh email and try again.'); setAuthMessageSuccess(false); setAuthOpen(true)
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    } else if (authResult === 'confirmed') {
      setProfileMessage('Your email is confirmed. Welcome to Arcanix.')
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    } else if (authResult === 'login' || authResult === 'recovery') {
      openAuth(authResult)
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
  }, [])

  function openAuth(mode: AuthMode) { setAuthMode(mode); setAuthMessage(''); setAuthMessageSuccess(false); setConfirmationEmail(''); setAuthOpen(true); setMobileMenu(false) }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthMessage(''); setAuthMessageSuccess(false)
    if (!configured) { setAuthMessage('Supabase is not configured. Add the public project URL and publishable key to .env.local.'); return }
    const values = new FormData(event.currentTarget); const email = String(values.get('email') ?? '').trim(); const password = String(values.get('password') ?? '')
    const name = String(values.get('name') ?? '').trim(); const handle = String(values.get('handle') ?? '').trim().toLowerCase()
    if (authMode === 'signup') {
      const confirmation = String(values.get('password_confirmation') ?? '')
      if (!name || name.length > 100) { setAuthMessage('Enter a player name up to 100 characters.'); return }
      if (!/^[a-z0-9_]{3,30}$/.test(handle)) { setAuthMessage('Username must be 3–30 characters using letters, numbers, or underscores.'); return }
      if (password.length < 8 || password.length > 72) { setAuthMessage('Password must be between 8 and 72 characters.'); return }
      if (password !== confirmation) { setAuthMessage('The passwords do not match.'); return }
    }
    setAuthBusy(true); const supabase = createClient()
    if (authMode === 'recovery') {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` })
        setAuthMessage(error ? 'We could not send the request right now. Please wait a moment and try again.' : 'If an account exists for that email, a password reset link will be sent.')
        setAuthMessageSuccess(!error)
      } catch { setAuthMessage('Supabase could not be reached. Check your connection and try again.') }
      setAuthBusy(false); return
    }
    try {
      if (authMode === 'signup') {
        const { data: available, error: availabilityError } = await supabase.rpc('is_handle_available', { candidate: handle })
        if (availabilityError) {
          if (availabilityError.code !== 'PGRST202') {
            setAuthMessage('We could not check that username right now. Please try again.')
            setAuthBusy(false); return
          }
          // Older PostgREST schema caches may not expose the RPC immediately.
          // Continue to signup: the database trigger and unique index remain
          // authoritative and reject invalid or duplicate handles.
        }
        if (!availabilityError && !available) { setAuthMessage('That username is already in use. Choose another one.'); setAuthBusy(false); return }
      }
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name, handle }, emailRedirectTo: `${window.location.origin}/auth/callback` } })
        : await supabase.auth.signInWithPassword({ email, password })
      setAuthBusy(false)
      if (result.error) {
        if (/email not confirmed/i.test(result.error.message)) { setConfirmationEmail(email); setAuthMessage('Verify your email before signing in. You can request a fresh confirmation email below.') }
        else if (/profiles_handle_lower_key|duplicate key|handle/i.test(result.error.message) && authMode === 'signup') setAuthMessage('That username is unavailable. Choose another one and try again.')
        else setAuthMessage(authMode === 'login' ? 'Sign-in failed. Check your email and password, and confirm your email address.' : 'We could not create the account. Check your details and try again.')
        return
      }
      if (authMode === 'signup' && !result.data.session) { setConfirmationEmail(email); setAuthMessage('Check your inbox and spam folder for a confirmation link. Verify your email before signing in.'); setAuthMessageSuccess(true); return }
      if (result.data.user) {
        setUser(result.data.user)
        try { await loadProfile(result.data.user.id) } catch { setProfileMessage('Account created, but its profile could not be loaded. Check that the database migrations are applied to your development project.') }
      }
      setAuthOpen(false); setDashboard(true)
    } catch { setAuthBusy(false); setAuthMessage('Supabase could not be reached. Check your connection and try again.'); return }
  }

  async function resendConfirmation() {
    if (!configured || !confirmationEmail) return
    setAuthBusy(true)
    try {
      const { error } = await createClient().auth.resend({ type: 'signup', email: confirmationEmail, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      setAuthMessage(error ? 'We could not resend the confirmation right now. Wait a moment and try again.' : 'If this account can receive confirmation, a fresh email will arrive shortly.')
      setAuthMessageSuccess(!error)
    } catch { setAuthMessage('Supabase could not be reached. Please try again.') }
    setAuthBusy(false)
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileMessage('')
    if (!configured || !user || !profile || profile.id !== user.id) { setProfileMessage('Your profile is still loading, or your session has expired. Please try again.'); return }
    const values = new FormData(event.currentTarget)
    const displayName = String(values.get('display_name') ?? '').trim(), handle = String(values.get('handle') ?? '').trim().toLowerCase()
    const headline = String(values.get('headline') ?? '').trim(), city = String(values.get('city') ?? '').trim(), countryCode = String(values.get('country_code') ?? '').trim().toUpperCase(), bio = String(values.get('bio') ?? '').trim()
    if (!displayName || displayName.length > 100) { setProfileMessage('Display name must be between 1 and 100 characters.'); return }
    if (!/^[a-z0-9_]{3,30}$/.test(handle)) { setProfileMessage('Username must be 3–30 characters using letters, numbers, or underscores.'); return }
    if (headline.length > 160 || city.length > 100 || bio.length > 500 || (countryCode && !/^[A-Z]{2}$/.test(countryCode))) { setProfileMessage('Check the field limits. Country code must be two letters.'); return }
    setProfileBusy(true); const supabase = createClient()
    const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !verifiedUser || verifiedUser.id !== user.id) { setProfileBusy(false); setProfileMessage('Your session has expired. Sign in again to save changes.'); return }
    const { data: saved, error } = await supabase.from('profiles').update({ display_name: displayName, handle, headline: headline || null, city: city || null, country_code: countryCode || null, bio: bio || null, is_discoverable: values.get('is_discoverable') === 'on' }).eq('id', verifiedUser.id).select('id').maybeSingle()
    if (error || !saved) { setProfileBusy(false); setProfileMessage(error?.code === '23505' ? 'That username is already in use.' : 'Could not save your profile. Please try again.'); return }
    const { data: settingsSaved, error: settingsError } = await supabase.from('user_settings').update({ profile_visibility: visibility }).eq('profile_id', verifiedUser.id).select('profile_id').maybeSingle()
    if (settingsError || !settingsSaved) { setProfileBusy(false); setProfileMessage('Profile was saved, but visibility settings could not be saved. Please retry.'); return }
    try { await loadProfile(verifiedUser.id); await loadDirectory(); setProfileMessage('Profile saved successfully.') }
    catch { setProfileMessage('Profile was saved, but refreshed data could not be loaded.') }
    setProfileBusy(false)
  }

  async function saveCompetitive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) { setProfileMessage('Sign in to edit competitive details.'); return }
    setProfileBusy(true)
    const supabase = createClient()
    const { data: { user: verifiedUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !verifiedUser || verifiedUser.id !== user.id) { setProfileBusy(false); setProfileMessage('Your session has expired. Sign in again to save changes.'); return }
    const { error } = await supabase.from('player_details').upsert({ profile_id: verifiedUser.id, primary_game_id: primaryGame || null, primary_role: primaryRole.trim() || null, rank_label: rankLabel.trim() || null, availability }, { onConflict: 'profile_id' })
    if (error) setProfileMessage('Could not save competitive details. Check that database migrations are applied.')
    else { await loadProfile(verifiedUser.id); setProfileMessage('Competitive details saved.') }
    setProfileBusy(false)
  }

  async function addSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    const values = new FormData(event.currentTarget); const gameId = String(values.get('game_id') ?? ''), role = String(values.get('role_name') ?? '').trim(), rank = String(values.get('rank_label') ?? '').trim()
    if (!gameId || !role) { setProfileMessage('Choose a game and enter a role before adding a skill.'); return }
    setProfileBusy(true)
    const { error } = await createClient().from('player_skills').insert({ profile_id: user.id, game_id: gameId, role_name: role, rank_label: rank || null, is_primary: skills.length === 0 })
    if (error) setProfileMessage(error.code === '23505' ? 'That game and role are already listed.' : 'Could not add the skill. Please check the game and retry.')
    else { await loadProfile(user.id); setProfileMessage('Game and role added.') }
    setProfileBusy(false)
  }

  async function removeSkill(id: string) {
    if (!user) return
    const { error } = await createClient().from('player_skills').delete().eq('id', id).eq('profile_id', user.id)
    if (error) setProfileMessage('Could not remove this skill.')
    else await loadProfile(user.id)
  }

  async function addAchievement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    const form = event.currentTarget
    const values = new FormData(form); const title = String(values.get('title') ?? '').trim()
    if (!title) return
    setProfileBusy(true)
    const { error } = await createClient().from('player_achievements').insert({ profile_id: user.id, title, issuer: String(values.get('issuer') ?? '').trim() || null, placement: String(values.get('placement') ?? '').trim() || null, achieved_on: String(values.get('achieved_on') ?? '') || null })
    if (error) setProfileMessage('Could not add achievement. Please try again.')
    else { form.reset(); await loadProfile(user.id); setProfileMessage('Achievement added.') }
    setProfileBusy(false)
  }

  async function addExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    const form = event.currentTarget
    const values = new FormData(form); const title = String(values.get('title') ?? '').trim()
    if (!title) return
    setProfileBusy(true)
    const { error } = await createClient().from('player_experience').insert({ profile_id: user.id, title, team_name: String(values.get('team_name') ?? '').trim() || null, description: String(values.get('description') ?? '').trim() || null, started_on: String(values.get('started_on') ?? '') || null, is_current: values.get('is_current') === 'on' })
    if (error) setProfileMessage('Could not add experience. Please try again.')
    else { form.reset(); await loadProfile(user.id); setProfileMessage('Experience added.') }
    setProfileBusy(false)
  }

  async function uploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    const input = event.currentTarget.elements.namedItem('avatar')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (!file) { setProfileMessage('Choose a profile image first.'); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) { setProfileMessage('Choose a JPEG, PNG, WebP, or AVIF image smaller than 10 MB.'); return }
    setProfileBusy(true); const supabase = createClient(); let width = 0, height = 0
    try { const bitmap = await createImageBitmap(file); width = bitmap.width; height = bitmap.height; bitmap.close() }
    catch { setProfileBusy(false); setProfileMessage('That image could not be opened.'); return }
    const { data: prior } = await supabase.from('profile_media').select('id,storage_path').eq('profile_id', user.id).eq('purpose', 'avatar').eq('is_primary', true).maybeSingle()
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('profile-media').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) { setProfileBusy(false); setProfileMessage('Photo upload failed. Confirm profile-media Storage policies are applied.'); return }
    if (prior) await supabase.from('profile_media').update({ is_primary: false }).eq('id', prior.id).eq('profile_id', user.id)
    const { error: metadataError } = await supabase.from('profile_media').insert({ profile_id: user.id, bucket_id: 'profile-media', storage_path: path, media_kind: 'image', mime_type: file.type, byte_size: file.size, width, height, purpose: 'avatar', is_primary: true })
    if (metadataError) {
      await supabase.storage.from('profile-media').remove([path])
      if (prior) await supabase.from('profile_media').update({ is_primary: true }).eq('id', prior.id).eq('profile_id', user.id)
      setProfileBusy(false); setProfileMessage('Photo metadata could not be saved. Confirm database migrations and Storage policies.'); return
    }
    if (prior) { await supabase.from('profile_media').delete().eq('id', prior.id).eq('profile_id', user.id); await supabase.storage.from('profile-media').remove([prior.storage_path]) }
    const { data: signed } = await supabase.storage.from('profile-media').createSignedUrl(path, 3600)
    setAvatarUrl(signed?.signedUrl ?? ''); setProfileBusy(false); setProfileMessage('Profile photo updated.')
  }

  async function signOut() {
    const { error } = await createClient().auth.signOut()
    if (error) { setProfileMessage('Sign out failed. Please try again.'); return }
    setUser(null); setProfile(null); setDashboard(false); setAvatarUrl(''); setProfileMessage('')
  }

  const gameName = (gameId: string) => games.find((game) => game.id === gameId)?.name ?? 'Game'
  if (dashboard) return <section className="dashboard-screen"><header><button className="brand" onClick={() => setDashboard(false)}><b>A</b> ARCANIX</button><span>{profile?.display_name ?? 'My player profile'}</span>{user && <><span className="header-avatar">{initials(profile?.display_name ?? user.email ?? 'A')}</span><button className="plain" onClick={() => void signOut()}>Sign out</button></>}</header>{authLoading ? <p className="dashboard-state status-block">Checking your session…</p> : !user ? <main className="dashboard-state"><h1>Sign in to access your player profile.</h1><button className="cta" onClick={() => openAuth('login')}>Log in</button><button className="link" onClick={() => setDashboard(false)}>Back to Arcanix</button></main> : !profile ? <main className="dashboard-state"><p className="status-block">{profileMessage || 'Loading your saved profile…'}</p><button className="plain" onClick={() => void loadProfile(user.id)}>Retry profile load</button></main> : <main className="dashboard-grid"><aside><div className="profile-panel"><div className="cover" /><div className="profile-photo-row">{avatarUrl ? <img className="avatar-preview" src={avatarUrl} alt="Your profile" /> : <div className="avatar-placeholder">{initials(profile.display_name)}</div>}<strong>{profile.display_name}</strong></div><p>@{profile.handle} · {profile.city || 'Add your location'}</p><form onSubmit={saveProfile} className="profile-edit"><label>DISPLAY NAME<input name="display_name" defaultValue={profile.display_name} maxLength={100} required /></label><label>USERNAME<input name="handle" defaultValue={profile.handle} pattern="[a-zA-Z0-9_]{3,30}" required /></label><label>HEADLINE<input name="headline" defaultValue={profile.headline ?? ''} maxLength={160} placeholder="Player · IGL · Content creator" /></label><label>LOCATION<input name="city" defaultValue={profile.city ?? ''} maxLength={100} /></label><label>COUNTRY CODE<input name="country_code" defaultValue={profile.country_code ?? ''} maxLength={2} placeholder="IN" /></label><label>BIO<textarea name="bio" defaultValue={profile.bio ?? ''} maxLength={500} /></label><label>PROFILE VISIBILITY<select value={visibility} onChange={(event) => setVisibility(parseVisibility(event.target.value))}><option value="public">Public</option><option value="members">Connections and team members</option><option value="private">Only me</option></select></label><label className="check-label"><input type="checkbox" name="is_discoverable" defaultChecked={profile.is_discoverable} /> Show in player discovery</label><button className="cta" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button></form><form className="profile-edit profile-section" onSubmit={uploadAvatar}><h3>Profile photo</h3><label>JPEG, PNG, WebP or AVIF · max 10 MB<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label><button className="plain" disabled={profileBusy}>Upload photo</button></form></div><p className="sdg">17<br /><small>PARTNERSHIPS FOR THE GOALS</small></p></aside><section><p className="eyebrow">YOUR PLAYER PROFILE</p><h1>Welcome, {profile.display_name}.</h1><div className="share">Your profile information is stored in your Arcanix account. Visibility rules control who can discover it.</div><form className="profile-edit profile-section" onSubmit={saveCompetitive}><h3>Competitive details</h3><label>PREFERRED GAME<select value={primaryGame} onChange={(event) => setPrimaryGame(event.target.value)}><option value="">Choose a game</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><label>PRIMARY ROLE<input value={primaryRole} onChange={(event) => setPrimaryRole(event.target.value)} maxLength={100} placeholder="Entry fragger, IGL, support…" /></label><label>RANK<input value={rankLabel} onChange={(event) => setRankLabel(event.target.value)} maxLength={100} placeholder="Your current rank" /></label><label>AVAILABILITY<select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="open">Open to opportunities</option><option value="limited">Limited availability</option><option value="not_looking">Not looking</option></select></label><button className="cta" disabled={profileBusy}>Save competitive details</button></form><section className="profile-section"><h3>Games and skills</h3><form className="profile-edit" onSubmit={addSkill}><label>GAME<select name="game_id" defaultValue=""><option value="">Choose game</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><label>ROLE<input name="role_name" maxLength={100} required /></label><label>RANK<input name="rank_label" maxLength={100} /></label><button className="plain" disabled={profileBusy}>Add game and role</button></form><div className="profile-list">{skills.map((skill) => <article key={skill.id}><strong>{gameName(skill.game_id)} · {skill.role_name}</strong><p>{skill.rank_label || 'Rank not listed'}{skill.years_experience ? ` · ${skill.years_experience} years` : ''}</p><button onClick={() => void removeSkill(skill.id)}>Remove</button></article>)}</div></section><section className="profile-section"><h3>Achievements</h3><form className="profile-edit" onSubmit={addAchievement}><label>TITLE<input name="title" maxLength={200} required /></label><label>ISSUER<input name="issuer" maxLength={150} /></label><label>PLACEMENT<input name="placement" maxLength={100} placeholder="1st place, finalist…" /></label><label>DATE<input name="achieved_on" type="date" /></label><button className="plain" disabled={profileBusy}>Add achievement</button></form><div className="profile-list">{achievements.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{[item.issuer, item.placement, item.achieved_on].filter(Boolean).join(' · ')}</p></article>)}</div></section><section className="profile-section"><h3>Team experience</h3><form className="profile-edit" onSubmit={addExperience}><label>ROLE OR TITLE<input name="title" maxLength={150} required /></label><label>TEAM<input name="team_name" maxLength={150} /></label><label>STARTED<input name="started_on" type="date" /></label><label>DESCRIPTION<textarea name="description" maxLength={2000} /></label><label className="check-label"><input name="is_current" type="checkbox" /> Current team</label><button className="plain" disabled={profileBusy}>Add experience</button></form><div className="profile-list">{experience.map((item) => <article key={item.id}><strong>{item.title}{item.team_name ? ` · ${item.team_name}` : ''}</strong><p>{item.description}{item.is_current ? ' · Current' : ''}</p></article>)}</div></section><h2>Player directory</h2><DirectoryList rows={filteredDirectory} loading={directoryLoading} error={directoryError} signedIn onRetry={() => void loadDirectory()} /></section><PlayerPosts userId={user.id} /><aside><h3>Teams & opportunities</h3><p>Recruitment management and applications are not yet connected to the app interface.</p><div className="status-block">Your directory listing is governed by discoverability, profile visibility, and database RLS.</div></aside></main>}{profileMessage && <p className="dashboard-toast" role="status">{profileMessage}</p>}{authOpen && <AuthModal mode={authMode} message={authMessage} messageSuccess={authMessageSuccess} busy={authBusy} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} onSwitch={() => openAuth(authMode === 'login' ? 'recovery' : 'login')} confirmationEmail={confirmationEmail} onResend={resendConfirmation} onSignup={() => openAuth('signup')} />}</section>

  return <><main><header className="topbar"><a className="brand" href="#home" aria-label="Arcanix home"><b>A</b> ARCANIX</a><nav aria-label="Main navigation"><a href="#home">Home</a><a href="#discover">Discover</a><a href="#talent">Players</a><a href="#teams">Teams</a><a href="#opportunities">Opportunities</a></nav><div className="top-actions"><span className="live-dot">PLAYER NETWORK</span>{user ? <><button className="header-avatar" aria-label="Open profile" onClick={() => setDashboard(true)}>{initials(profile?.display_name ?? user.email ?? 'A')}</button><button className="plain" onClick={() => setDashboard(true)}>My profile</button></> : <><button className="plain" onClick={() => openAuth('login')}>Sign in</button><button className="cta" onClick={() => openAuth('signup')}>Create account ↗</button></>}<button className="mobile-menu-toggle plain" aria-expanded={mobileMenu} onClick={() => setMobileMenu((open) => !open)}>{mobileMenu ? 'Close' : 'Menu'}</button></div>{mobileMenu && <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#home" onClick={() => setMobileMenu(false)}>Home</a><a href="#discover" onClick={() => setMobileMenu(false)}>Discover</a><a href="#talent" onClick={() => setMobileMenu(false)}>Players</a><a href="#teams" onClick={() => setMobileMenu(false)}>Teams</a><a href="#opportunities" onClick={() => setMobileMenu(false)}>Opportunities</a></nav>}</header><section id="home" className="hero"><div><p className="eyebrow">● THE PROFESSIONAL NETWORK FOR ESPORTS</p><h1>Meet the people<br />who <em>move you</em><br />forward.</h1><p>Build a trusted esports identity, meet compatible teammates, and turn your skill into a real opportunity.</p><div className="hero-actions"><button className="cta" onClick={() => user ? setDashboard(true) : openAuth('signup')}>Create your player card ↗</button><button className="link" onClick={() => document.getElementById('talent')?.scrollIntoView({ behavior: 'smooth' })}>Explore the arena <span>→</span></button></div><div className="trust-row"><span>PLAYER IDENTITY</span><span>TEAM DISCOVERY</span><span>OPEN OPPORTUNITIES</span></div></div><div className="hero-card"><div className="hero-card-top"><span>PROFILE PREVIEW · SAMPLE</span><i>ARCANIX</i></div><div className="player-orbit"><div className="orbit-avatar">A</div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /></div><h2>Your player card</h2><p>Game · role · region</p><b>YOUR SKILLS, YOUR STORY</b><div className="hero-stats"><strong>01<small>IDENTITY</small></strong><strong>02<small>DISCOVERY</small></strong><strong>03<small>OPPORTUNITY</small></strong></div></div></section><section className="ticker">VALORANT <i>✦</i> BGMI <i>✦</i> COUNTER-STRIKE 2 <i>✦</i> APEX LEGENDS <i>✦</i> ROCKET LEAGUE</section><section id="discover" className="section"><p className="eyebrow">ONE CONNECTED ARENA</p><h2>Skill deserves a <em>clearer path.</em></h2><div className="features"><article><b>01 / PLAYER IDENTITY</b><h3>Your profile carries your game.</h3><p>Bring ranks, roles, achievements and highlights into one profile teams can trust.</p></article><article><b>02 / SCOUTING</b><h3>Search with intent.</h3><p>Find real player profiles through visibility-aware discovery.</p></article><article><b>03 / OPPORTUNITIES</b><h3>Take your shot.</h3><p>Meet teams and pursue roster opportunities as the network grows.</p></article></div></section><section id="teams" className="dark section"><p className="eyebrow">BUILT FOR TEAMS</p><h2>Find a squad that plays <em>your game.</em></h2><div className="tryouts"><article><span>TEAM DISCOVERY</span><h3>Meet your next teammates.</h3><button onClick={() => user ? setDashboard(true) : openAuth('signup')}>Explore player profiles <i>→</i></button></article><article id="opportunities"><span>ROSTER BUILDING</span><h3>Make your next move.</h3><button onClick={() => user ? setDashboard(true) : openAuth('signup')}>Create your player profile <i>→</i></button></article><article><span>PLAYER NETWORK</span><h3>Build a stronger roster.</h3><button onClick={() => document.getElementById('talent')?.scrollIntoView({ behavior: 'smooth' })}>Discover players <i>→</i></button></article></div></section><section id="talent" className="section talent-section"><p className="eyebrow">BUILT FOR TEAMS</p><h2>Spot talent before everyone <em>else.</em></h2><div className="talent-toolbar"><input aria-label="Search players" placeholder="Search name, username, role, or city" value={filter} onChange={(event) => setFilter(event.target.value)} /><span>PLAYER DIRECTORY <b>{user ? directory.length : '—'}</b></span></div><DirectoryList rows={filteredDirectory} loading={user ? directoryLoading : authLoading} error={directoryError} signedIn={Boolean(user)} onRetry={() => user ? void loadDirectory() : openAuth('login')} /></section><section id="founders" className="founders"><div className="founders-intro"><p className="eyebrow">THE PEOPLE BEHIND THE ARENA</p><h2>Built by gamers.<br /><em>Backed by purpose.</em></h2><p>We are working toward a more visible, more connected path for the next generation of esports talent.</p><div className="founder-stats"><span><b>04</b> FOUNDERS</span><span><b>01</b> SHARED MISSION</span></div></div><div className="founder-grid">{founders.map((founder, index) => <article className={`founder founder-${index + 1}`} key={founder.name}><div className="founder-photo">{founder.portrait ? <img src={founder.portrait} alt={`${founder.name} portrait`} /> : <span>0{index + 1}</span>}</div><div className="founder-copy"><span>0{index + 1}</span><h3>{founder.name}</h3><p className="founder-role">{founder.role}</p><p className="founder-note">{founder.description}</p></div></article>)}</div></section><section id="impact" className="impact"><b>17</b><div><p className="eyebrow">A SHARED GOAL</p><h2>More access. <em>More possibility.</em></h2><p>Arcanix helps players, teams and communities find one another and collaborate across regions.</p></div><span className="impact-mark">PARTNER<br />TO PLAY</span></section></main><footer><div className="footer-brand"><a className="brand" href="#home"><b>A</b> ARCANIX</a><p>The professional network for esports players, teams, and opportunity.</p></div><div className="footer-links"><div><span>EXPLORE</span><a href="#talent">Discover players</a><a href="#teams">Teams</a><a href="#opportunities">Opportunities</a><a href="#founders">Founders</a></div><div><span>MISSION</span><a href="/mission">Our mission</a><a href="https://sdgs.un.org/goals/goal17" target="_blank" rel="noopener noreferrer">SDG 17 impact ↗</a><a href="/impact">Our SDG 17 alignment</a></div></div><div className="footer-cta"><p>READY TO<br /><em>QUEUE UP?</em></p><button className="cta" onClick={() => user ? setDashboard(true) : openAuth('signup')}>Join the network ↗</button></div><div className="footer-bottom"><span>© {new Date().getFullYear()} ARCANIX / INDIA</span><span>DESIGNED FOR THE NEXT PLAY</span><span>PLAY FAIR. BUILD TOGETHER.</span></div></footer>{profileMessage && <p className="dashboard-toast" role="status">{profileMessage}</p>}{authOpen && <AuthModal mode={authMode} message={authMessage} messageSuccess={authMessageSuccess} busy={authBusy} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} onSwitch={() => openAuth(authMode === 'login' ? 'recovery' : 'login')} confirmationEmail={confirmationEmail} onResend={resendConfirmation} onSignup={() => openAuth('signup')} />}</>
}

function DirectoryList({ rows, loading, error, signedIn, onRetry }: { rows: Player[]; loading: boolean; error: string; signedIn: boolean; onRetry: () => void }) {
  if (!signedIn) return <div className="directory-state"><p>Sign in to discover player profiles that are visible to you.</p><button className="cta" onClick={onRetry}>Log in to discover players</button></div>
  if (loading) return <div className="directory-state" role="status">Loading player profiles…</div>
  if (error) return <div className="directory-state" role="alert"><p>{error}</p><button className="plain" onClick={onRetry}>Try again</button></div>
  if (!rows.length) return <div className="directory-state"><p>No visible players match this search yet.</p><p>Complete your profile and enable discovery to appear here.</p></div>
  return <div className="results">{rows.map((player) => <article key={player.id}><i aria-hidden="true">{initials(player.display_name)}</i><div><a href={`/players/${encodeURIComponent(player.handle)}`}><b>{player.display_name}</b></a><p>{player.headline || player.roles.join(' · ') || 'Esports player'}</p><small>{[player.city, player.country_code].filter(Boolean).join(', ') || 'Location not listed'} · @{player.handle}</small></div></article>)}</div>
}

function AuthModal({ mode, message, messageSuccess, busy, confirmationEmail, onResend, onSubmit, onClose, onSwitch, onSignup }: { mode: AuthMode; message: string; messageSuccess: boolean; busy: boolean; confirmationEmail: string; onResend: () => void | Promise<void>; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; onClose: () => void; onSwitch: () => void; onSignup: () => void }) {
  const title = mode === 'signup' ? 'Enter the arena.' : mode === 'recovery' ? 'Reset your password.' : 'Welcome back.'
  const action = mode === 'signup' ? 'Create account ↗' : mode === 'recovery' ? 'Send reset link ↗' : 'Sign in ↗'
  return <div className="modal" role="presentation"><form onSubmit={onSubmit} aria-label={title}><button type="button" className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">ARCANIX ACCOUNT</p><h2>{title}</h2>{mode === 'signup' && <><label>PLAYER NAME<input name="name" autoComplete="name" maxLength={100} required /></label><label>USERNAME<input name="handle" autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" required /><small>3–30 letters, numbers, or underscores</small></label></>}<label>EMAIL<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>{mode !== 'recovery' && <label>PASSWORD<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} maxLength={72} required /></label>}{mode === 'signup' && <label>CONFIRM PASSWORD<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>}{message && <p className={messageSuccess ? "message success" : "message"} role="status">{message}</p>}{confirmationEmail && <button className="plain" type="button" onClick={() => void onResend()} disabled={busy}>Resend confirmation email</button>}<button className="cta" type="submit" disabled={busy}>{busy ? 'Please wait…' : action}</button>{mode === 'login' && <button className="plain" type="button" onClick={onSwitch}>Forgot your password?</button>}<button className="plain" type="button" onClick={mode === 'login' ? onSignup : onSwitch}>{mode === 'signup' ? 'Already have an account? Sign in' : mode === 'login' ? 'New here? Create an account' : 'Back to sign in'}</button></form></div>
}

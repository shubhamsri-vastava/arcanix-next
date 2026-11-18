import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PlayerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: player, error } = await supabase.from('profiles')
    .select('id,handle,display_name,headline,bio,city,country_code')
    .eq('handle', handle).eq('is_discoverable', true).eq('is_suspended', false).is('deleted_at', null).maybeSingle()
  if (error || !player) notFound()

  const [details, media, skills, achievements, experience] = await Promise.all([
    supabase.from('player_details').select('primary_game_id,primary_role,rank_label,availability').eq('profile_id', player.id).maybeSingle(),
    supabase.from('profile_media').select('storage_path').eq('profile_id', player.id).eq('purpose', 'avatar').eq('is_primary', true).maybeSingle(),
    supabase.from('player_skills').select('id,game_id,role_name,rank_label').eq('profile_id', player.id).order('is_primary', { ascending: false }),
    supabase.from('player_achievements').select('id,title,issuer,placement,achieved_on').eq('profile_id', player.id).order('achieved_on', { ascending: false }),
    supabase.from('player_experience').select('id,title,team_name,description,started_on,ended_on,is_current').eq('profile_id', player.id).order('started_on', { ascending: false }),
  ])
  let avatarUrl = ''
  if (media.data) {
    const { data } = await supabase.storage.from('profile-media').createSignedUrl(media.data.storage_path, 1800)
    avatarUrl = data?.signedUrl ?? ''
  }
  const gameIds = [...new Set([details.data?.primary_game_id, ...(skills.data ?? []).map((skill) => skill.game_id)].filter((id): id is string => Boolean(id)))]
  const gameResult = gameIds.length ? await supabase.from('games').select('id,name').in('id', gameIds) : { data: [] }
  const gameName = (id: string | null) => gameResult.data?.find((item) => item.id === id)?.name

  return <main className="player-page"><Link href="/#talent" className="player-back">← Player directory</Link><article className="player-profile-card"><div className="cover" />{avatarUrl ? <img className="avatar-preview" src={avatarUrl} alt={`${player.display_name} profile`} /> : <div className="avatar-placeholder">{player.display_name.slice(0, 1).toUpperCase()}</div>}<p className="eyebrow">ARCANIX PLAYER</p><h1>{player.display_name}</h1><p className="player-handle">@{player.handle}</p>{player.headline && <h2>{player.headline}</h2>}<p>{[player.city, player.country_code].filter(Boolean).join(', ') || 'Location not listed'}</p>{details.data && <div className="player-competitive"><h2>Competitive profile</h2><p>{[gameName(details.data.primary_game_id), details.data.primary_role, details.data.rank_label].filter(Boolean).join(' · ') || 'Game details not listed'}</p><p>{details.data.availability === 'open' ? 'Open to opportunities' : details.data.availability === 'limited' ? 'Limited availability' : 'Not currently looking'}</p></div>}{player.bio && <div className="player-bio">{player.bio}</div>}{skills.data?.length ? <section className="public-profile-section"><h2>Games and roles</h2>{skills.data.map((skill) => <p key={skill.id}>{gameName(skill.game_id)} · {skill.role_name}{skill.rank_label ? ` · ${skill.rank_label}` : ''}</p>)}</section> : null}{experience.data?.length ? <section className="public-profile-section"><h2>Team experience</h2>{experience.data.map((item) => <article key={item.id}><strong>{item.title}{item.team_name ? ` · ${item.team_name}` : ''}</strong><p>{item.description}</p></article>)}</section> : null}{achievements.data?.length ? <section className="public-profile-section"><h2>Achievements</h2>{achievements.data.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{[item.issuer, item.placement, item.achieved_on].filter(Boolean).join(' · ')}</p></article>)}</section> : null}</article></main>
}

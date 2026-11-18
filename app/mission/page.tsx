import Link from 'next/link'

export default function MissionPage() {
  return (
    <main className="info-page">
      <Link className="brand" href="/"><b>A</b> ARCANIX</Link>
      <p className="eyebrow">OUR MISSION</p>
      <h1>Make esports opportunity easier to find.</h1>
      <p className="info-lead">Arcanix is being built to connect esports players, teams, organizations, and recruiters through a more accessible professional network.</p>
      <div className="info-grid">
        <article><span>01 / DISCOVER</span><h2>Help players be seen.</h2><p>Give players a place to present their games, roles, experience, and achievements in one profile.</p></article>
        <article><span>02 / CONNECT</span><h2>Bring the right people together.</h2><p>Support meaningful connections between players, organizations, and recruiters across the esports community.</p></article>
        <article><span>03 / COLLABORATE</span><h2>Make room for new teams.</h2><p>Help people discover opportunities and work together to build stronger rosters and communities.</p></article>
      </div>
      <p className="info-note">Arcanix is an evolving platform. These are its goals, not claims of measured impact or guaranteed outcomes.</p>
      <Link className="info-back" href="/">← Back to Arcanix</Link>
    </main>
  )
}

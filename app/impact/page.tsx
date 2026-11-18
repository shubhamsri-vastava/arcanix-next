import Link from 'next/link'

export default function ImpactPage() {
  return (
    <main className="info-page">
      <Link className="brand" href="/"><b>A</b> ARCANIX</Link>
      <p className="eyebrow">SDG 17 · PARTNERSHIPS FOR THE GOALS</p>
      <h1>Connection can create room to collaborate.</h1>
      <p className="info-lead">Arcanix aims to help esports players and organizations discover one another, connect, and explore opportunities together. That mission conceptually aligns with the United Nations Sustainable Development Goal 17 focus on partnerships.</p>
      <article className="info-panel">
        <h2>Our commitment and its limits</h2>
        <p>This describes the platform’s intended contribution. Arcanix is not affiliated with, certified by, or endorsed by the United Nations, and no measurable social impact is claimed here.</p>
        <a className="cta info-source" href="https://sdgs.un.org/goals/goal17" target="_blank" rel="noopener noreferrer">Read the official UN Goal 17 page ↗</a>
      </article>
      <Link className="info-back" href="/">← Back to Arcanix</Link>
    </main>
  )
}

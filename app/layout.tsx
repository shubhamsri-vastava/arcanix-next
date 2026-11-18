import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arcanix — Find your squad',
  description: 'The professional network for esports players and teams.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}

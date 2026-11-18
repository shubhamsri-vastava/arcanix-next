# Arcanix Next.js migration

This project preserves the original Arcanix visual direction while moving it to Next.js App Router, TypeScript, and Supabase SSR client configuration.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase Project URL and publishable key from **Project Connect**.
3. Run `pnpm dev`.
4. Open `http://localhost:3000`.

No database schema or migrations are included yet. The next phase should review the relational data model and RLS rules before profiles, posts, media, or social interactions are connected to Supabase.

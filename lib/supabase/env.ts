export type SupabasePublicConfig = { url: string; publishableKey: string }

const productionProjectRef = 'tacaqmstvqbvkpibhlnz'

function developmentConfigIsValid() {
  if (process.env.NODE_ENV !== 'development') return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const expectedRef = process.env.NEXT_PUBLIC_ARCANIX_SUPABASE_DEV_PROJECT_REF
  if (!url || !expectedRef || expectedRef === productionProjectRef) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === `${expectedRef}.supabase.co`
  } catch {
    return false
  }
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && developmentConfigIsValid())
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!developmentConfigIsValid()) {
    throw new Error('Development Supabase is not configured for a verified development project. Set the matching development project reference in .env.development.local.')
  }
  if (!url || !publishableKey) {
    throw new Error('Supabase is not configured. Add the project URL and publishable key to the environment file for this deployment.')
  }
  return { url, publishableKey }
}

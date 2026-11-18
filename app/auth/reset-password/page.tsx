'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setReady(true); setMessage('Password reset is unavailable until Supabase is configured.'); return }
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'callback-error') {
      setReady(true); setMessage('This reset or confirmation link is invalid or expired. Request a fresh email and try again.'); return
    }
    void createClient().auth.getUser().then(({ data, error }) => {
      setReady(true)
      if (error || !data.user) setMessage('This reset link is invalid or expired. Request a new reset email.')
    }).catch(() => { setReady(true); setMessage('We could not verify this reset link. Check your connection and try again.') })
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('')
    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') ?? '')
    const confirmation = String(values.get('confirmation') ?? '')
    if (password.length < 8 || password.length > 72) { setMessage('Use a password between 8 and 72 characters.'); return }
    if (password !== confirmation) { setMessage('The passwords do not match.'); return }
    setBusy(true)
    try {
      const { error } = await createClient().auth.updateUser({ password })
      if (error) { setMessage('The password could not be updated. The recovery session may have expired; request a fresh link.') }
      else { setUpdated(true); setMessage('Password updated successfully.') }
    } catch { setMessage('Supabase could not be reached. Please try again.') }
    setBusy(false)
  }

  return <main className="reset-page"><form className="reset-card" onSubmit={save}><p className="eyebrow">ARCANIX ACCOUNT SECURITY</p><h1>Choose a new password.</h1>{!ready ? <p className="status-block">Checking your reset link…</p> : updated ? <p className="message success" role="status">{message}</p> : message && (!isSupabaseConfigured() || message.startsWith('This reset') || message.startsWith('We could not verify')) ? <p className="message" role="status">{message}</p> : <>{message && <p className="message" role="status">{message}</p>}<label>NEW PASSWORD<input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></label><label>CONFIRM PASSWORD<input name="confirmation" type="password" minLength={8} maxLength={72} autoComplete="new-password" required /></label><button className="cta" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></>}<Link href="/?auth=login">Return to sign in</Link>{ready && !updated && message && <Link href="/?auth=recovery">Request a fresh reset email</Link>}</form></main>
}

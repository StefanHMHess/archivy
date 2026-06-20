import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../tokens'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('login') // 'login' oder 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      onLogin(data.user)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.user) {
        setError(null)
        setMode('login')
        setPassword('')
        setEmail(email)
      }
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp6 }}>
      <div style={{ width: 360, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp6, boxShadow: T.shadowMd }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          {mode === 'login' ? 'Anmelden' : 'Registrieren'}
        </h1>
        <p style={{ marginTop: T.sp2, color: T.textMuted }}>
          {mode === 'login' 
            ? 'Gib deine E-Mail und dein Passwort ein.'
            : 'Erstelle einen neuen Account.'}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginTop: T.sp4, fontSize: 13, color: T.textMuted }}>E-Mail</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            required
            style={{ width: '100%', padding: T.sp3, marginTop: T.sp2, border: `1px solid ${T.border}`, borderRadius: T.r2, boxSizing: 'border-box' }}
          />

          <label style={{ display: 'block', marginTop: T.sp4, fontSize: 13, color: T.textMuted }}>Passwort</label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            style={{ width: '100%', padding: T.sp3, marginTop: T.sp2, border: `1px solid ${T.border}`, borderRadius: T.r2, boxSizing: 'border-box' }}
          />

          {error && (
            <div style={{ marginTop: T.sp4, color: T.danger, fontSize: 13 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: T.sp6,
              width: '100%',
              background: T.primary,
              color: T.textOnTeal,
              border: 'none',
              borderRadius: T.r2,
              padding: `${T.sp3} ${T.sp4}`,
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {loading 
              ? (mode === 'login' ? 'Anmeldung…' : 'Registrierung…')
              : (mode === 'login' ? 'Einloggen' : 'Account erstellen')}
          </button>
        </form>

        <div style={{ marginTop: T.sp4, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
            style={{
              background: 'none',
              border: 'none',
              color: T.primary,
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 13,
            }}
          >
            {mode === 'login' 
              ? 'Neuen Account erstellen?' 
              : 'Bereits angemeldet?'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../tokens'

const FALLBACK_OWNER = {
  id: '__all__',
  name: 'alle',
  display_name: 'Alle Bereiche',
  allowed_users: [],
}

export default function OwnerSelector({ user, onSelectOwner }) {
  const [owners, setOwners] = useState([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState(null)

  useEffect(() => {
    let aktiv = true
    async function ladenOwners() {
      setLaden(true)
      setFehler(null)
      const { data, error } = await supabase
        .from('vertragsbesitzer')
        .select('id,name,display_name,allowed_users')
        .order('name', { ascending: true })

      if (!aktiv) return
      if (error) {
        setFehler(error.message || 'Inhaber konnten nicht geladen werden.')
        setOwners([FALLBACK_OWNER])
      } else {
        const rows = buildOwnerOptions(data)
        setOwners(rows.length === 0 ? [FALLBACK_OWNER] : rows)
      }
      setLaden(false)
    }
    ladenOwners()
    return () => { aktiv = false }
  }, [])

  function isAllowed(owner) {
    if (owner.id === FALLBACK_OWNER.id) return true
    const allowedUsers = Array.isArray(owner.allowed_users) ? owner.allowed_users : []
    if (allowedUsers.length === 0) return true
    return allowedUsers.some(email => String(email || '').trim().toLowerCase() === user.email.toLowerCase())
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: T.sp6,
        background: 'radial-gradient(1200px 480px at 20% 0%, #ccfbf1 0%, #f8fafc 55%, #f1f5f9 100%)',
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          padding: T.sp6,
          boxShadow: T.shadowMd,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp4, marginBottom: T.sp3, flexWrap: 'wrap' }}>
          <img src="/icons/archivy-icon.svg" alt="Archivy" style={{ width: 52, height: 52 }} />
          <div>
            <div style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#0f766e' }}>ARCHIVY</div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>Willkommen, {user.email}</h1>
          </div>
        </div>
        <p style={{ marginTop: 0, marginBottom: T.sp4, color: T.textMuted, fontSize: 15, lineHeight: 1.35 }}>
          Schön, dass du da bist (und nicht hier).<br />
          Wähle deinen Bereich und starte direkt in deine Vertragsübersicht.
        </p>
        <p style={{ marginTop: 0, marginBottom: T.sp4, color: T.textMuted, fontSize: 13, lineHeight: 1.45 }}>
          Archivy ist ein Produkt entwickelt von Wohnbau Hess.
        </p>

        {fehler && <div style={{ marginTop: T.sp4, color: T.danger }}>{fehler}</div>}

        {laden ? (
          <p style={{ marginTop: T.sp4, color: T.textMuted }}>Lädt…</p>
        ) : (
          <div style={{ display: 'grid', gap: T.sp3, marginTop: T.sp4 }}>
            {owners.length === 0 ? (
              <p style={{ color: T.textMuted }}>Keine Inhaber gefunden.</p>
            ) : owners.map(owner => {
              const erlaubnis = isAllowed(owner)
              return (
                <button
                  key={owner.id}
                  onClick={() => erlaubnis && onSelectOwner(owner)}
                  disabled={!erlaubnis}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    padding: T.sp4,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    background: erlaubnis ? '#f8fffd' : '#f8fafc',
                    color: erlaubnis ? T.textMain : T.textMuted,
                    cursor: erlaubnis ? 'pointer' : 'not-allowed',
                    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                    boxShadow: erlaubnis ? '0 1px 0 rgba(15,118,110,0.06)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!erlaubnis) return
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,118,110,0.12)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = erlaubnis ? '0 1px 0 rgba(15,118,110,0.06)' : 'none'
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      fontWeight: 700,
                      fontSize: 22,
                      lineHeight: 1.15,
                      letterSpacing: '-0.3px',
                    }}
                  >
                    {owner.display_name || owner.name}
                  </div>
                </button>
              )
            })}

          </div>
        )}
      </div>
    </div>
  )
}

function buildOwnerOptions(rows) {
  return (rows ?? [])
    .map(row => ({
      id: String(row?.id ?? '').trim(),
      name: String(row?.name ?? '').trim(),
      display_name: String(row?.display_name ?? '').trim(),
      allowed_users: Array.isArray(row?.allowed_users) ? row.allowed_users : [],
    }))
    .filter(row => row.id)
}

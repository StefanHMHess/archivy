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
  const [tableMissing, setTableMissing] = useState(false)
  const [firstOwnerName, setFirstOwnerName] = useState('')
  const [creatingFirstOwner, setCreatingFirstOwner] = useState(false)

  useEffect(() => {
    let aktiv = true
    async function ladenOwners() {
      setLaden(true)
      const { data, error } = await supabase
        .from('vertragsbesitzer')
        .select('id,name,display_name,allowed_users')
        .order('name', { ascending: true })

      if (!aktiv) return
      if (error) {
        const msg = error.message || ''
        const missing = msg.includes("Could not find the table 'public.vertragsbesitzer'")
        setTableMissing(missing)
        setFehler(missing ? null : msg)
        if (missing) {
          setOwners([FALLBACK_OWNER])
        }
      } else {
        const rows = data ?? []
        setOwners(rows.length === 0 ? [FALLBACK_OWNER] : rows)
        setTableMissing(false)
      }
      setLaden(false)
    }
    ladenOwners()
    return () => { aktiv = false }
  }, [])

  function isAllowed(owner) {
    if (owner.id === FALLBACK_OWNER.id) return true
    if (!owner.allowed_users) return false
    return owner.allowed_users.includes(user.email)
  }

  async function handleCreateFirstOwner() {
    const name = firstOwnerName.trim()
    if (!name) return
    setCreatingFirstOwner(true)
    setFehler(null)

    const payload = {
      id: slugify(name),
      name,
      display_name: name,
      allowed_users: [user.email],
    }

    const { error } = await supabase.from('vertragsbesitzer').insert(payload)
    if (error) {
      setFehler(error.message)
      setCreatingFirstOwner(false)
      return
    }

    const createdOwner = {
      id: payload.id,
      name: payload.name,
      display_name: payload.display_name,
      allowed_users: payload.allowed_users,
    }
    setCreatingFirstOwner(false)
    setFirstOwnerName('')
    onSelectOwner(createdOwner)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: T.sp6 }}>
      <div style={{ width: 520, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp6, boxShadow: T.shadowMd }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Inhaber wählen</h1>
        <p style={{ marginTop: T.sp2, color: T.textMuted }}>Wähle den Bereich, den du sehen möchtest.</p>

        {tableMissing && (
          <div style={{ marginTop: T.sp4, padding: T.sp3, borderRadius: T.r2, background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
            Tabelle für <strong>Inhaber</strong> fehlt (technisch: <strong>vertragsbesitzer</strong>). Du kannst mit "Alle Bereiche" weiterarbeiten und die Tabelle später anlegen.
          </div>
        )}

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
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: T.sp4,
                    borderRadius: T.r2,
                    border: `1px solid ${T.border}`,
                    background: erlaubnis ? T.bgCard : '#f8fafc',
                    color: erlaubnis ? T.textMain : T.textMuted,
                    cursor: erlaubnis ? 'pointer' : 'not-allowed',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{owner.display_name || owner.name}</div>
                    <div style={{ fontSize: 13, color: T.textMuted }}>Zugriff für {user.email}</div>
                  </div>
                  {!erlaubnis && <span style={{ color: T.warning }}>Kein Zugriff</span>}
                </button>
              )
            })}

            {owners.length === 1 && owners[0]?.id === FALLBACK_OWNER.id && !tableMissing && (
              <div style={{ marginTop: T.sp2, display: 'grid', gap: T.sp2 }}>
                <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
                  Es sind noch keine Inhaber angelegt. Du kannst mit "Alle Bereiche" starten oder direkt den ersten Inhaber erstellen.
                </p>
                <div style={{ display: 'flex', gap: T.sp2, flexWrap: 'wrap' }}>
                  <input
                    value={firstOwnerName}
                    onChange={e => setFirstOwnerName(e.target.value)}
                    placeholder="Name des ersten Inhabers"
                    style={{
                      flex: 1,
                      minWidth: 220,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r2,
                      padding: `${T.sp2} ${T.sp3}`,
                    }}
                  />
                  <button
                    onClick={handleCreateFirstOwner}
                    disabled={creatingFirstOwner || !firstOwnerName.trim()}
                    style={{
                      background: T.primary,
                      color: T.textOnTeal,
                      border: 'none',
                      borderRadius: T.r2,
                      padding: `${T.sp2} ${T.sp4}`,
                      cursor: creatingFirstOwner ? 'wait' : 'pointer',
                    }}
                  >
                    {creatingFirstOwner ? 'Erstellt…' : 'Ersten Inhaber anlegen'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function slugify(value) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return base || `inhaber-${Date.now()}`
}

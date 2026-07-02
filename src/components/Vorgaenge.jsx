import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'

const PAGE = 50

export default function Vorgaenge({ owner, onSelectVorgang }) {
  const ownerIds = useMemo(() => ownerVarianten(owner?.id), [owner?.id])
  const [zeilen, setZeilen] = useState([])
  const [suche, setSuche] = useState('')
  const [laden, setLaden] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!owner) return
    let aktiv = true
    async function laden() {
      setLaden(true)
      let query = supabase
        .from('vorgaenge')
        .select('vorgang_id, vorgang_art, beschreibung, kurzbeschreibung, bvh, frist, erledigt, verantwortlicher, datei_pfad')
        .order('erstellt', { ascending: false })
        .limit(PAGE)

      if (owner.id !== '__all__') {
        query = query.in('vertragsbesitzer_id', ownerIds)
      }

      if (suche.trim()) {
        query = query.ilike('kurzbeschreibung', `%${suche.trim()}%`)
      }

      const { data } = await query
      if (aktiv) {
        setZeilen((data ?? []).filter(v => !enthaeltParserFehler(v.vorgang_id) && !enthaeltParserFehler(v.vorgang_art) && !enthaeltParserFehler(v.beschreibung) && !enthaeltParserFehler(v.kurzbeschreibung)))
        setLaden(false)
      }
    }
    laden()
    return () => { aktiv = false }
  }, [suche, owner])

  if (!owner) {
    return <p style={{ color: T.textMuted }}>Bitte wähle zuerst einen Inhaber aus.</p>
  }

  async function neuVorgang() {
    if (!owner || owner.id === '__all__') {
      alert('Bitte einen konkreten Inhaber wählen, um einen Vorgang anzulegen.')
      return
    }

    setBusy(true)
    const nowIso = new Date().toISOString()
    const vorgang_id = `archivy-vorgang-${Date.now()}`
    const today = nowIso.slice(0, 10)

    const { data, error } = await supabase
      .from('vorgaenge')
      .insert({
        vorgang_id,
        vertragsbesitzer_id: owner.id,
        beschreibung: 'Neuer Vorgang',
        kurzbeschreibung: '',
        datum: today,
        sync_state: 'geaendert',
        app_modified_at: nowIso,
      })
      .select('vorgang_id')
      .single()

    setBusy(false)
    if (error) {
      alert(`Vorgang konnte nicht angelegt werden: ${error.message}`)
      return
    }

    onSelectVorgang?.(data?.vorgang_id || vorgang_id)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp4, marginBottom: T.sp5 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vorgänge</h1>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Suche…"
          style={{
            flex: 1, maxWidth: 320,
            border: `1px solid ${T.border}`, borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp3}`, outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={neuVorgang}
          disabled={busy}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? 'Anlegen…' : '+ Neuer Vorgang'}
        </button>
      </div>

      {laden ? (
        <p style={{ color: T.textMuted }}>Wird geladen…</p>
      ) : zeilen.length === 0 ? (
        <p style={{ color: T.textMuted }}>Keine Vorgänge gefunden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: 'left' }}>
                {['Beschreibung', 'Notiz', 'BVH', 'Frist', 'Verantwortlich'].map(h => (
                  <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map(v => (
                <tr key={v.vorgang_id} onClick={() => onSelectVorgang(v.vorgang_id)}
                  style={{
                    borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                    <span>{cleanText(v.beschreibung) || cleanText(v.kurzbeschreibung) || cleanText(v.vorgang_art) || '—'}</span>
                    {v.datei_pfad && <span style={{ marginLeft: T.sp2, color: T.primary }}>📄</span>}
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{v.kurzbeschreibung || v.vorgang_art || '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{v.bvh ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap', color: fristFarbe(v.frist, v.erledigt) }}>{v.frist ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{v.verantwortlicher ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ownerVarianten(ownerId) {
  const raw = String(ownerId ?? '').trim()
  if (!raw || raw === '__all__') return []

  const normalized = raw.replace(/\s*[+-]\s*/g, m => m.includes('+') ? '+' : '-')
  const plus = normalized.replace(/-/g, '+')
  const dash = normalized.replace(/\+/g, '-')

  return [...new Set([
    normalized,
    plus,
    dash,
    normalized.toLowerCase(),
    plus.toLowerCase(),
    dash.toLowerCase(),
  ])]
}

function fristFarbe(frist, erledigt) {
  if (!frist || erledigt) return T.textMain
  const diff = (new Date(frist) - new Date()) / 86400000
  if (diff < 0) return T.danger
  if (diff < 7) return T.warning
  return T.textMain
}

function enthaeltParserFehler(value) {
  if (typeof value !== 'string') return false
  return value.includes('Line 1, Column') || value.includes('Syntax error: value, object or array expected')
}

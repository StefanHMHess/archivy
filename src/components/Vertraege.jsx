import { useEffect, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'

const PAGE = 50
const SORTIERUNGEN = {
  firma_asc: { column: 'firma', ascending: true, label: 'Firma A-Z' },
  firma_desc: { column: 'firma', ascending: false, label: 'Firma Z-A' },
  gruppe_asc: { column: 'gruppe', ascending: true, label: 'Gruppe A-Z' },
  ablauf_asc: { column: 'vertrags_ablauf', ascending: true, label: 'Ablauf (früh zuerst)' },
  kosten_desc: { column: 'kosten_jaehrlich', ascending: false, label: 'Kosten/Jahr (hoch zuerst)' },
}

export default function Vertraege({ owner, onSelectContract }) {
  const [zeilen, setZeilen] = useState([])
  const [suche, setSuche] = useState('')
  const [gruppen, setGruppen] = useState([])
  const [gruppeFilter, setGruppeFilter] = useState('__all__')
  const [sortierung, setSortierung] = useState('firma_asc')
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    if (!owner) return
    let aktiv = true

    async function ladenGruppen() {
      let gruppenQuery = supabase
        .from('vertraege')
        .select('gruppe')
        .order('gruppe', { ascending: true })
        .limit(500)

      if (owner.id !== '__all__') {
        gruppenQuery = gruppenQuery.eq('vertragsbesitzer_id', owner.id)
      }

      const { data } = await gruppenQuery
      if (!aktiv) return
      const distinct = [...new Set((data ?? []).map(r => r.gruppe).filter(Boolean))]
      setGruppen(distinct)
    }

    async function laden() {
      setLaden(true)
      const sortDef = SORTIERUNGEN[sortierung] || SORTIERUNGEN.firma_asc
      let query = supabase
        .from('vertraege')
        .select('vertrag_id, gruppe, firma, beschreibung, vertragsnummer, kosten_jaehrlich, vertrags_ablauf, aktiv, logo:datei_pfad_2')
        .order(sortDef.column, { ascending: sortDef.ascending })
        .limit(PAGE)

      if (owner.id !== '__all__') {
        query = query.eq('vertragsbesitzer_id', owner.id)
      }

      if (gruppeFilter !== '__all__') {
        query = query.eq('gruppe', gruppeFilter)
      }

      if (suche.trim()) {
        query = query.or(`firma.ilike.%${suche.trim()}%,beschreibung.ilike.%${suche.trim()}%,vertragsnummer.ilike.%${suche.trim()}%`)
      }

      const { data } = await query
      if (aktiv) {
        setZeilen((data ?? []).filter(v => !enthaeltParserFehler(v.vertrag_id) && !enthaeltParserFehler(v.firma) && !enthaeltParserFehler(v.beschreibung) && !enthaeltParserFehler(v.vertragsnummer)))
        setLaden(false)
      }
    }
    ladenGruppen()
    laden()
    return () => { aktiv = false }
  }, [suche, owner, gruppeFilter, sortierung])

  if (!owner) {
    return <p style={{ color: T.textMuted }}>Bitte wähle zuerst einen Inhaber aus.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp4, marginBottom: T.sp5 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Verträge</h1>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Firma, Beschreibung, Nr…"
          style={{
            flex: 1, maxWidth: 320,
            border: `1px solid ${T.border}`, borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp3}`, outline: 'none',
          }}
        />
        <select
          value={gruppeFilter}
          onChange={e => setGruppeFilter(e.target.value)}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}` }}
        >
          <option value="__all__">Alle Gruppen</option>
          {gruppen.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={sortierung}
          onChange={e => setSortierung(e.target.value)}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}` }}
        >
          {Object.entries(SORTIERUNGEN).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
      </div>

      {laden ? (
        <p style={{ color: T.textMuted }}>Wird geladen…</p>
      ) : zeilen.length === 0 ? (
        <p style={{ color: T.textMuted }}>Keine Verträge gefunden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: 'left' }}>
                {['Gruppe', 'Logo', 'Firma', 'Beschreibung', 'Nr.', 'Kosten/Jahr', 'Ablauf'].map(h => (
                  <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map(v => (
                <tr key={v.vertrag_id} style={{ borderBottom: `1px solid ${T.border}`, opacity: v.aktiv ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => onSelectContract(v.vertrag_id)}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{v.gruppe ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>
                    <LogoCell logo={v.logo} firma={v.firma} />
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{v.firma ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{v.beschreibung ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{v.vertragsnummer ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {v.kosten_jaehrlich != null ? `${Number(v.kosten_jaehrlich).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}` : '—'}
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap', color: ablaufFarbe(v.vertrags_ablauf) }}>{v.vertrags_ablauf ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ablaufFarbe(ablauf) {
  if (!ablauf) return T.textMain
  const diff = (new Date(ablauf) - new Date()) / 86400000
  if (diff < 0) return T.danger
  if (diff < 60) return T.warning
  return T.textMain
}

function enthaeltParserFehler(value) {
  if (typeof value !== 'string') return false
  return value.includes('Line 1, Column') || value.includes('Syntax error: value, object or array expected')
}

function logoText(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || parts[0].slice(0, 2)).toUpperCase()
}

function LogoCell({ logo, firma }) {
  const [error, setError] = useState(false)
  const src = normalisiereLogoQuelle(logo)

  if (src && !error) {
    return (
      <img
        src={src}
        alt={firma || 'Logo'}
        onError={() => setError(true)}
        style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover', border: `1px solid ${T.border}` }}
      />
    )
  }

  return (
    <div style={{ width: 28, height: 28, borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
      {logoText(firma)}
    </div>
  )
}

function normalisiereLogoQuelle(value) {
  if (!value || typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/')) return v
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 120) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  return null
}

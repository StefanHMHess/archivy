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
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

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
        .select('id, vertrag_id, gruppe, firma, beschreibung, vertragsnummer, kosten_jaehrlich, vertrags_ablauf, aktiv, logo:datei_pfad_2')
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
  }, [suche, owner, gruppeFilter, sortierung, reloadToken])

  async function neuVertrag() {
    if (!owner || owner.id === '__all__') {
      alert('Bitte einen konkreten Inhaber wählen, um einen Vertrag anzulegen.')
      return
    }
    setBusy(true)
    const now = new Date().toISOString()
    const vertrag_id = `archivy-${Date.now()}`

    const { data, error } = await supabase
      .from('vertraege')
      .insert({
        vertrag_id,
        vertragsbesitzer_id: owner.id,
        firma: 'Neuer Vertrag',
        aktiv: true,
        modified_by: 'archivy',
        sync_state: 'geaendert',
        app_modified_at: now,
      })
      .select('vertrag_id')
      .single()

    setBusy(false)
    if (error) {
      alert(`Vertrag konnte nicht angelegt werden: ${error.message}`)
      return
    }

    setReloadToken(t => t + 1)
    onSelectContract?.(data?.vertrag_id || vertrag_id, [data?.vertrag_id || vertrag_id])
  }

  async function loescheVertrag(v) {
    const { count: vorgaengeCount } = await supabase
      .from('vorgaenge')
      .select('vorgang_id', { count: 'exact', head: true })
      .eq('vertrag', v.vertrag_id)

    const anzahl = Number(vorgaengeCount || 0)
    const ok = confirm(
      anzahl > 0
        ? `Vertrag "${v.firma || v.vertrag_id}" wirklich löschen?\n\nEs werden auch ${anzahl} zugehörige Vorgänge gelöscht.`
        : `Vertrag "${v.firma || v.vertrag_id}" wirklich löschen?`
    )
    if (!ok) return

    setBusy(true)

    if (anzahl > 0) {
      const { error: vorgangError } = await supabase
        .from('vorgaenge')
        .delete()
        .eq('vertrag', v.vertrag_id)

      if (vorgangError) {
        setBusy(false)
        alert(`Vorgänge konnten nicht gelöscht werden: ${vorgangError.message}`)
        return
      }
    }

    let del = supabase.from('vertraege').delete()
    if (v.id != null) {
      del = del.eq('id', v.id)
    } else {
      del = del.eq('vertrag_id', v.vertrag_id)
    }
    if (owner?.id && owner.id !== '__all__') {
      del = del.eq('vertragsbesitzer_id', owner.id)
    }

    const { data: deletedRows, error } = await del.select('vertrag_id')

    setBusy(false)
    if (error) {
      alert(`Löschen fehlgeschlagen: ${error.message}`)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      alert('Kein Vertrag wurde gelöscht. Mögliche Ursache: fehlende Rechte oder Datensatz wurde nicht eindeutig gefunden.')
      return
    }
    setReloadToken(t => t + 1)
  }

  if (!owner) {
    return <p style={{ color: T.textMuted }}>Bitte wähle zuerst einen Inhaber aus.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: T.sp3, marginBottom: T.sp5, position: 'sticky', top: 0, zIndex: 10, background: T.bg, paddingTop: T.sp3, paddingBottom: T.sp3 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Verträge</h1>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Firma, Beschreibung, Nr…"
          style={{
            flex: '1 1 220px', maxWidth: 260,
            border: `1px solid ${T.border}`, borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp3}`, outline: 'none',
          }}
        />
        <select
          value={gruppeFilter}
          onChange={e => setGruppeFilter(e.target.value)}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, maxWidth: 170 }}
        >
          <option value="__all__">Alle Gruppen</option>
          {gruppen.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={sortierung}
          onChange={e => setSortierung(e.target.value)}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, maxWidth: 190 }}
        >
          {Object.entries(SORTIERUNGEN).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={neuVertrag}
          disabled={busy}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          + Neuer Vertrag
        </button>
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
                {['Gruppe', 'Logo', 'Firma', 'Beschreibung', 'Nr.', 'Kosten/Jahr', 'Ablauf', 'Aktion'].map(h => (
                  <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((v, idx) => (
                <tr key={String(v.id ?? v.vertrag_id ?? idx)} style={{ borderBottom: `1px solid ${T.border}`, opacity: v.aktiv ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => onSelectContract(v.vertrag_id, zeilen.map(z => z.vertrag_id))}
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
                    {formatKostenJaehrlich(v.kosten_jaehrlich)}
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap', color: ablaufFarbe(v.vertrags_ablauf) }}>{formatDateDisplay(v.vertrags_ablauf)}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        loescheVertrag(v)
                      }}
                      disabled={busy}
                      style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '2px 8px', background: T.bgCard, color: T.danger, cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      Löschen
                    </button>
                  </td>
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

function formatDateDisplay(value) {
  if (!value) return '—'
  const text = String(value).trim()
  if (!text) return '—'
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const de = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (de) {
    const day = String(Number(de[1])).padStart(2, '0')
    const month = String(Number(de[2])).padStart(2, '0')
    const year = de[3].length === 2 ? `20${de[3]}` : de[3]
    return `${day}.${month}.${year}`
  }
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${d.getFullYear()}`
}

function formatKostenJaehrlich(raw) {
  const value = parseKostenJaehrlich(raw)
  if (value == null) return '—'
  return value.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseKostenJaehrlich(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    if (Number.isInteger(raw) && raw >= 10000) return raw / 100
    return raw
  }

  const text = String(raw).trim().replace(/\s|€|EUR/gi, '')
  if (!text) return null

  let parsed = null
  if (text.includes('.') && text.includes(',')) {
    parsed = Number(text.replace(/\./g, '').replace(',', '.'))
  } else if (text.includes(',')) {
    parsed = Number(text.replace(',', '.'))
  } else {
    parsed = Number(text)
  }

  if (!Number.isFinite(parsed)) return null

  // Some FM imports deliver cents as whole integers (e.g. 129900 -> 1299.00).
  if (/^\d+$/.test(text) && Number.isInteger(parsed) && parsed >= 10000) {
    return parsed / 100
  }

  return parsed
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
        style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover', border: `1px solid ${T.border}` }}
      />
    )
  }

  return (
    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
      {logoText(firma)}
    </div>
  )
}

function normalisiereLogoQuelle(value) {
  if (!value || typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  if (v.startsWith('data:')) return v
  if (/^<svg[\s>]/i.test(v)) return `data:image/svg+xml;utf8,${encodeURIComponent(v)}`
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length >= 40) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`
  return null
}

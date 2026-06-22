import { useEffect, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'

function Kachel({ label, wert, farbe, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: T.r2,
        padding: T.sp5,
        textAlign: 'left',
        boxShadow: T.shadow,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = T.shadowMd}
      onMouseLeave={e => e.currentTarget.style.boxShadow = T.shadow}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: farbe ?? T.primary }}>{wert ?? '—'}</div>
      <div style={{ color: T.textMuted, fontSize: 13, marginTop: T.sp1 }}>{label}</div>
    </button>
  )
}

export default function Dashboard({ onNavigate, owner, onSelectVorgang }) {
  const [zahlen, setZahlen] = useState({})
  const [faellige, setFaellige] = useState([])
  const [vertragMap, setVertragMap] = useState({})

  useEffect(() => {
    async function laden() {
      let vorgaengeQuery = supabase.from('vorgaenge').select('id', { count: 'exact', head: true })
      let vertraegeQuery = supabase
        .from('vertraege')
        .select('vertrag_id,firma,beschreibung,vertragsnummer,datei_pfad_2')
      let faelligQuery = supabase
        .from('vorgaenge')
        .select('vorgang_id, kurzbeschreibung, vertrag, frist, verantwortlicher')
        .eq('erledigt', false)
        .not('frist', 'is', null)
        .order('frist', { ascending: true })
        .limit(8)

      if (owner && owner.id !== '__all__') {
        const ownerId = String(owner.id).trim()
        vorgaengeQuery = vorgaengeQuery.eq('vertragsbesitzer_id', ownerId)
        vertraegeQuery = vertraegeQuery.eq('vertragsbesitzer_id', ownerId)
        faelligQuery = faelligQuery.eq('vertragsbesitzer_id', ownerId)
      }

      const [{ count: v }, { data: vtRows }, { data: due }] = await Promise.all([
        vorgaengeQuery,
        vertraegeQuery,
        faelligQuery,
      ])
      const sichtbareVertraege = (vtRows ?? []).filter(vt => (
        !enthaeltParserFehler(vt.vertrag_id) &&
        !enthaeltParserFehler(vt.firma) &&
        !enthaeltParserFehler(vt.beschreibung) &&
        !enthaeltParserFehler(vt.vertragsnummer)
      ))

      const map = {}
      for (const vt of sichtbareVertraege) {
        map[normalisiereVertragId(vt.vertrag_id)] = vt
      }

      setZahlen({ vorgaenge: v, vertraege: sichtbareVertraege.length })
      setFaellige(due ?? [])
      setVertragMap(map)
    }
    laden()
  }, [owner])

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: T.sp6 }}>Übersicht</h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: T.sp4,
      }}>
        <Kachel label="Verträge" wert={zahlen.vertraege} onClick={() => onNavigate('vertraege')} />
        <Kachel label="Fällige Vorgänge" wert={faellige.length} farbe={T.warning} onClick={() => onNavigate('kalender')} />
      </div>

      <div style={{ marginTop: T.sp6, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, overflow: 'hidden' }}>
        <div style={{ padding: T.sp4, borderBottom: `1px solid ${T.border}`, fontWeight: 700 }}>Fällige Vorgänge</div>
        {faellige.length === 0 ? (
          <p style={{ padding: T.sp4, color: T.textMuted, margin: 0 }}>Keine offenen Fristen.</p>
        ) : (
          faellige.map(v => (
            <div
              key={v.vorgang_id}
              style={{ padding: T.sp4, borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
              onClick={() => onSelectVorgang?.(v.vorgang_id, faellige.map(x => x.vorgang_id))}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {(() => {
                const vertrag = vertragMap[normalisiereVertragId(v.vertrag)]
                const firma = vertrag?.firma || v.vertrag || '—'
                const logoSrc = normalisiereLogoQuelle(vertrag?.datei_pfad_2)
                return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: T.sp3 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{v.kurzbeschreibung || 'Ohne Bezeichnung'}</div>
                  <div style={{ color: T.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={firma}
                          style={{ width: 18, height: 18, borderRadius: 6, objectFit: 'contain', border: `1px solid ${T.border}`, background: '#fff', padding: 1 }}
                        />
                      ) : (
                        <span style={{ width: 18, height: 18, borderRadius: 6, background: '#dbeafe', color: '#1d4ed8', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>
                          {logoText(firma)}
                        </span>
                      )}
                      Vertrag: {firma}
                    </span>
                    <span>· Verantwortlich: {v.verantwortlicher || '—'}</span>
                  </div>
                </div>
                <div style={{ color: fristFarbe(v.frist), whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDateDisplay(v.frist) || '—'}</div>
              </div>
                )
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function fristFarbe(frist) {
  if (!frist) return T.textMain
  const diff = (new Date(frist) - new Date()) / 86400000
  if (diff < 0) return T.danger
  if (diff <= 7) return T.warning
  return T.textMain
}

function enthaeltParserFehler(value) {
  if (typeof value !== 'string') return false
  return value.includes('Line 1, Column') || value.includes('Syntax error: value, object or array expected')
}

function formatDateDisplay(value) {
  if (!value) return null
  const text = String(value).trim()

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${day}.${month}.${year}`
  }

  const deDate = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (deDate) {
    const day = String(Number(deDate[1])).padStart(2, '0')
    const month = String(Number(deDate[2])).padStart(2, '0')
    const year = deDate[3].length === 2 ? `20${deDate[3]}` : deDate[3]
    return `${day}.${month}.${year}`
  }

  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

function normalisiereVertragId(value) {
  return String(value ?? '').trim().toLowerCase()
}

function logoText(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || parts[0].slice(0, 2)).toUpperCase()
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

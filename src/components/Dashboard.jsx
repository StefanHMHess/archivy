import { useEffect, useMemo, useState } from 'react'
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
  const ownerIds = useMemo(() => ownerVarianten(owner?.id), [owner?.id])

  useEffect(() => {
    async function laden() {
      let vorgaengeQuery = supabase.from('vorgaenge').select('id', { count: 'exact', head: true })
      let vertraegeQuery = supabase.from('vertraege').select('id', { count: 'exact', head: true })
      let faelligQuery = supabase
        .from('vorgaenge')
        .select('vorgang_id, kurzbeschreibung, vertrag, frist, erledigung, verantwortlicher')
        .eq('erledigt', false)
        .not('frist', 'is', null)
        .order('frist', { ascending: true })
        .limit(8)

      if (owner && owner.id !== '__all__') {
        vorgaengeQuery = vorgaengeQuery.in('vertragsbesitzer_id', ownerIds)
        vertraegeQuery = vertraegeQuery.in('vertragsbesitzer_id', ownerIds)
        faelligQuery = faelligQuery.in('vertragsbesitzer_id', ownerIds)
      }

      const [{ count: v }, { count: vtCount }, { data: due }] = await Promise.all([
        vorgaengeQuery,
        vertraegeQuery,
        faelligQuery,
      ])

      const dueIds = [...new Set((due ?? []).map(vt => normalisiereVertragId(vt?.vertrag)).filter(Boolean))]
      const map = {}
      if (dueIds.length > 0) {
        let dueVertraegeQuery = supabase.from('vertraege').select('vertrag_id,firma')
        if (owner && owner.id !== '__all__') {
          dueVertraegeQuery = dueVertraegeQuery.in('vertragsbesitzer_id', ownerIds)
        }
        dueVertraegeQuery = dueVertraegeQuery.in('vertrag_id', dueIds)

        const { data: dueVertraege } = await dueVertraegeQuery
        for (const vt of dueVertraege ?? []) {
          map[normalisiereVertragId(vt.vertrag_id)] = vt
        }
      }

      setZahlen({ vorgaenge: Number(v || 0), vertraege: Number(vtCount || 0) })
      setFaellige(due ?? [])
      setVertragMap(map)
    }
    laden()
  }, [owner, owner?.id])

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
                return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: T.sp3 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{v.kurzbeschreibung || 'Ohne Bezeichnung'}</div>
                  <div style={{ color: T.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, background: '#dbeafe', color: '#1d4ed8', display: 'inline-grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>
                        {logoText(firma)}
                      </span>
                      Vertrag: {firma}
                    </span>
                    <span>· Verantwortlich: {v.verantwortlicher || '—'}</span>
                    {v.erledigung && <span>· Erledigt am: {formatDateDisplay(v.erledigung)}</span>}
                  </div>
                </div>
                <div style={{ color: fristFarbe(v.frist), whiteSpace: 'nowrap', fontWeight: 600 }}>Frist: {formatDateDisplay(v.frist) || '—'}</div>
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

function ownerVarianten(ownerId) {
  const raw = String(ownerId ?? '').trim()
  if (!raw || raw === '__all__') return []

  const ids = new Set()
  const addForms = (value) => {
    const v = String(value ?? '').trim()
    if (!v) return
    ids.add(v)
    ids.add(v.toLowerCase())

    const plus = v.replace(/-/g, '+')
    const dash = v.replace(/\+/g, '-')
    ids.add(plus)
    ids.add(dash)
    ids.add(plus.toLowerCase())
    ids.add(dash.toLowerCase())
  }

  addForms(raw)

  const teile = raw.split(/[+-]/).map(v => v.trim()).filter(Boolean)
  if (teile.length > 1) {
    for (const teil of teile) addForms(teil)
    addForms(teile.join('+'))
    addForms(teile.join('-'))
  }

  return [...ids]
}

function logoText(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (letters || parts[0].slice(0, 2)).toUpperCase()
}


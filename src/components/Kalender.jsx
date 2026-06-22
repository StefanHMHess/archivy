import { useEffect, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function Kalender({ owner, onSelectVorgang }) {
  const [eintraege, setEintraege] = useState([])
  const [laden, setLaden] = useState(true)
  const [monat, setMonat] = useState(startDesMonats(new Date()))

  useEffect(() => {
    if (!owner) return
    let aktiv = true

    async function ladenKalender() {
      setLaden(true)
      let query = supabase
        .from('vorgaenge')
        .select('vorgang_id, kurzbeschreibung, vertrag, frist, erledigt, erledigung, verantwortlicher')
        .eq('erledigt', false)
        .not('frist', 'is', null)
        .order('frist', { ascending: true })
        .limit(200)

      if (owner.id !== '__all__') {
        query = query.eq('vertragsbesitzer_id', owner.id)
      }

      const { data } = await query
      if (aktiv) {
        setEintraege(data ?? [])
        setLaden(false)
      }
    }

    ladenKalender()
    return () => { aktiv = false }
  }, [owner])

  if (!owner) {
    return <p style={{ color: T.textMuted }}>Bitte wähle zuerst einen Inhaber aus.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.sp5 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kalender</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2 }}>
          <button onClick={() => setMonat(addMonate(monat, -1))} style={navBtnStyle()}>{'<'}</button>
          <div style={{ minWidth: 190, textAlign: 'center', fontWeight: 700 }}>{monatLabel(monat)}</div>
          <button onClick={() => setMonat(addMonate(monat, 1))} style={navBtnStyle()}>{'>'}</button>
        </div>
      </div>

      {laden ? (
        <p style={{ color: T.textMuted }}>Wird geladen…</p>
      ) : eintraege.length === 0 ? (
        <p style={{ color: T.textMuted }}>Keine fälligen Vorgänge vorhanden.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginBottom: T.sp4 }}>
            {WOCHENTAGE.map(w => (
              <div key={w} style={{ color: T.textMuted, fontWeight: 700, textAlign: 'center', padding: `${T.sp1} 0` }}>{w}</div>
            ))}
            {buildKalenderTage(monat).map((tag, idx) => {
              const eintraegeTag = eintraege.filter(e => isGleichesDatum(e.frist, tag.datum))
              const inMonat = tag.datum.getMonth() === monat.getMonth()
              const heute = isHeute(tag.datum)
              return (
                <div
                  key={`${tag.datum.toISOString()}_${idx}`}
                  onClick={() => {
                    if (eintraegeTag.length === 0) return
                    const ids = eintraegeTag.map(e => e.vorgang_id)
                    onSelectVorgang?.(ids[0], ids)
                  }}
                  style={{
                    minHeight: 110,
                    background: heute ? '#ecfeff' : T.bgCard,
                    border: `1px solid ${heute ? '#0891b2' : T.border}`,
                    borderRadius: T.r2,
                    padding: T.sp2,
                    opacity: inMonat ? 1 : 0.45,
                    boxShadow: heute ? 'inset 0 0 0 1px rgba(8,145,178,0.25)' : 'none',
                    cursor: eintraegeTag.length > 0 ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: T.sp2 }}>
                    <span style={{ fontWeight: 700 }}>{tag.datum.getDate()}</span>
                    {heute && <span style={{ fontSize: 10, fontWeight: 700, color: '#0e7490' }}>Heute</span>}
                    {eintraegeTag.length > 0 && <span style={{ fontSize: 12, color: T.warning, fontWeight: 700 }}>{eintraegeTag.length}</span>}
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {eintraegeTag.slice(0, 2).map(e => (
                      <div
                        key={e.vorgang_id}
                        onClick={ev => {
                          ev.stopPropagation()
                          onSelectVorgang?.(e.vorgang_id, eintraegeTag.map(x => x.vorgang_id))
                        }}
                        style={{ background: badgeFarbe(e.frist), color: '#0f172a', borderRadius: 6, padding: '2px 6px', fontSize: 11, lineHeight: 1.3, cursor: 'pointer' }}
                        title={`${e.kurzbeschreibung || 'Ohne Bezeichnung'} · ${e.vertrag || '—'}`}
                      >
                        {truncate(e.kurzbeschreibung || 'Ohne Bezeichnung', 28)}
                      </div>
                    ))}
                    {eintraegeTag.length > 2 && <div style={{ fontSize: 11, color: T.textMuted }}>+{eintraegeTag.length - 2} weitere</div>}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, overflow: 'hidden' }}>
            <div style={{ padding: T.sp3, borderBottom: `1px solid ${T.border}`, fontWeight: 700 }}>Nächste Fälligkeiten</div>
            {eintraege.map(e => (
              <div
                key={e.vorgang_id}
                style={{ padding: T.sp3, borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                onClick={() => onSelectVorgang?.(e.vorgang_id, eintraege.map(x => x.vorgang_id))}
                onMouseEnter={ev => ev.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={ev => ev.currentTarget.style.background = ''}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: T.sp3, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.kurzbeschreibung || 'Ohne Bezeichnung'}</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>Vertrag: {e.vertrag || '—'} · Verantwortlich: {e.verantwortlicher || '—'}</div>
                  </div>
                  <div style={{ color: fristFarbe(e.frist), whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDateDisplay(e.frist)}</div>
                  {e.erledigung && <div style={{ color: T.textMuted, fontSize: 13 }}>Erledigt am: {formatDateDisplay(e.erledigung)}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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

function badgeFarbe(frist) {
  const diff = (new Date(frist) - new Date()) / 86400000
  if (diff < 0) return '#fecaca'
  if (diff <= 7) return '#fde68a'
  return '#bfdbfe'
}

function startDesMonats(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonate(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function monatLabel(date) {
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

function buildKalenderTage(monat) {
  const erster = startDesMonats(monat)
  const ersterWochentag = (erster.getDay() + 6) % 7
  const start = new Date(erster)
  start.setDate(erster.getDate() - ersterWochentag)

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { datum: d }
  })
}

function isGleichesDatum(dateStr, dateObj) {
  if (!dateStr) return false
  const d = parseDateValue(dateStr)
  if (!d) return false
  return d.getFullYear() === dateObj.getFullYear() && d.getMonth() === dateObj.getMonth() && d.getDate() === dateObj.getDate()
}

function formatDateDisplay(value) {
  if (!value) return '—'
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const d = parseDateValue(text)
  if (!d) return text
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${d.getFullYear()}`
}

function parseDateValue(value) {
  if (!value) return null
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}

function navBtnStyle() {
  return {
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: T.r2,
    padding: `${T.sp1} ${T.sp3}`,
    cursor: 'pointer',
    fontWeight: 700,
  }
}

function isHeute(dateObj) {
  const now = new Date()
  return (
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate()
  )
}

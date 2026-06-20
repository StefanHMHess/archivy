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

export default function Dashboard({ onNavigate, owner }) {
  const [zahlen, setZahlen] = useState({})
  const [faellige, setFaellige] = useState([])

  useEffect(() => {
    async function laden() {
      let vorgaengeQuery = supabase.from('vorgaenge').select('id', { count: 'exact', head: true })
      let vertraegeQuery = supabase.from('vertraege').select('id', { count: 'exact', head: true })
      let faelligQuery = supabase
        .from('vorgaenge')
        .select('vorgang_id, kurzbeschreibung, vertrag, frist, verantwortlicher')
        .eq('erledigt', false)
        .not('frist', 'is', null)
        .order('frist', { ascending: true })
        .limit(8)

      if (owner && owner.id !== '__all__') {
        vorgaengeQuery = vorgaengeQuery.eq('vertragsbesitzer_id', owner.id)
        vertraegeQuery = vertraegeQuery.eq('vertragsbesitzer_id', owner.id)
        faelligQuery = faelligQuery.eq('vertragsbesitzer_id', owner.id)
      }

      const [{ count: v }, { count: vt }, { data: due }] = await Promise.all([
        vorgaengeQuery,
        vertraegeQuery,
        faelligQuery,
      ])
      setZahlen({ vorgaenge: v, vertraege: vt })
      setFaellige(due ?? [])
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
            <div key={v.vorgang_id} style={{ padding: T.sp4, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: T.sp3 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{v.kurzbeschreibung || 'Ohne Bezeichnung'}</div>
                  <div style={{ color: T.textMuted, fontSize: 13 }}>Vertrag: {v.vertrag || '—'} · Verantwortlich: {v.verantwortlicher || '—'}</div>
                </div>
                <div style={{ color: fristFarbe(v.frist), whiteSpace: 'nowrap', fontWeight: 600 }}>{v.frist || '—'}</div>
              </div>
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

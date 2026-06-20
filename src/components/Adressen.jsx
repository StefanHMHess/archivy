import { useEffect, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'

const PAGE = 50

const ROLLEN = [
  { key: 'ist_kunde',      label: 'Kunde' },
  { key: 'ist_an',         label: 'AN' },
  { key: 'ist_makler',     label: 'Makler' },
  { key: 'ist_notar',      label: 'Notar' },
  { key: 'ist_interessent',label: 'Interessent' },
]

export default function Adressen() {
  const [zeilen, setZeilen] = useState([])
  const [suche, setSuche] = useState('')
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    let aktiv = true
    async function laden() {
      setLaden(true)
      let query = supabase
        .from('adressen')
        .select('adresse_id, nachname, vorname, firma_name, ort, telefon, mobil, email, ist_kunde, ist_an, ist_makler, ist_notar, ist_interessent')
        .order('nachname', { ascending: true })
        .limit(PAGE)

      if (suche.trim()) {
        query = query.or(`nachname.ilike.%${suche.trim()}%,vorname.ilike.%${suche.trim()}%,firma_name.ilike.%${suche.trim()}%`)
      }

      const { data } = await query
      if (aktiv) { setZeilen(data ?? []); setLaden(false) }
    }
    laden()
    return () => { aktiv = false }
  }, [suche])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp4, marginBottom: T.sp5 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Adressen</h1>
        <input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Name, Firma…"
          style={{
            flex: 1, maxWidth: 320,
            border: `1px solid ${T.border}`, borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp3}`, outline: 'none',
          }}
        />
      </div>

      {laden ? (
        <p style={{ color: T.textMuted }}>Wird geladen…</p>
      ) : zeilen.length === 0 ? (
        <p style={{ color: T.textMuted }}>Keine Adressen gefunden.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: 'left' }}>
                {['Name', 'Firma', 'Ort', 'Telefon', 'E-Mail', 'Rollen'].map(h => (
                  <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map(a => (
                <tr key={a.adresse_id} style={{ borderBottom: `1px solid ${T.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{[a.vorname, a.nachname].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{a.firma_name ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{a.ort ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{a.mobil ?? a.telefon ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>{a.email ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                    <div style={{ display: 'flex', gap: T.sp1, flexWrap: 'wrap' }}>
                      {ROLLEN.filter(r => a[r.key]).map(r => (
                        <span key={r.key} style={{
                          background: T.primary, color: T.textOnTeal,
                          fontSize: 11, fontWeight: 600,
                          padding: `1px ${T.sp2}`, borderRadius: T.rFull,
                        }}>{r.label}</span>
                      ))}
                    </div>
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

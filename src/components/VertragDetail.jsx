import { useEffect, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'
import { getSignedUrl } from '../lib/storage'
import PdfThumbnail from './PdfThumbnail'

const BUCKET = 'archivy-dokumente'

export default function VertragDetail({ vertragId, owner, onSelectVorgang, onClose }) {
  const [vertrag, setVertrag] = useState(null)
  const [vorgaenge, setVorgaenge] = useState([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState(null)
  const [dateiUrl, setDateiUrl] = useState(null)
  const [logoFehler, setLogoFehler] = useState(false)

  useEffect(() => {
    async function ladenVertrag() {
      setLaden(true)
      const { data, error } = await supabase
        .from('vertraege')
        .select('*')
        .eq('vertrag_id', vertragId)
        .single()

      if (error) {
        setFehler(error.message)
      } else {
        setVertrag(data)

        let q = supabase
          .from('vorgaenge')
          .select('vorgang_id, kurzbeschreibung, beschreibung, datum, frist, erledigt, datei_pfad')
          .eq('vertrag', vertragId)
          .order('datum', { ascending: true })
          .limit(200)

        if (owner && owner.id !== '__all__') {
          q = q.eq('vertragsbesitzer_id', owner.id)
        }

        const { data: vorgangRows } = await q
        setVorgaenge(vorgangRows ?? [])
      }
      setLaden(false)
    }
    ladenVertrag()
  }, [vertragId, owner])

  useEffect(() => {
    async function ladenUrl() {
      if (!vertrag?.datei_pfad) return
      const url = await getSignedUrl(BUCKET, vertrag.datei_pfad)
      setDateiUrl(url)
    }
    ladenUrl()
  }, [vertrag])

  if (laden) return <p style={{ color: T.textMuted }}>Lädt Vertrag…</p>
  if (!vertrag) return <p style={{ color: T.danger }}>Vertrag nicht gefunden</p>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.sp6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{vertrag.firma || 'Vertrag'}</h1>
          <p style={{ margin: 0, color: T.textMuted }}>{vertrag.gruppe || 'Keine Gruppe'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp3 }}>
          <LogoPreview vertrag={vertrag} logoFehler={logoFehler} setLogoFehler={setLogoFehler} />
          <button
            onClick={onClose}
            style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp4}`, cursor: 'pointer' }}
          >
            ← Zurück
          </button>
        </div>
      </div>

      {fehler && (
        <div style={{ background: '#fee', color: T.danger, padding: T.sp3, borderRadius: T.r2, marginBottom: T.sp4 }}>
          {fehler}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp6 }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4 }}>
          <Field label="Firma" value={vertrag.firma} />
          <Field label="Vertragsnummer" value={vertrag.vertragsnummer} />
          <Field label="Beschreibung" value={vertrag.beschreibung} multiline />
          <Field label="Vertragsdatum" value={vertrag.vertrags_datum} />
          <Field label="Beginn" value={vertrag.vertrags_beginn} />
          <Field label="Ablauf" value={vertrag.vertrags_ablauf} />
          <Field label="IBAN" value={vertrag.iban} />
          <Field label="BIC" value={vertrag.bic} />
          <Field label="Zahlungsweise" value={vertrag.zahlungsweise} />
          <Field label="Kosten pro Rate" value={formatCurrency(vertrag.kosten_pro_rate)} />
          <Field label="Kosten/Jahr" value={formatCurrency(vertrag.kosten_jaehrlich)} />
          <Field label="Aktiv" value={vertrag.aktiv ? 'Ja' : 'Nein'} />
        </div>

        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4 }}>
          <Field label="E-Mail / Webseite" value={vertrag.kontakt} />
          <Field label="Notizen" value={vertrag.notizen} multiline />

          <div style={{ marginTop: T.sp6 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.textMuted, marginBottom: T.sp3 }}>Dokument</h2>
            {dateiUrl ? (
              <div style={{ background: T.bg, padding: T.sp4, borderRadius: T.r2 }}>
                <a href={dateiUrl} target="_blank" rel="noreferrer" style={{ color: T.primary, textDecoration: 'underline' }}>
                  Dokument öffnen
                </a>
              </div>
            ) : (
              <p style={{ color: T.textMuted }}>Keine Datei hinterlegt</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: T.sp6, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, overflow: 'hidden' }}>
        <div style={{ padding: T.sp4, borderBottom: `1px solid ${T.border}`, fontWeight: 700 }}>Zugehörige Vorgänge</div>
        {vorgaenge.length === 0 ? (
          <p style={{ padding: T.sp4, color: T.textMuted, margin: 0 }}>Keine Vorgänge zu diesem Vertrag vorhanden.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: T.bg }}>
                {['Vorgang', 'Datum', 'Notiz', 'Frist', 'Status', 'PDF'].map(h => (
                  <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `1px solid ${T.border}`, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vorgaenge.map(v => (
                <tr
                  key={v.vorgang_id}
                  onClick={() => onSelectVorgang?.(v.vorgang_id, vorgaenge.map(x => x.vorgang_id))}
                  style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer', verticalAlign: 'middle' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                    <div style={{ fontWeight: 600 }}>{v.beschreibung || '—'}</div>
                    <div style={{ color: T.textMuted, fontSize: 12 }}>ID {v.vorgang_id}</div>
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{v.datum || '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.kurzbeschreibung || '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, color: fristFarbe(v.frist, v.erledigt), whiteSpace: 'nowrap' }}>{v.frist || '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: v.erledigt ? '#d1fae5' : '#fef9c3', color: v.erledigt ? '#065f46' : '#854d0e' }}>
                      {v.erledigt ? 'Erledigt' : 'Offen'}
                    </span>
                  </td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                    {v.datei_pfad ? (
                      <PdfThumbnail pfad={v.datei_pfad} width={56} />
                    ) : (
                      <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, multiline }) {
  return (
    <div style={{ marginBottom: T.sp4 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp2, whiteSpace: multiline ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value ?? '—'}</div>
    </div>
  )
}

function formatCurrency(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })
}

function fristFarbe(frist, erledigt) {
  if (!frist || erledigt) return T.textMain
  const diff = (new Date(frist) - new Date()) / 86400000
  if (diff < 0) return T.danger
  if (diff <= 7) return T.warning
  return T.textMain
}

function LogoPreview({ vertrag, logoFehler, setLogoFehler }) {
  const logoSrc = normalisiereLogoQuelle(vertrag?.datei_pfad_2)

  if (logoSrc && !logoFehler) {
    return (
      <img
        src={logoSrc}
        alt={vertrag?.firma || 'Logo'}
        onError={() => setLogoFehler(true)}
        style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${T.border}`, objectFit: 'cover', background: '#fff' }}
      />
    )
  }

  return (
    <div style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${T.border}`, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
      {logoText(vertrag?.firma)}
    </div>
  )
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
  if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/')) return v
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 120) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  return null
}

import { useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'
import { uploadFile, getSignedUrl, deleteFile } from '../lib/storage'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const BUCKET = 'archivy-dokumente'

export default function VorgangDetail({ vorgang_id, vorgangIds = [], onNavigate, onClose }) {
  const [vorgang, setVorgang] = useState(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [pdfPages, setPdfPages] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [dateiUrl, setDateiUrl] = useState(null)
  const [fotoUrl, setFotoUrl] = useState(null)
  const [pdfVollbild, setPdfVollbild] = useState(false)

  useEffect(() => {
    laddenVorgang()
  }, [vorgang_id])

  useEffect(() => {
    async function ladenUrls() {
      if (!vorgang) return
      if (vorgang.datei_pfad) {
        const url = await getSignedUrl(BUCKET, vorgang.datei_pfad)
        setDateiUrl(url)
      }
      if (vorgang.foto_pfad) {
        const url = await getSignedUrl(BUCKET, vorgang.foto_pfad)
        setFotoUrl(url)
      }
    }
    ladenUrls()
  }, [vorgang])

  async function laddenVorgang() {
    setLaden(true)
    const { data, error } = await supabase
      .from('vorgaenge')
      .select('*')
      .eq('vorgang_id', vorgang_id)
      .single()

    if (error) {
      setFehler(error.message)
      setLaden(false)
      return
    }
    setVorgang(data)
    setFehler(null)
    setLaden(false)
  }

  async function handleDateiUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const now = Date.now()
      const ext = file.name.split('.').pop()
      const pfad = `vorgaenge/${vorgang_id}/datei_${now}.${ext}`

      await uploadFile(BUCKET, file, pfad)
      const { error } = await supabase
        .from('vorgaenge')
        .update({ datei_pfad: pfad, app_modified_at: new Date().toISOString(), sync_state: 'geaendert' })
        .eq('vorgang_id', vorgang_id)

      if (error) throw error
      setVorgang(prev => ({ ...prev, datei_pfad: pfad }))
    } catch (err) {
      setFehler(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleFotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const now = Date.now()
      const ext = file.name.split('.').pop()
      const pfad = `vorgaenge/${vorgang_id}/foto_${now}.${ext}`

      await uploadFile(BUCKET, file, pfad)
      const { error } = await supabase
        .from('vorgaenge')
        .update({ foto_pfad: pfad, app_modified_at: new Date().toISOString(), sync_state: 'geaendert' })
        .eq('vorgang_id', vorgang_id)

      if (error) throw error
      setVorgang(prev => ({ ...prev, foto_pfad: pfad }))
    } catch (err) {
      setFehler(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDateiLoeschen() {
    if (!vorgang?.datei_pfad) return
    const ok = window.confirm('PDF wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')
    if (!ok) return

    setUploading(true)
    try {
      await deleteFile(BUCKET, vorgang.datei_pfad)
      const { error } = await supabase
        .from('vorgaenge')
        .update({ datei_pfad: null, app_modified_at: new Date().toISOString(), sync_state: 'geaendert' })
        .eq('vorgang_id', vorgang_id)

      if (error) throw error
      setVorgang(prev => ({ ...prev, datei_pfad: null }))
      setDateiUrl(null)
      setPdfError(null)
    } catch (err) {
      setFehler(err.message)
    } finally {
      setUploading(false)
    }
  }

  if (laden) return <p style={{ color: T.textMuted }}>Wird geladen…</p>
  if (!vorgang) return <p style={{ color: T.danger }}>Vorgang nicht gefunden</p>

  const idx = vorgangIds.indexOf(vorgang_id)
  const hasPrev = idx > 0
  const hasNext = idx >= 0 && idx < vorgangIds.length - 1

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* PDF Vollbild-Overlay */}
      {pdfVollbild && dateiUrl && (
        <div
          onClick={() => setPdfVollbild(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start',
            overflowY: 'auto', padding: '40px 16px',
            cursor: 'zoom-out',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
            <Document
              file={dateiUrl}
              loading={<p style={{ color: '#fff' }}>PDF wird geladen…</p>}
              error={<p style={{ color: '#fca5a5' }}>PDF konnte nicht geladen werden</p>}
            >
              {Array.from({ length: pdfPages || 1 }, (_, i) => (
                <Page key={i + 1} pageNumber={i + 1} width={Math.min(window.innerWidth - 40, 900)} renderTextLayer={false} />
              ))}
            </Document>
          </div>
          <button
            onClick={() => setPdfVollbild(false)}
            style={{
              position: 'fixed', top: 16, right: 16, background: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 16,
            }}
          >
            ✕ Schließen
          </button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.sp6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Vorgang</h1>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: T.sp1 }}>
            {vorgang.beschreibung || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: T.sp2, alignItems: 'center' }}>
          {vorgangIds.length > 1 && (
            <>
              <button
                onClick={() => hasPrev && onNavigate?.(vorgangIds[idx - 1])}
                disabled={!hasPrev}
                style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, cursor: hasPrev ? 'pointer' : 'not-allowed', opacity: hasPrev ? 1 : 0.4, fontWeight: 700 }}
              >
                ‹ Vorherige
              </button>
              <span style={{ fontSize: 13, color: T.textMuted }}>{idx + 1} / {vorgangIds.length}</span>
              <button
                onClick={() => hasNext && onNavigate?.(vorgangIds[idx + 1])}
                disabled={!hasNext}
                style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, cursor: hasNext ? 'pointer' : 'not-allowed', opacity: hasNext ? 1 : 0.4, fontWeight: 700 }}
              >
                Nächste ›
              </button>
            </>
          )}
          <button
            onClick={onClose}
            style={{
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r2,
              padding: `${T.sp2} ${T.sp4}`, cursor: 'pointer', fontWeight: 500,
            }}
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

      {/* Zwei Spalten: Links Felder, rechts PDF */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp6, marginBottom: T.sp6 }}>

        {/* Linke Spalte: Infos */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.textMuted, marginBottom: T.sp3 }}>Details</h2>
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4 }}>
            {[
              ['Vorgang', vorgang.beschreibung],
              ['Notiz', vorgang.kurzbeschreibung],
              ['Datum', vorgang.datum],
              ['Frist', vorgang.frist],
              ['Erledigt', vorgang.erledigt ? 'Ja' : 'Nein'],
              ['Verantwortlich', vorgang.verantwortlicher],
              ['Ersteller', vorgang.ersteller],
            ].map(([label, wert]) => (
              <div key={label} style={{ marginBottom: T.sp3, paddingBottom: T.sp3, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
                <div style={{ marginTop: T.sp1 }}>{wert ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Beschreibung */}
          {vorgang.beschreibung && (
            <div style={{ marginTop: T.sp6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: T.sp2 }}>Beschreibung</h3>
              <p style={{ whiteSpace: 'pre-wrap', color: T.textMain, lineHeight: 1.6 }}>{vorgang.beschreibung}</p>
            </div>
          )}
        </div>

        {/* Rechte Spalte: PDF & Foto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp6 }}>

          {/* PDF */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: T.sp3 }}>Dokument</h3>
            <div
              style={{
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4,
                minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}
            >
              {dateiUrl ? (
                <Document
                  file={dateiUrl}
                  onLoadSuccess={({ numPages }) => { setPdfPages(numPages); setPdfError(null) }}
                  onLoadError={e => { console.error('PDF Fehler:', e); setPdfError(e?.message || String(e)); setFehler('PDF konnte nicht geladen werden'); }}
                  loading={<p style={{ color: T.textMuted }}>PDF wird geladen…</p>}
                  error={<p style={{ color: T.danger }}>PDF konnte nicht geladen werden</p>}
                >
                  <div
                    onClick={() => setPdfVollbild(true)}
                    style={{ cursor: 'zoom-in' }}
                    title="Klicken für Vollansicht"
                  >
                    <Page pageNumber={1} width={300} renderTextLayer={false} />
                  </div>
                </Document>
              ) : (
                <p style={{ color: T.textMuted, textAlign: 'center' }}>Keine Datei hochgeladen</p>
              )}
            </div>
            {pdfError && (
              <div style={{ background: '#fee', color: T.danger, padding: T.sp3, borderRadius: T.r2, marginBottom: T.sp4 }}>
                <strong>PDF-Fehler:</strong> {pdfError}
              </div>
            )}
            <div style={{ display: 'flex', gap: T.sp2, marginTop: T.sp3 }}>
              <label
                style={{
                  flex: 1, padding: `${T.sp2} ${T.sp3}`,
                  background: T.primary, color: T.textOnTeal, borderRadius: T.r2,
                  textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', fontWeight: 500,
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? 'Wird hochgeladen…' : '📄 Datei hochladen'}
                <input type="file" onChange={handleDateiUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
              {vorgang.datei_pfad && (
                <button
                  onClick={handleDateiLoeschen}
                  disabled={uploading}
                  style={{
                    flex: 1, padding: `${T.sp2} ${T.sp3}`,
                    background: '#fff1f2', color: '#b91c1c', border: `1px solid ${T.border}`,
                    borderRadius: T.r2, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600,
                  }}
                >
                  PDF löschen
                </button>
              )}
            </div>
          </div>

          {/* Foto */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: T.sp3 }}>Foto</h3>
            <div
              style={{
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4,
                minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              }}
            >
              {fotoUrl ? (
                <img src={fotoUrl} alt="Foto" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: T.r2 }} />
              ) : (
                <p style={{ color: T.textMuted, textAlign: 'center' }}>Kein Foto hochgeladen</p>
              )}
            </div>
            <label
              style={{
                display: 'block', marginTop: T.sp3, padding: `${T.sp2} ${T.sp3}`,
                background: T.accent, color: T.textOnTeal, borderRadius: T.r2,
                textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', fontWeight: 500,
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? 'Wird hochgeladen…' : '📸 Foto hochladen'}
              <input type="file" accept="image/*" onChange={handleFotoUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

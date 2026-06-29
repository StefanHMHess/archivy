import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'
import { uploadFile, getSignedUrl, deleteFile, optimizeImageUrl } from '../lib/storage'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const BUCKET = 'archivy-dokumente'

// Hook für responsive Design
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return isMobile
}

export default function VorgangDetail({ vorgang_id, vorgangIds = [], onNavigate, onClose }) {
  const containerRef = useRef(null)
  const touchStartX = useRef(0)
  const isMobile = useIsMobile()
  const [vorgang, setVorgang] = useState(null)
  const [entwurf, setEntwurf] = useState(null)
  const [vertragMeta, setVertragMeta] = useState(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState(null)
  const [speichert, setSpeichert] = useState(false)
  const [speicherStatus, setSpeicherStatus] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [pdfPages, setPdfPages] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [loeschend, setLoeschend] = useState(false)
  const [erstelltNeu, setErstelltNeu] = useState(false)
  const [dateiUrl, setDateiUrl] = useState(null)
  const [fotoUrl, setFotoUrl] = useState(null)
  const [pdfVollbild, setPdfVollbild] = useState(false)
  const [pdfRotation, setPdfRotation] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX
    }

    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX
      const swipeDistance = touchEndX - touchStartX.current
      if (swipeDistance > 80) {
        onClose?.()
      }
    }

    container.addEventListener('touchstart', handleTouchStart)
    container.addEventListener('touchend', handleTouchEnd)
    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onClose])

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

    let vertragInfo = null
    if (data?.vertrag) {
      const vertragKey = String(data.vertrag).trim()
      const { data: vertragData } = await supabase
        .from('vertraege')
        .select('firma, datei_pfad_2, vertrags_datum, vertrags_ablauf')
        .ilike('vertrag_id', vertragKey)
        .maybeSingle()
      vertragInfo = vertragData ?? null
    }

    setVorgang(data)
    setEntwurf(data)
    setVertragMeta(vertragInfo)
    setFehler(null)
    setLaden(false)
  }

  function setFeld(name, value) {
    setEntwurf(prev => ({ ...(prev ?? {}), [name]: value }))
    setSpeicherStatus(null)
  }

  async function speichereVorgang() {
    const daten = entwurf ?? vorgang
    if (!daten) return

    setSpeichert(true)
    setSpeicherStatus(null)

    const payload = {
      beschreibung: cleanText(daten.beschreibung),
      kurzbeschreibung: cleanText(daten.kurzbeschreibung),
      datum: cleanDate(daten.datum),
      frist: cleanDate(daten.frist),
      erledigt: Boolean(daten.erledigt),
      erledigung: cleanDate(daten.erledigung),
      verantwortlicher: cleanText(daten.verantwortlicher),
      ersteller: cleanText(daten.ersteller),
      app_modified_at: new Date().toISOString(),
      sync_state: 'geaendert',
    }

    const { data, error } = await supabase
      .from('vorgaenge')
      .update(payload)
      .eq('vorgang_id', vorgang_id)
      .select('*')
      .single()

    setSpeichert(false)

    if (error) {
      setSpeicherStatus({ ok: false, text: error.message })
      return
    }

    setVorgang(data)
    setEntwurf(data)
    setSpeicherStatus({ ok: true, text: 'Gespeichert' })
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
      setEntwurf(prev => ({ ...prev, datei_pfad: pfad }))
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
      setEntwurf(prev => ({ ...prev, foto_pfad: pfad }))
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
      setEntwurf(prev => ({ ...prev, datei_pfad: null }))
      setDateiUrl(null)
      setPdfError(null)
    } catch (err) {
      setFehler(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleVorgangLoeschen() {
    if (!vorgang) return
    const ok = window.confirm('Vorgang wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.')
    if (!ok) return

    setLoeschend(true)
    setFehler(null)
    try {
      const pfade = [vorgang.datei_pfad, vorgang.foto_pfad].filter(Boolean)
      for (const pfad of pfade) {
        try {
          await deleteFile(BUCKET, pfad)
        } catch {
          // Continue even if a storage object no longer exists.
        }
      }

      const { error } = await supabase
        .from('vorgaenge')
        .delete()
        .eq('vorgang_id', vorgang_id)

      if (error) throw error
      onClose?.()
    } catch (err) {
      setFehler(err.message)
    } finally {
      setLoeschend(false)
    }
  }

  async function handleNeuVorgang() {
    const basis = entwurf ?? vorgang
    const ownerId = basis?.vertragsbesitzer_id
    if (!ownerId) {
      setFehler('Neuer Vorgang braucht einen Vertragsbesitzer.')
      return
    }

    setErstelltNeu(true)
    const nowIso = new Date().toISOString()
    const vorgang_id_neu = `archivy-vorgang-${Date.now()}`
    const today = nowIso.slice(0, 10)

    const { data, error } = await supabase
      .from('vorgaenge')
      .insert({
        vorgang_id: vorgang_id_neu,
        vertragsbesitzer_id: ownerId,
        vertrag: basis?.vertrag ?? null,
        beschreibung: 'Neuer Vorgang',
        kurzbeschreibung: '',
        datum: today,
        sync_state: 'geaendert',
        app_modified_at: nowIso,
      })
      .select('vorgang_id')
      .single()

    setErstelltNeu(false)
    if (error) {
      setFehler(`Vorgang konnte nicht angelegt werden: ${error.message}`)
      return
    }

    onNavigate?.(data?.vorgang_id || vorgang_id_neu)
  }

  if (laden) return <p style={{ color: T.textMuted }}>Wird geladen…</p>
  if (!vorgang) return <p style={{ color: T.danger }}>Vorgang nicht gefunden</p>

  const daten = entwurf ?? vorgang

  const idx = vorgangIds.indexOf(vorgang_id)
  const hasPrev = idx > 0
  const hasNext = idx >= 0 && idx < vorgangIds.length - 1
  const firmaTitel = vertragMeta?.firma || 'Unbekannte Firma'
  const titelNotiz = daten.kurzbeschreibung || daten.beschreibung || 'Vorgang'
  const logoSrc = normalisiereLogoQuelle(vertragMeta?.datei_pfad_2)
  const beschreibungAnzeige = daten.beschreibung || daten.kurzbeschreibung || null

  return (
    <div ref={containerRef} style={{ maxWidth: 1000, margin: '0 auto' }}>
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
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: T.sp2, position: 'sticky', top: 0, zIndex: 10, background: T.bg, paddingTop: 6, paddingBottom: 6, gap: isMobile ? T.sp2 : T.sp1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, flex: 1, minWidth: 0 }}>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={firmaTitel}
              style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${T.border}`, objectFit: 'cover', background: '#fff', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${T.border}`, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0, fontSize: 14 }}>
              {logoText(firmaTitel)}
            </div>
          )}
          {/* Title Column */}
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'block', marginBottom: 1, background: 'transparent', color: T.text, padding: 0, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Vorgang</span>
            <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 2 }}>
              {firmaTitel}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titelNotiz}</h1>
          </div>
        </div>
        {/* Right: Navigation Buttons */}
        <div style={{ display: 'flex', gap: T.sp1, alignItems: 'center', flexShrink: 0, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            <button
              type="button"
              onClick={handleNeuVorgang}
              disabled={erstelltNeu}
              style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: T.r2,
                padding: `6px 10px`,
                cursor: erstelltNeu ? 'not-allowed' : 'pointer',
                opacity: erstelltNeu ? 0.7 : 1,
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Neuen Vorgang erstellen"
            >
              {erstelltNeu ? '+' : '+ Neu'}
            </button>
            <button
              onClick={handleVorgangLoeschen}
              disabled={loeschend}
              style={{
                background: '#fff1f2',
                color: '#b91c1c',
                border: `1px solid ${T.border}`,
                borderRadius: T.r2,
                padding: `6px 10px`,
                cursor: loeschend ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
                opacity: loeschend ? 0.7 : 1,
                whiteSpace: 'nowrap',
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Diesen Vorgang löschen"
            >
              {loeschend ? '…' : '🗑️'}
            </button>
            {vorgangIds.length > 1 && (
              <>
                <button
                  onClick={() => hasPrev && onNavigate?.(vorgangIds[idx - 1])}
                  disabled={!hasPrev}
                  style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: 6, cursor: hasPrev ? 'pointer' : 'not-allowed', opacity: hasPrev ? 1 : 0.4, fontWeight: 700, fontSize: 16, minWidth: 40, minHeight: 40, display: 'grid', placeItems: 'center' }}
                  title="Vorheriger Vorgang"
                >
                  ‹
                </button>
                <span style={{ fontSize: 11, color: T.textMuted, minWidth: 35, textAlign: 'center', fontWeight: 600 }}>{idx + 1}/{vorgangIds.length}</span>
                <button
                  onClick={() => hasNext && onNavigate?.(vorgangIds[idx + 1])}
                  disabled={!hasNext}
                  style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: 6, cursor: hasNext ? 'pointer' : 'not-allowed', opacity: hasNext ? 1 : 0.4, fontWeight: 700, fontSize: 16, minWidth: 40, minHeight: 40, display: 'grid', placeItems: 'center' }}
                  title="Nächster Vorgang"
                >
                  ›
                </button>
              </>
            )}
            <button
              type="button"
              onClick={speichereVorgang}
              disabled={speichert}
              style={{
                background: T.primary,
                color: '#fff',
                border: 'none',
                borderRadius: T.r2,
                padding: '6px 12px',
                cursor: speichert ? 'not-allowed' : 'pointer',
                opacity: speichert ? 0.7 : 1,
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Änderungen speichern"
            >
              {speichert ? '…' : '✓'}
            </button>
            <button
              onClick={onClose}
              style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: '6px 10px', cursor: 'pointer', fontWeight: 600, minHeight: 40, display: 'flex', alignItems: 'center', fontSize: 16 }}
              title="Zurück"
            >
              ✕
            </button>
        </div>
      </div>

      {speicherStatus && (
        <div style={{ background: speicherStatus.ok ? '#dcfce7' : '#fee', color: speicherStatus.ok ? '#166534' : T.danger, padding: T.sp2, borderRadius: T.r2, marginBottom: T.sp4, fontSize: 13 }}>
          {speicherStatus.text}
        </div>
      )}

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
            <EditTextFeld label="Vorgang" value={daten.beschreibung} onChange={v => setFeld('beschreibung', v)} multiline />
            <EditTextFeld label="Notiz" value={daten.kurzbeschreibung} onChange={v => setFeld('kurzbeschreibung', v)} multiline />
            <EditDateFeld label="Datum" value={daten.datum} onChange={v => setFeld('datum', v)} />
            <EditDateFeld label="Frist" value={daten.frist} onChange={v => setFeld('frist', v)} />
            <EditCheckFeld label="Erledigt" value={Boolean(daten.erledigt)} onChange={v => setFeld('erledigt', v)} />
            <EditDateFeld label="Erledigungsdatum" value={daten.erledigung} onChange={v => setFeld('erledigung', v)} />
            <EditTextFeld label="Verantwortlich" value={daten.verantwortlicher} onChange={v => setFeld('verantwortlicher', v)} />
          </div>
        </div>

        {/* Rechte Spalte: PDF & Foto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp6 }}>

          {/* PDF */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.sp3 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Dokument</h3>
              {dateiUrl && (
                <button
                  onClick={() => setPdfRotation((prev) => (prev + 90) % 360)}
                  style={{
                    padding: '4px 12px',
                    background: T.primary,
                    color: T.textOnTeal,
                    border: 'none',
                    borderRadius: T.r2,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  ↺ Drehen
                </button>
              )}
            </div>
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
                    <Page pageNumber={1} width={300} renderTextLayer={false} rotate={pdfRotation} />
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
                <input type="file" accept="application/pdf,.pdf" onChange={handleDateiUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
              {daten.datei_pfad && (
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
              <input type="file" accept="image/*" capture="environment" onChange={handleFotoUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDateDisplay(value) {
  if (!value) return null
  const text = String(value).trim()

  // Keep plain ISO dates timezone-safe by formatting manually.
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDate) {
    const [, year, month, day] = isoDate
    return `${day}.${month}.${year}`
  }

  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
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
  if (v.startsWith('http://') || v.startsWith('https://')) return optimizeImageUrl(v, { width: 220, quality: 60 })
  if (v.startsWith('data:image/')) return v
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 120) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  return null
}

function EditTextFeld({ label, value, onChange, type = 'text', multiline = false }) {
  return (
    <div style={{ marginBottom: T.sp3, paddingBottom: T.sp3, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: T.sp1, padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff', outline: 'none' }}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', marginTop: T.sp1, padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff', outline: 'none' }}
        />
      )}
    </div>
  )
}

function EditCheckFeld({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: T.sp2 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <label style={{ marginTop: T.sp1, display: 'inline-flex', alignItems: 'center', gap: T.sp2 }}>
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
        <span>{value ? 'Ja' : 'Nein'}</span>
      </label>
    </div>
  )
}

function EditDateFeld({ label, value, onChange }) {
  const containerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(formatDateDisplay(value) || '')
  const selectedIso = cleanDate(value)
  const selectedDate = isoDateToDate(selectedIso)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()))

  useEffect(() => {
    setText(formatDateDisplay(value) || '')
  }, [value])

  useEffect(() => {
    if (!open) return

    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) {
      setViewMonth(startOfMonth(selectedDate ?? new Date()))
    }
  }, [open, selectedIso])

  function onBlur() {
    const iso = cleanDate(text)
    if (!iso) {
      onChange('')
      setText('')
      return
    }
    onChange(iso)
    setText(formatDateDisplay(iso) || '')
  }

  function waehleTag(dayNumber) {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNumber)
    const iso = toIsoDate(d)
    onChange(iso)
    setText(isoToHuman(iso))
    setOpen(false)
  }

  return (
    <div style={{ marginBottom: T.sp3, paddingBottom: T.sp3, borderBottom: `1px solid ${T.border}`, position: 'relative' }} ref={containerRef}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp1, display: 'grid', gridTemplateColumns: '1fr auto', gap: T.sp2, alignItems: 'end' }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={onBlur}
          placeholder=""
          style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bg,
            color: T.textMain,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Kalender
        </button>
      </div>

      {open ? (
        <KalenderPopup
          viewMonth={viewMonth}
          selectedDate={selectedDate}
          onPrev={() => setViewMonth(prevMonth(viewMonth))}
          onNext={() => setViewMonth(nextMonth(viewMonth))}
          onSelectDay={waehleTag}
        />
      ) : null}
    </div>
  )
}

function KalenderPopup({ viewMonth, selectedDate, onPrev, onNext, onSelectDay }) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = mondayIndex(first.getDay())
  const dayCount = daysInMonth(year, month)
  const cells = []

  for (let i = 0; i < startOffset; i += 1) cells.push(null)
  for (let d = 1; d <= dayCount; d += 1) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 30, width: 260, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button type="button" onClick={onPrev} style={kalNavBtnStyle}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{viewMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</div>
        <button type="button" onClick={onNext} style={kalNavBtnStyle}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => (
          <div key={w} style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', fontWeight: 600 }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} style={{ height: 28 }} />

          const isSelected = Boolean(
            selectedDate &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === day
          )

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              style={{
                height: 28,
                borderRadius: 6,
                border: `1px solid ${isSelected ? T.primary : T.border}`,
                background: isSelected ? '#dbeafe' : T.bg,
                color: T.textMain,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const kalNavBtnStyle = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: T.bg,
  color: T.textMain,
  cursor: 'pointer',
  fontWeight: 700,
}

function cleanText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function cleanDate(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return text
  const human = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (human) {
    const day = String(Number(human[1])).padStart(2, '0')
    const month = String(Number(human[2])).padStart(2, '0')
    return `${human[3]}-${month}-${day}`
  }
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function mondayIndex(jsDay) {
  return (jsDay + 6) % 7
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function prevMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}

function nextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function isoDateToDate(iso) {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isoToHuman(isoText) {
  const m = String(isoText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}.${m[2]}.${m[1]}`
}

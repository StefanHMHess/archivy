import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'
import { getSignedUrl, optimizeImageUrl } from '../lib/storage'
import PdfThumbnail from './PdfThumbnail'

const FIXED_SECRET_MASK = '••••••••••'
const DEFAULT_ZAHLUNGSWEISEN = ['Abbuchung', 'Amex', 'Dauerauftrag', 'Mastercard', 'Eingang', 'Überweisungen']
const DOKU_BUCKET = 'archivy-dokumente'

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

export default function VertragDetail({ vertragId, vertragIds = [], owner, onNavigate, onSelectVorgang, onClose }) {
  const containerRef = useRef(null)
  const touchStartX = useRef(0)
  const isMobile = useIsMobile()
  const ownerIds = useMemo(() => ownerVarianten(owner?.id), [owner?.id])
  const [vertrag, setVertrag] = useState(null)
  const [entwurf, setEntwurf] = useState(null)
  const [vorgaenge, setVorgaenge] = useState([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState(null)
  const [speichert, setSpeichert] = useState(false)
  const [speicherStatus, setSpeicherStatus] = useState(null)
  const [logoFehler, setLogoFehler] = useState(false)
  const [erstelltVorgang, setErstelltVorgang] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  const [erstelltVertrag, setErstelltVertrag] = useState(false)
  const [zahlungsweisen, setZahlungsweisen] = useState(DEFAULT_ZAHLUNGSWEISEN)
  const [datumSortAsc, setDatumSortAsc] = useState(true)

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
    async function ladeZahlungsweisen() {
      if (!owner || owner.id === '__all__') {
        setZahlungsweisen(DEFAULT_ZAHLUNGSWEISEN)
        return
      }

      const { data, error } = await supabase
        .from('zahlungsweisen')
        .select('bezeichnung, sort_order, aktiv, vertragsbesitzer_id')
        .eq('vertragsbesitzer_id', owner.id)
        .eq('aktiv', true)
        .order('sort_order', { ascending: true })
        .order('bezeichnung', { ascending: true })

      if (error) {
        setZahlungsweisen(DEFAULT_ZAHLUNGSWEISEN)
        return
      }
      const liste = (data ?? []).map(r => r.bezeichnung).filter(Boolean)
      setZahlungsweisen(liste.length > 0 ? liste : DEFAULT_ZAHLUNGSWEISEN)
    }

    ladeZahlungsweisen()
  }, [owner?.id])

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
        setEntwurf(data)
        setSpeicherStatus(null)

        let q = supabase
          .from('vorgaenge')
          .select('vorgang_id, vorgang_art, kurzbeschreibung, beschreibung, datum, frist, erledigt, datei_pfad')
          .eq('vertrag', vertragId)
          .order('datum', { ascending: true })
          .limit(200)

        if (owner && owner.id !== '__all__') {
          q = q.in('vertragsbesitzer_id', ownerIds)
        }

        const { data: vorgangRows } = await q
        const direkt = vorgangRows ?? []

        if (direkt.length > 0) {
          setVorgaenge(direkt)
        } else {
          // Fallback: tolerate casing/whitespace differences, owner-ID drift,
          // and legacy rows where `vorgaenge.vertrag` stores the contract name.
          let fq = supabase
            .from('vorgaenge')
            .select('vorgang_id, vertrag, vorgang_art, kurzbeschreibung, beschreibung, datum, frist, erledigt, datei_pfad')
            .order('datum', { ascending: true })
            .limit(5000)

          const { data: fallbackRows } = await fq
          const rows = fallbackRows ?? []
          const needles = [
            vertragId,
            data?.vertrag_id,
            data?.vertragsnummer,
            data?.firma,
          ].map(normalisiereVertragId).filter(Boolean)

          const compactNeedles = needles.map(normalisiereVertragKompakt).filter(Boolean)

          const exact = rows.filter(v => needles.includes(normalisiereVertragId(v.vertrag)))
          if (exact.length > 0) {
            setVorgaenge(exact)
          } else {
            const compactExact = rows.filter(v => {
              const key = normalisiereVertragKompakt(v.vertrag)
              return key && compactNeedles.includes(key)
            })

            if (compactExact.length > 0) {
              setVorgaenge(compactExact)
            } else {
              const fuzzy = rows.filter(v => {
                const key = normalisiereVertragKompakt(v.vertrag)
                if (!key) return false
                return compactNeedles.some(n => n.length >= 6 && (key.includes(n) || n.includes(key)))
              })
              setVorgaenge(fuzzy)
            }
          }
        }
      }
      setLaden(false)
    }
    ladenVertrag()
  }, [vertragId, owner, owner?.id])

  if (laden) return <p style={{ color: T.textMuted }}>Lädt Vertrag…</p>
  if (!vertrag) return <p style={{ color: T.danger }}>Vertrag nicht gefunden</p>

  const daten = entwurf ?? vertrag
  const idx = vertragIds.indexOf(vertragId)
  const hasPrev = idx > 0
  const hasNext = idx >= 0 && idx < vertragIds.length - 1
  const quelle = quelleText(daten?.modified_by)
  const angezeigteVorgaenge = sortVorgaengeNachDatum(vorgaenge, datumSortAsc)

  async function oeffnePdfSofort(pfad) {
    if (!pfad) return
    const signed = await getSignedUrl(DOKU_BUCKET, pfad)
    if (!signed) {
      setFehler('PDF-Link konnte nicht erstellt werden.')
      return
    }
    window.open(signed, '_blank', 'noopener,noreferrer')
  }

  function setFeld(name, value) {
    setEntwurf(prev => ({ ...(prev ?? {}), [name]: value }))
    setSpeicherStatus(null)
  }

  async function speichereVertrag() {
    if (!daten) return
    setSpeichert(true)
    setSpeicherStatus(null)

    const payload = {
      ...buildVertragPayload(daten, owner),
      modified_by: 'archivy',
      app_modified_at: new Date().toISOString(),
      sync_state: 'geaendert',
    }

    let { data, error } = await supabase
      .from('vertraege')
      .update(payload)
      .eq('vertrag_id', vertragId)
      .select('*')
      .single()

    if (error && /(diskret|zugang|passwort)/i.test(error.message || '')) {
      const fallbackPayload = { ...payload }
      if (/diskret/i.test(error.message || '')) delete fallbackPayload.diskret
      if (/zugang/i.test(error.message || '')) delete fallbackPayload.zugang
      if (/passwort/i.test(error.message || '')) delete fallbackPayload.passwort
      const retry = await supabase
        .from('vertraege')
        .update(fallbackPayload)
        .eq('vertrag_id', vertragId)
        .select('*')
        .single()
      data = retry.data
      error = retry.error
    }

    setSpeichert(false)

    if (error) {
      setSpeicherStatus({ ok: false, text: error.message })
      return
    }

    setVertrag(data)
    setEntwurf(data)
    setSpeicherStatus({ ok: true, text: 'Gespeichert' })
  }

  async function kopiereVertrag() {
    if (!daten) return

    const ownerId = cleanText(daten.vertragsbesitzer_id) || (owner && owner.id !== '__all__' ? owner.id : null)
    if (!ownerId) {
      setSpeicherStatus({ ok: false, text: 'Kopieren nur mit konkretem Inhaber möglich.' })
      return
    }

    setKopiert(true)
    setSpeicherStatus(null)

    const now = new Date().toISOString()
    const neuerVertragId = `archivy-${Date.now()}`
    const payload = {
      ...buildVertragPayload(daten, owner),
      vertrag_id: neuerVertragId,
      vertragsbesitzer_id: ownerId,
      firma: cleanText(daten.firma) ? `${cleanText(daten.firma)} Kopie` : 'Vertragskopie',
      modified_by: 'archivy',
      app_modified_at: now,
      sync_state: 'geaendert',
    }

    let { data, error } = await supabase
      .from('vertraege')
      .insert(payload)
      .select('*')
      .single()

    if (error && /(diskret|zugang|passwort)/i.test(error.message || '')) {
      const fallbackPayload = { ...payload }
      if (/diskret/i.test(error.message || '')) delete fallbackPayload.diskret
      if (/zugang/i.test(error.message || '')) delete fallbackPayload.zugang
      if (/passwort/i.test(error.message || '')) delete fallbackPayload.passwort
      const retry = await supabase
        .from('vertraege')
        .insert(fallbackPayload)
        .select('*')
        .single()
      data = retry.data
      error = retry.error
    }

    setKopiert(false)

    if (error) {
      setSpeicherStatus({ ok: false, text: error.message })
      return
    }

    setSpeicherStatus({ ok: true, text: 'Vertrag kopiert' })
    onNavigate?.(data?.vertrag_id || neuerVertragId)
  }

  async function neuVertrag() {
    const ownerId = cleanText(daten?.vertragsbesitzer_id) || (owner && owner.id !== '__all__' ? owner.id : null)
    if (!ownerId) {
      setSpeicherStatus({ ok: false, text: 'Neuen Vertrag bitte mit konkretem Inhaber anlegen.' })
      return
    }

    setErstelltVertrag(true)
    setSpeicherStatus(null)

    const now = new Date().toISOString()
    const neuerVertragId = `archivy-${Date.now()}`
    const payload = {
      vertrag_id: neuerVertragId,
      vertragsbesitzer_id: ownerId,
      firma: 'Neuer Vertrag',
      aktiv: true,
      modified_by: 'archivy',
      sync_state: 'geaendert',
      app_modified_at: now,
    }

    const { data, error } = await supabase
      .from('vertraege')
      .insert(payload)
      .select('*')
      .single()

    setErstelltVertrag(false)

    if (error) {
      setSpeicherStatus({ ok: false, text: error.message })
      return
    }

    setSpeicherStatus({ ok: true, text: 'Neuer Vertrag angelegt' })
    onNavigate?.(data?.vertrag_id || neuerVertragId)
  }

  async function neuVorgang() {
    if (!owner || owner.id === '__all__') {
      setFehler('Bitte zuerst einen konkreten Inhaber wählen, um einen Vorgang anzulegen.')
      return
    }

    setErstelltVorgang(true)
    const vorgang_id = `archivy-vorgang-${Date.now()}`
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('vorgaenge')
      .insert({
        vorgang_id,
        vertrag: vertragId,
        vertragsbesitzer_id: owner.id,
        kurzbeschreibung: 'Neuer Vorgang',
        beschreibung: 'Neuer Vorgang',
        datum: today,
        sync_state: 'geaendert',
        app_modified_at: new Date().toISOString(),
      })
      .select('vorgang_id, vorgang_art, kurzbeschreibung, beschreibung, datum, frist, erledigt, datei_pfad')
      .single()
    setErstelltVorgang(false)

    if (error) {
      setFehler(`Vorgang konnte nicht angelegt werden: ${error.message}`)
      return
    }

    const neue = [...(vorgaenge ?? []), data]
    setVorgaenge(neue)
    onSelectVorgang?.(data.vorgang_id, neue.map(v => v.vorgang_id))
  }

  async function bearbeiteZahlungsweisen() {
    if (!owner || owner.id === '__all__') {
      alert('Bitte einen konkreten Inhaber wählen, um die Liste zu bearbeiten.')
      return
    }

    const vorgeschlagen = (zahlungsweisen?.length ? zahlungsweisen : DEFAULT_ZAHLUNGSWEISEN).join(', ')
    const eingabe = window.prompt('Zahlungsweisen bearbeiten (mit Komma, Semikolon oder Zeilenumbruch trennen):', vorgeschlagen)
    if (eingabe == null) return

    const liste = [...new Set(
      String(eingabe)
        .split(/[\n,;]+/)
        .map(v => v.trim())
        .filter(Boolean)
    )]

    if (liste.length === 0) {
      alert('Liste darf nicht leer sein.')
      return
    }

    const payload = liste.map((bezeichnung, idx) => ({
      vertragsbesitzer_id: owner.id,
      bezeichnung,
      sort_order: idx + 1,
      aktiv: true,
    }))

    const { error: delError } = await supabase
      .from('zahlungsweisen')
      .delete()
      .eq('vertragsbesitzer_id', owner.id)

    if (delError) {
      alert(`Zahlungsweisen konnten nicht zentral gespeichert werden: ${delError.message}`)
      return
    }

    const { error: insError } = await supabase
      .from('zahlungsweisen')
      .insert(payload)

    if (insError) {
      alert(`Zahlungsweisen konnten nicht zentral gespeichert werden: ${insError.message}`)
      return
    }

    setZahlungsweisen(liste)

    if (!liste.includes(daten.zahlungsweise || '')) {
      setFeld('zahlungsweise', liste[0])
    }
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: T.sp2, position: 'sticky', top: 0, zIndex: 10, background: T.bg, paddingTop: 6, paddingBottom: 6, gap: isMobile ? T.sp2 : T.sp1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, flex: 1, minWidth: 0 }}>
          <LogoPreview vertrag={daten} logoFehler={logoFehler} setLogoFehler={setLogoFehler} />
          {/* Title Column */}
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'block', marginBottom: 1, background: 'transparent', color: T.text, padding: 0, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Vertrag · ID {daten?.vertrag_id || vertragId}
            </span>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{daten.firma || 'Vertrag'}</h1>
            <p style={{ margin: 0, marginTop: 2, color: T.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{daten.gruppe || 'Keine Gruppe'}</span>
              <span style={{ fontSize: 11, background: T.bg, padding: 0 }}>{quelle}</span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: T.sp1, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end', alignItems: 'center', flexShrink: 0 }}>
            <button
              type="button"
              onClick={neuVertrag}
              disabled={erstelltVertrag}
              style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: T.r2,
                padding: `6px 10px`,
                cursor: erstelltVertrag ? 'not-allowed' : 'pointer',
                opacity: erstelltVertrag ? 0.7 : 1,
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Neuen Vertrag anlegen"
            >
              {erstelltVertrag ? 'Anlegen…' : '+ Neu'}
            </button>
            <button
              type="button"
              onClick={kopiereVertrag}
              disabled={kopiert}
              style={{
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: T.r2,
                padding: `6px 10px`,
                cursor: kopiert ? 'not-allowed' : 'pointer',
                opacity: kopiert ? 0.7 : 1,
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
                minHeight: 40,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Diesen Vertrag kopieren"
            >
              {kopiert ? 'Kopiere…' : 'Duplizieren'}
            </button>
            {vertragIds.length > 1 && (
              <>
                <button
                  onClick={() => hasPrev && onNavigate?.(vertragIds[idx - 1])}
                  disabled={!hasPrev}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r2,
                    padding: 6,
                    cursor: hasPrev ? 'pointer' : 'not-allowed',
                    opacity: hasPrev ? 1 : 0.4,
                    fontWeight: 700,
                    fontSize: 16,
                    minWidth: 40,
                    minHeight: 40,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  title="Vorheriger Vertrag"
                >
                  ‹
                </button>
                <span style={{ fontSize: 11, color: T.textMuted, minWidth: 35, textAlign: 'center', fontWeight: 600 }}>{idx + 1}/{vertragIds.length}</span>
                <button
                  onClick={() => hasNext && onNavigate?.(vertragIds[idx + 1])}
                  disabled={!hasNext}
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r2,
                    padding: 6,
                    cursor: hasNext ? 'pointer' : 'not-allowed',
                    opacity: hasNext ? 1 : 0.4,
                    fontWeight: 700,
                    fontSize: 16,
                    minWidth: 40,
                    minHeight: 40,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  title="Nächster Vertrag"
                >
                  ›
                </button>
              </>
            )}
            <button
              type="button"
              onClick={speichereVertrag}
              disabled={speichert}
              style={{
                background: T.primary,
                color: '#fff',
                border: 'none',
                borderRadius: T.r2,
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: 13,
                cursor: speichert ? 'not-allowed' : 'pointer',
                opacity: speichert ? 0.7 : 1,
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
              ← Zurück
            </button>
        </div>
      </div>

      {fehler && (
        <div style={{ background: '#fee', color: T.danger, padding: T.sp3, borderRadius: T.r2, marginBottom: T.sp4 }}>
          {fehler}
        </div>
      )}

      {speicherStatus && (
        <div style={{ background: speicherStatus.ok ? '#dcfce7' : '#fee', color: speicherStatus.ok ? '#166534' : T.danger, padding: T.sp2, borderRadius: T.r2, marginBottom: T.sp4, fontSize: 13 }}>
          {speicherStatus.text}
        </div>
      )}

      <div className="vertrag-detail-dreispalten" style={{ gap: T.sp4, gridTemplateColumns: '1fr', alignItems: 'start' }}>
        <div className="vertrag-detail-karte" style={{ borderColor: T.border, borderRadius: T.r2, padding: T.sp3 }}>
          <Field label="Firma" value={daten.firma} onChange={v => setFeld('firma', v)} />
          <Field label="Vertragsnummer" value={daten.vertragsnummer} onChange={v => setFeld('vertragsnummer', v)} />
          <Field label="Beschreibung" value={daten.beschreibung} multiline onChange={v => setFeld('beschreibung', v)} />
          <DateField label="Vertragsdatum" value={daten.vertrags_datum} onChange={v => setFeld('vertrags_datum', v)} />
          <DateField label="Beginn" value={daten.vertrags_beginn} onChange={v => setFeld('vertrags_beginn', v)} />
          <DateField label="Ablauf" value={daten.vertrags_ablauf} onChange={v => setFeld('vertrags_ablauf', v)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
            <Field label="Aktiv" value={Boolean(daten.aktiv)} type="checkbox" onChange={v => setFeld('aktiv', v)} />
            <Field
              label={<LabelMitHinweis text="Diskret" hinweis="Zugangsdaten werden nicht von Filemaker übertragen." />}
              value={isDiskretValue(daten.diskret)}
              type="checkbox"
              onChange={v => setFeld('diskret', v ? 'x' : null)}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: T.sp4, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, overflow: 'hidden' }}>
        <div style={{ padding: T.sp4, borderBottom: `1px solid ${T.border}`, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: T.sp2 }}>
          <span>Zugehörige Vorgänge</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2 }}>
            <button
              type="button"
              onClick={() => setDatumSortAsc(v => !v)}
              style={{
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: '2px 10px',
                background: T.bgCard,
                cursor: 'pointer',
                fontWeight: 700,
              }}
              title="Zugehörige Vorgänge nach Datum sortieren"
            >
              {datumSortAsc ? '↑ Datum' : '↓ Datum'}
            </button>
            <button
              type="button"
              onClick={neuVorgang}
              disabled={erstelltVorgang}
              style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '2px 8px', background: T.bgCard, cursor: erstelltVorgang ? 'not-allowed' : 'pointer' }}
            >
              {erstelltVorgang ? 'Anlegen…' : '+ Neuer Vorgang'}
            </button>
          </div>
        </div>
        {angezeigteVorgaenge.length === 0 ? (
          <p style={{ padding: T.sp4, color: T.textMuted, margin: 0 }}>Keine Vorgänge zu diesem Vertrag vorhanden.</p>
        ) : (
          <div className="vertrag-vorgaenge-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: T.bg }}>
                  {['Beschreibung', 'Datum', 'Notiz', 'Frist', 'Status', 'PDF'].map(h => (
                    <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `1px solid ${T.border}`, color: T.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {angezeigteVorgaenge.map(v => (
                  <tr
                    key={v.vorgang_id}
                    onClick={() => onSelectVorgang?.(v.vorgang_id, angezeigteVorgaenge.map(x => x.vorgang_id))}
                    style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer', verticalAlign: 'middle' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                      <div style={{ fontWeight: 600 }}>{cleanText(v.beschreibung) || cleanText(v.kurzbeschreibung) || cleanText(v.vorgang_art) || '—'}</div>
                      <div style={{ color: T.textMuted, fontSize: 12 }}>ID {v.vorgang_id}</div>
                    </td>
                    <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>{formatDateDisplay(v.datum) || ''}</td>
                    <td style={{ padding: `${T.sp2} ${T.sp3}`, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.kurzbeschreibung || ''}</td>
                    <td style={{ padding: `${T.sp2} ${T.sp3}`, color: fristFarbe(v.frist, v.erledigt), whiteSpace: 'nowrap' }}>{formatDateDisplay(v.frist) || ''}</td>
                    <td style={{ padding: `${T.sp2} ${T.sp3}` }}>
                      {statusBadge(v.frist, v.erledigt)}
                    </td>
                    <td style={{ padding: `${T.sp2} ${T.sp3}`, minWidth: 72 }}>
                      {v.datei_pfad ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            oeffnePdfSofort(v.datei_pfad)
                          }}
                          style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                          title="PDF direkt öffnen"
                        >
                          <PdfThumbnail pfad={v.datei_pfad} width={56} />
                        </button>
                      ) : (
                        <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: T.sp4 }}>
        <div className="vertrag-detail-karte" style={{ borderColor: T.border, borderRadius: T.r2, padding: T.sp3, marginBottom: T.sp4 }}>
          <KontaktAktionen vertrag={daten} onChange={setFeld} />
        </div>

        <div className="vertrag-detail-karte" style={{ borderColor: T.border, borderRadius: T.r2, padding: T.sp3 }}>
          <Field
            label="IBAN"
            value={daten.iban}
            onChange={v => setFeld('iban', v)}
            inputStyle={{ fontSize: 13, letterSpacing: 0.2 }}
          />
          <Field label="BIC" value={daten.bic} onChange={v => setFeld('bic', v)} />
          <Field label="Bank" value={daten.bank} onChange={v => setFeld('bank', v)} />
          <ZahlungsweiseFeld
            value={daten.zahlungsweise}
            options={zahlungsweisen}
            onChange={v => setFeld('zahlungsweise', v)}
            onEditOptions={bearbeiteZahlungsweisen}
          />
          <KostenBlock daten={daten} onChange={setFeld} />
          <Field
            label="Logo"
            value={daten.datei_pfad_2}
            onChange={v => setFeld('datei_pfad_2', v)}
            inputStyle={{ fontSize: 12, color: T.textMuted, opacity: 0.85 }}
          />
        </div>
      </div>
    </div>
  )
}

function statusBadge(frist, erledigt) {
  const hatFrist = Boolean(String(frist ?? '').trim())
  let text = '—'
  let background = T.bg
  let color = T.textMuted

  if (erledigt) {
    text = 'Erledigt'
    background = '#d1fae5'
    color = '#065f46'
  } else if (hatFrist) {
    text = 'Offen'
    background = '#fef9c3'
    color = '#854d0e'
  }

  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, background, color }}>
      {text}
    </span>
  )
}

function sortVorgaengeNachDatum(rows, ascending = true) {
  const list = [...(rows ?? [])]
  list.sort((a, b) => compareDatum(a?.datum, b?.datum))
  return ascending ? list : list.reverse()
}

function compareDatum(a, b) {
  const aTime = parseDateLike(a)
  const bTime = parseDateLike(b)
  if (aTime == null && bTime == null) return 0
  if (aTime == null) return 1
  if (bTime == null) return -1
  return aTime - bTime
}

function parseDateLike(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return Date.parse(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`)
  const deMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (deMatch) return Date.parse(`${deMatch[3]}-${deMatch[2]}-${deMatch[1]}T00:00:00`)
  const t = Date.parse(text)
  return Number.isNaN(t) ? null : t
}

function Field({ label, value, multiline, onChange, type = 'text', inputStyle }) {
  const anzeige = multiline ? normalisiereMehrzeilig(value) : value
  const isEditable = typeof onChange === 'function'

  if (isEditable && type === 'checkbox') {
    return (
      <div style={{ marginBottom: T.sp3 }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
        <label style={{ marginTop: T.sp1, display: 'inline-flex', alignItems: 'center', gap: T.sp2 }}>
          <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
          <span>{Boolean(value) ? 'Ja' : 'Nein'}</span>
        </label>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: T.sp3 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      {isEditable ? (
        multiline ? (
          <textarea
            value={anzeige ?? ''}
            onChange={e => onChange(e.target.value)}
            rows={4}
            style={{ width: '100%', marginTop: T.sp1, padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0, ...inputStyle }}
          />
        ) : (
          <input
            type={type}
            value={type === 'date' ? dateInputValue(anzeige) : (anzeige ?? '')}
            onChange={e => onChange(e.target.value)}
            style={{ width: '100%', marginTop: T.sp1, padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0, ...inputStyle }}
          />
        )
      ) : (
        <div style={{ marginTop: T.sp1, whiteSpace: multiline ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>{anzeige ?? '—'}</div>
      )}
    </div>
  )
}

function LabelMitHinweis({ text, hinweis }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{text}</span>
      <span
        title={hinweis}
        aria-label={hinweis}
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `1px solid ${T.border}`,
          background: T.bg,
          color: T.textMuted,
          fontSize: 11,
          fontWeight: 700,
          cursor: 'help',
        }}
      >
        i
      </span>
    </span>
  )
}

function DateField({ label, value, onChange }) {
  const containerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedIso = cleanDate(value)
  const selectedDate = isoDateToDate(selectedIso)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()))
  const textValue = formatDateHuman(value)

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

  function waehleTag(dayNumber) {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNumber)
    onChange(isoToHuman(toIsoDate(d)))
    setOpen(false)
  }

  return (
    <div style={{ marginBottom: T.sp3, position: 'relative' }} ref={containerRef}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp1, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: T.sp2 }}>
        <input
          type="text"
          value={textValue}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0 }}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            padding: '1px 8px',
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

function ZahlungsweiseFeld({ value, options, onChange, onEditOptions }) {
  const optionen = [...new Set([...(options || []), ...(value ? [value] : [])].filter(Boolean))]
  return (
    <div style={{ marginBottom: T.sp3 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>Zahlungsweise</div>
      <div style={{ marginTop: T.sp1, display: 'grid', gridTemplateColumns: '1fr auto', gap: T.sp2, alignItems: 'end' }}>
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none' }}
        >
          <option value="">—</option>
          {optionen.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onEditOptions}
          style={{ padding: '2px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.textMain, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Liste
        </button>
      </div>
    </div>
  )
}

function KalenderPopup({ viewMonth, selectedDate, onPrev, onNext, onSelectDay }) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const first = new Date(year, month, 1)
  const today = new Date()
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
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              style={{
                height: 28,
                borderRadius: 6,
                border: `1px solid ${isSelected ? T.primary : isToday ? '#60a5fa' : T.border}`,
                background: isSelected ? '#dbeafe' : isToday ? '#eff6ff' : T.bg,
                color: T.textMain,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isToday ? 700 : 400,
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

function KostenBlock({ daten, onChange }) {
  const ratenProJahr = cleanNumber(daten.jahresraten ?? daten.raten_pro_jahr)
  const kostenRate = cleanNumber(daten.kosten_pro_rate)
  const kostenJahr = berechneKostenJahr(ratenProJahr, kostenRate)
  const kostenMonat = kostenJahr == null ? null : kostenJahr / 12

  function setzeRatenJahr(v) {
    onChange('jahresraten', v)
    const neu = berechneKostenJahr(cleanNumber(v), kostenRate)
    onChange('kosten_jaehrlich', neu ?? '')
  }

  function setzeKostenRate(v) {
    onChange('kosten_pro_rate', v)
    const neu = berechneKostenJahr(ratenProJahr, cleanNumber(v))
    onChange('kosten_jaehrlich', neu ?? '')
  }

  return (
    <div style={{ marginBottom: T.sp3 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
        <Field label="Raten/Jahr" value={daten.jahresraten ?? daten.raten_pro_jahr} onChange={setzeRatenJahr} />
        <WaehrungFeld label="Kosten/Rate" value={daten.kosten_pro_rate} onChange={setzeKostenRate} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp3 }}>
        <AnzeigeFeld label="Kosten/Monat" value={formatCurrencyDisplay(kostenMonat)} />
        <AnzeigeFeld label="Kosten/Jahr" value={formatCurrencyDisplay(kostenJahr)} />
      </div>
    </div>
  )
}

function WaehrungFeld({ label, value, onChange }) {
  const [text, setText] = useState(formatCurrencyInput(value))

  useEffect(() => {
    setText(formatCurrencyInput(value))
  }, [value])

  function handleBlur() {
    const parsed = parseCurrencyInput(text)
    if (parsed == null) {
      setText('')
      onChange('')
      return
    }
    setText(formatCurrencyInput(parsed))
    onChange(parsed)
  }

  return (
    <div style={{ marginBottom: T.sp3 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
        style={{ width: '100%', marginTop: T.sp1, padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0 }}
      />
    </div>
  )
}

function AnzeigeFeld({ label, value }) {
  return (
    <div style={{ marginBottom: T.sp3 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp1, lineHeight: 1.35 }}>{value}</div>
    </div>
  )
}

function normalisiereMehrzeilig(value) {
  if (value == null) return value
  return String(value)
    .replace(/¶/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function AktionZeile({ label, value, href, actionLabel, onChange }) {
  return (
    <div style={{ marginBottom: T.sp2 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp1, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: T.sp2 }}>
        <input
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', minWidth: 0, padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0 }}
        />
        {value && href && (
          <a
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noreferrer' : undefined}
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.bg,
              color: T.primary,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {actionLabel}
          </a>
        )}
      </div>
    </div>
  )
}

function KontaktAktionen({ vertrag, onChange }) {
  const [copyStatus, setCopyStatus] = useState(null)
  const [entsperrtBis, setEntsperrtBis] = useState(() => Number(sessionStorage.getItem('archivy_secret_unlock_until_v2') || 0))
  const telefon = ersterWert(vertrag.telefon, vertrag.Telefon)
  const mobil = ersterWert(vertrag.mobil, vertrag.Mobil)
  const fax = ersterWert(vertrag.fax, vertrag.Fax)
  const email = ersterWert(vertrag.email, vertrag.Email, vertrag.e_mail)
  const webseite = ersterWert(vertrag.webseite, vertrag.Webseite, vertrag.website)
  const zugang = ersterWert(vertrag.zugang, vertrag.Zugang, vertrag.login, vertrag.Login)
  const passwort = ersterWert(vertrag.passwort, vertrag.Passwort, vertrag.paswort, vertrag.Paswort)

  useEffect(() => {
    sessionStorage.setItem('archivy_secret_unlock_until_v2', String(entsperrtBis || 0))
  }, [entsperrtBis])

  async function merkeWert(key, value) {
    if (!value) return
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('Clipboard nicht verfuegbar')
      await navigator.clipboard.writeText(String(value))
      setCopyStatus({ key, ok: true })
    } catch {
      setCopyStatus({ key, ok: false })
    }
  }

  async function vorAnzeigenPruefen() {
    const jetzt = Date.now()
    if (jetzt < entsperrtBis) return true

    const key = 'archivy_secret_pin_hash_v2'
    let gespeicherterPinHash = sessionStorage.getItem(key)

    if (!gespeicherterPinHash) {
      const neuerPin = window.prompt('Sicherheitscode festlegen (mindestens 4 Zeichen):')
      if (neuerPin == null) return false
      const pin = String(neuerPin).trim()
      if (pin.length < 4) {
        alert('Der Sicherheitscode muss mindestens 4 Zeichen haben.')
        return false
      }

      const bestaetigung = window.prompt('Sicherheitscode wiederholen:')
      if (bestaetigung == null) return false
      if (String(bestaetigung).trim() !== pin) {
        alert('Die Eingaben stimmen nicht überein.')
        return false
      }

      gespeicherterPinHash = await sha256Hex(pin)
      sessionStorage.setItem(key, gespeicherterPinHash)
    }

    const eingabe = window.prompt('Sicherheitscode eingeben, um Zugangsdaten anzuzeigen:')
    if (eingabe == null) return false

    const eingabeHash = await sha256Hex(String(eingabe).trim())
    if (eingabeHash !== String(gespeicherterPinHash)) {
      alert('Falscher Sicherheitscode.')
      return false
    }

    setEntsperrtBis(jetzt + 60 * 1000)
    return true
  }

  function sicherheitscodeZuruecksetzen() {
    const ok = window.confirm('Sicherheitscode für Zugangsdaten zurücksetzen?')
    if (!ok) return
    sessionStorage.removeItem('archivy_secret_pin_hash_v2')
    sessionStorage.removeItem('archivy_secret_unlock_until_v2')
    setEntsperrtBis(0)
  }

  return (
    <div style={{ marginBottom: T.sp3 }}>
      <Field label="Adresse" value={ersterWert(vertrag.kontakt, vertrag.Kontakt)} multiline onChange={v => onChange('kontakt', v)} />
      <AktionZeile label="Telefon" value={telefon} href={telefonHref(telefon)} actionLabel="Anrufen" onChange={v => onChange('telefon', v)} />
      <AktionZeile label="Mobil" value={mobil} href={telefonHref(mobil)} actionLabel="Anrufen" onChange={v => onChange('mobil', v)} />
      <AktionZeile label="Fax" value={fax} href={faxHref(fax)} actionLabel="Faxen" onChange={v => onChange('fax', v)} />
      <AktionZeile label="E-Mail" value={email} href={mailHref(email)} actionLabel="E-Mail" onChange={v => onChange('email', v)} />
      <AktionZeile label="Webseite" value={webseite} href={webHref(webseite)} actionLabel="Öffnen" onChange={v => onChange('webseite', v)} />
      <div style={{ marginBottom: T.sp2, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={sicherheitscodeZuruecksetzen}
          style={{ padding: '2px 8px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Sicherheitscode zurücksetzen
        </button>
      </div>
      <SecretZeile
        label="Zugang"
        rawValue={zugang}
        type="password"
        onChange={v => onChange('zugang', v)}
        onCopy={() => merkeWert('zugang', zugang)}
        status={copyStatus?.key === 'zugang' ? copyStatus : null}
      />
      <SecretZeile
        label="Passwort"
        rawValue={passwort}
        type="password"
        onChange={v => onChange('passwort', v)}
        onCopy={() => merkeWert('passwort', passwort)}
        status={copyStatus?.key === 'passwort' ? copyStatus : null}
      />
    </div>
  )
}

function SecretZeile({ label, rawValue, onChange, onCopy, status, type = 'text' }) {
  const [revealed, setRevealed] = useState(false)
  const hasValue = String(rawValue ?? '').trim() !== ''

  useEffect(() => {
    if (!revealed) return
    const timer = window.setTimeout(() => setRevealed(false), 15000)
    return () => window.clearTimeout(timer)
  }, [revealed])

  return (
    <div style={{ marginBottom: T.sp2 }}>
      <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: T.sp1, display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'end', gap: T.sp2 }}>
        {revealed ? (
          <div
            key="revealed"
            style={{ width: '100%', minWidth: 0, padding: '2px 0', borderBottom: `1px solid ${T.border}`, color: T.textMain, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {rawValue || '—'}
          </div>
        ) : (
          <input
            key="masked"
            type="password"
            value={String(rawValue ?? '')}
            onChange={e => onChange(e.target.value)}
            style={{ width: '100%', minWidth: 0, padding: '2px 0', border: 'none', borderBottom: `1px solid ${T.border}`, background: 'transparent', outline: 'none', borderRadius: 0 }}
          />
        )}
        {hasValue ? (
          <button
            type="button"
            onClick={async () => {
              if (revealed) {
                setRevealed(false)
                return
              }
              setRevealed(true)
            }}
            style={{
              padding: '2px 8px',
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
            {revealed ? 'Verbergen' : 'Anzeigen'}
          </button>
        ) : null}
        {rawValue ? (
          <button
            type="button"
            onClick={onCopy}
            disabled={!revealed}
            style={{
              padding: '2px 8px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.bg,
              color: T.textMain,
              fontSize: 12,
              fontWeight: 600,
              cursor: revealed ? 'pointer' : 'not-allowed',
              opacity: revealed ? 1 : 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            merken
          </button>
        ) : null}
        {status ? (
          <span style={{ fontSize: 12, color: status.ok ? '#166534' : T.danger, whiteSpace: 'nowrap' }}>
            {status.ok ? 'gemerkt' : 'nicht möglich'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function telefonHref(value) {
  if (!value) return null
  return `tel:${String(value).replace(/\s+/g, '')}`
}

function faxHref(value) {
  if (!value) return null
  return `fax:${String(value).replace(/\s+/g, '')}`
}

function mailHref(value) {
  if (!value) return null
  return `mailto:${String(value).trim()}`
}

function webHref(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.startsWith('http://') || text.startsWith('https://')) return text
  return `https://${text}`
}

function fristFarbe(frist, erledigt) {
  if (!frist || erledigt) return T.textMain
  const diff = (new Date(frist) - new Date()) / 86400000
  if (diff < 0) return T.danger
  if (diff <= 7) return T.warning
  return T.textMain
}

function formatDateDisplay(value) {
  if (!value) return null
  const text = String(value).trim()

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

function normalisiereVertragId(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalisiereVertragKompakt(value) {
  return normalisiereVertragId(value).replace(/[^a-z0-9]/g, '')
}

function ownerVarianten(ownerId) {
  const raw = String(ownerId ?? '').trim()
  if (!raw || raw === '__all__') return []

  // Keep combined owners together: nicole-stefan <-> nicole+stefan
  const plus = raw.replace(/-/g, '+')
  const dash = raw.replace(/\+/g, '-')

  return [...new Set([raw, plus, dash])]
}

function LogoPreview({ vertrag, logoFehler, setLogoFehler }) {
  const logoSrc = normalisiereLogoQuelle(ersterWert(vertrag?.datei_pfad_2, vertrag?.logo, vertrag?.Logo, vertrag?.dateiPfad2))

  if (logoSrc && !logoFehler) {
    return (
      <img
        src={logoSrc}
        alt={vertrag?.firma || 'Logo'}
        onError={() => setLogoFehler(true)}
        style={{ width: 64, height: 64, borderRadius: 12, border: 'none', objectFit: 'contain', background: 'transparent', display: 'block', transform: 'scale(1.05)' }}
      />
    )
  }

  return (
    <div style={{ width: 64, height: 64, borderRadius: 12, border: `1px solid ${T.border}`, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
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
  if (v.startsWith('http://') || v.startsWith('https://')) return optimizeImageUrl(v, { width: 320, quality: 68 })
  if (v.startsWith('data:')) return v
  if (/^<svg[\s>]/i.test(v)) return `data:image/svg+xml;utf8,${encodeURIComponent(v)}`
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length >= 40) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return optimizeImageUrl(`https://${v}`, { width: 320, quality: 68 })
  return null
}

function buildVertragPayload(daten, owner) {
  const istDiskret = isDiskretValue(daten.diskret)
  return {
    gruppe: cleanText(daten.gruppe),
    untergruppe: cleanText(daten.untergruppe),
    firma: cleanText(daten.firma),
    kontakt: cleanText(daten.kontakt),
    kontakt_adresse_id: cleanText(daten.kontakt_adresse_id),
    telefon: cleanText(daten.telefon),
    mobil: cleanText(daten.mobil),
    fax: cleanText(daten.fax),
    email: cleanText(daten.email),
    webseite: cleanText(daten.webseite),
    zugang: istDiskret ? null : cleanText(daten.zugang),
    passwort: istDiskret ? null : cleanText(daten.passwort),
    diskret: diskretDbValue(daten.diskret),
    beschreibung: cleanText(daten.beschreibung),
    vertragsnummer: cleanText(daten.vertragsnummer),
    vertragsbesitzer_id: cleanText(daten.vertragsbesitzer_id) || (owner && owner.id !== '__all__' ? owner.id : null),
    iban: cleanText(daten.iban),
    bic: cleanText(daten.bic),
    bank: cleanText(daten.bank),
    jahresraten: cleanNumber(daten.jahresraten),
    kosten_pro_rate: cleanNumber(daten.kosten_pro_rate),
    kosten_monatlich: cleanNumber(daten.kosten_monatlich),
    kosten_jaehrlich: cleanNumber(daten.kosten_jaehrlich),
    zahlungsweise: cleanText(daten.zahlungsweise),
    dauerzahlung_id: cleanText(daten.dauerzahlung_id),
    vertrags_datum: cleanDate(daten.vertrags_datum),
    vertrags_beginn: cleanDate(daten.vertrags_beginn),
    vertrags_ablauf: cleanDate(daten.vertrags_ablauf),
    kuendigungsfrist: cleanText(daten.kuendigungsfrist),
    datei_pfad: cleanText(daten.datei_pfad),
    datei_pfad_2: cleanText(daten.datei_pfad_2),
    aktiv: Boolean(daten.aktiv),
    notizen: cleanText(daten.notizen),
  }
}

async function sha256Hex(text) {
  const encoded = new TextEncoder().encode(String(text ?? ''))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function cleanText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function cleanNumber(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const normalized = text.replace(/\s/g, '').replace(',', '.')
  if (!normalized) return null
  const num = Number(normalized)
  if (!Number.isFinite(num)) return null
  if (Number.isInteger(num) && num >= 10000) return num / 100
  return num
}

function cleanDate(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
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

function dateInputValue(value) {
  if (!value) return ''
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const human = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (human) {
    const day = String(Number(human[1])).padStart(2, '0')
    const month = String(Number(human[2])).padStart(2, '0')
    return `${human[3]}-${month}-${day}`
  }
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function isoToHuman(isoText) {
  const m = String(isoText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}.${m[2]}.${m[1]}`
}

function formatDateHuman(value) {
  if (!value) return ''
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const human = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (human) {
    const day = String(Number(human[1])).padStart(2, '0')
    const month = String(Number(human[2])).padStart(2, '0')
    return `${day}.${month}.${human[3]}`
  }
  return text
}

function formatCurrencyDisplay(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function berechneKostenJahr(ratenProJahr, kostenRate) {
  if (ratenProJahr == null || kostenRate == null) return null
  const val = Number(ratenProJahr) * Number(kostenRate)
  if (!Number.isFinite(val)) return null
  return Math.round(val * 100) / 100
}

function formatCurrencyInput(value) {
  const num = cleanNumber(value)
  if (num == null) return ''
  return Number(num).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrencyInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const normalized = text
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

function isDiskretValue(value) {
  if (typeof value === 'boolean') return value
  return String(value ?? '').trim().toLowerCase() === 'x'
}

function diskretDbValue(value) {
  return isDiskretValue(value) ? 'x' : null
}

function ersterWert(...werte) {
  for (const wert of werte) {
    if (wert == null) continue
    if (String(wert).trim() === '') continue
    return wert
  }
  return null
}

function quelleText(modifiedBy) {
  const v = String(modifiedBy ?? '').trim().toLowerCase()
  if (v === 'filemaker') return 'Quelle: FileMaker'
  if (v === 'archivy') return 'Quelle: Archivy'
  return 'Quelle: unbekannt'
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

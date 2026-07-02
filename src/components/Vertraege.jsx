import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens'
import { supabase } from '../lib/supabase'
import { optimizeImageUrl } from '../lib/storage'

const PAGE = 300
const FILTERS_STORAGE_PREFIX = 'archivy.vertraege.filters.v1'
const GROUPEN_STORAGE_PREFIX = 'archivy.vertraege.gruppen.v1'
const DEFAULT_GROUPEN = [
  'Abo',
  'Betreuung',
  'Beschäftigung',
  'Dauerauftrag',
  'Dienstleistung',
  'Einkünfte',
  'Fahrzeug',
  'Finanzen',
  'Gesundheit',
  'Haustiere',
  'Immobilienbesitz',
  'Kauf',
  'Miete',
  'Mitgliedschaft',
  'Privat',
  'Reisen',
  'Steuern',
  'Vermietung',
  'Versicherung',
  'Wohnen',
]
const SORTIERUNGEN = {
  firma_asc: { column: 'firma', ascending: true, label: 'Firma A-Z' },
  firma_desc: { column: 'firma', ascending: false, label: 'Firma Z-A' },
  gruppe_asc: { column: 'gruppe', ascending: true, label: 'Gruppe A-Z' },
  ablauf_asc: { column: 'vertrags_ablauf', ascending: true, label: 'Ablauf (früh zuerst)' },
  kosten_desc: { column: 'kosten_jaehrlich', ascending: false, label: 'Kosten/Jahr (hoch zuerst)' },
}

export default function Vertraege({ owner, onSelectContract }) {
  const ownerIds = useMemo(() => ownerVarianten(owner?.id), [owner?.id])
  const filterStorageKey = useMemo(() => `${FILTERS_STORAGE_PREFIX}:${owner?.id ?? '__all__'}`, [owner?.id])
  const gruppenStorageKey = useMemo(() => `${GROUPEN_STORAGE_PREFIX}:${owner?.id ?? '__all__'}`, [owner?.id])
  const [zeilen, setZeilen] = useState([])
  const [suche, setSuche] = useState('')
  const [gruppen, setGruppen] = useState([])
  const [gruppeFilter, setGruppeFilter] = useState('__all__')
  const [sortierung, setSortierung] = useState('firma_asc')
  const [laden, setLaden] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [gruppenEditorOpen, setGruppenEditorOpen] = useState(false)
  const [gruppenEditorText, setGruppenEditorText] = useState('')
  const [filtersHydrated, setFiltersHydrated] = useState(false)
  const [hydratedFilterKey, setHydratedFilterKey] = useState(null)
  const kostenSummen = useMemo(() => berechneKostenSummen(zeilen), [zeilen])

  useEffect(() => {
    if (!owner) return
    setFiltersHydrated(false)
    setHydratedFilterKey(null)
    const saved = loadFilterState(filterStorageKey)
    if (!saved) {
      setSuche('')
      setGruppeFilter('__all__')
      setSortierung('firma_asc')
      setFiltersHydrated(true)
      setHydratedFilterKey(filterStorageKey)
      return
    }

    setSuche(saved.suche ?? '')
    setGruppeFilter(saved.gruppeFilter ?? '__all__')
    setSortierung(saved.sortierung && SORTIERUNGEN[saved.sortierung] ? saved.sortierung : 'firma_asc')
    setFiltersHydrated(true)
    setHydratedFilterKey(filterStorageKey)
  }, [owner, filterStorageKey])

  useEffect(() => {
    if (!owner || !filtersHydrated || hydratedFilterKey !== filterStorageKey) return
    saveFilterState(filterStorageKey, { suche, gruppeFilter, sortierung })
  }, [owner, filtersHydrated, hydratedFilterKey, filterStorageKey, suche, gruppeFilter, sortierung])

  useEffect(() => {
    if (gruppeFilter !== '__all__' && !gruppen.includes(gruppeFilter)) {
      setGruppeFilter('__all__')
    }
  }, [gruppen, gruppeFilter])

  useEffect(() => {
    if (!owner) return
    setGruppen(loadGruppenState(gruppenStorageKey))
  }, [owner, gruppenStorageKey])

  useEffect(() => {
    if (!owner) return
    saveGruppenState(gruppenStorageKey, gruppen)
  }, [owner, gruppenStorageKey, gruppen])

  useEffect(() => {
    if (!owner || !filtersHydrated || hydratedFilterKey !== filterStorageKey) return
    let aktiv = true

    async function laden() {
      setLaden(true)
      const sortDef = SORTIERUNGEN[sortierung] || SORTIERUNGEN.firma_asc
      let query = supabase
        .from('vertraege')
        .select('id, vertrag_id, gruppe, firma, beschreibung, vertragsnummer, kosten_monatlich, kosten_jaehrlich, vertrags_ablauf, aktiv, logo:datei_pfad_2')
        .order(sortDef.column, { ascending: sortDef.ascending })
        .limit(PAGE)

      if (owner.id !== '__all__') {
        query = query.in('vertragsbesitzer_id', ownerIds)
      }

      if (gruppeFilter !== '__all__') {
        query = query.or(`gruppe.eq.${escapePostgrestValue(gruppeFilter)},gruppe.ilike.${escapePostgrestPattern(gruppeFilter)}%`)
      }

      if (suche.trim()) {
        query = query.or(`firma.ilike.%${suche.trim()}%,beschreibung.ilike.%${suche.trim()}%,vertragsnummer.ilike.%${suche.trim()}%`)
      }

      const { data } = await query
      if (aktiv) {
        setZeilen(data ?? [])
        setLaden(false)
      }
    }
    laden()
    return () => { aktiv = false }
  }, [suche, owner, gruppeFilter, sortierung, reloadToken, filtersHydrated, hydratedFilterKey, filterStorageKey])

  function bearbeiteGruppen() {
    setGruppenEditorText((gruppen.length > 0 ? gruppen : DEFAULT_GROUPEN).join('\n'))
    setGruppenEditorOpen(true)
  }

  function resetFilter() {
    setSuche('')
    setGruppeFilter('__all__')
    setSortierung('firma_asc')
  }

  function speichereGruppen() {
    const liste = [...new Set(
      String(gruppenEditorText)
        .split(/\r?\n/)
        .map(v => v.trim())
        .filter(Boolean)
    )]

    if (liste.length === 0) {
      alert('Die Gruppenliste darf nicht leer sein.')
      return
    }

    setGruppen(liste)
    if (gruppeFilter !== '__all__' && !liste.includes(gruppeFilter)) {
      setGruppeFilter('__all__')
    }
    setGruppenEditorOpen(false)
  }

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
      del = del.in('vertragsbesitzer_id', ownerIds)
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
        <button
          type="button"
          onClick={bearbeiteGruppen}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Gruppen bearbeiten
        </button>
        <button
          type="button"
          onClick={resetFilter}
          style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: 'pointer', whiteSpace: 'nowrap' }}
          title="Suche, Gruppenfilter und Sortierung zurücksetzen"
        >
          Filter zurücksetzen
        </button>
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
        <div>
          <p style={{ color: T.textMuted }}>Keine Verträge gefunden.</p>
          {(suche.trim() || gruppeFilter !== '__all__' || sortierung !== 'firma_asc') && (
            <button
              type="button"
              onClick={resetFilter}
              style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: 'pointer' }}
            >
              Aktive Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: 'left' }}>
                <th className="vt-col-gruppe" style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted }}>Gruppe</th>
                <th style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>Logo</th>
                <th className="vt-col-firma" style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>Firma</th>
                <th className="vt-col-beschreibung" style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>Beschreibung</th>
                <th className="vt-col-kosten" style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <div style={{ lineHeight: 1.2 }}>Kosten/Monat</div>
                  <div style={{ lineHeight: 1.2, marginTop: 2 }}>Kosten/Jahr</div>
                </th>
                <th style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>Ablauf</th>
                <th style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((v, idx) => (
                <tr key={String(v.id ?? v.vertrag_id ?? idx)} style={{ borderBottom: `1px solid ${T.border}`, opacity: v.aktiv ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => onSelectContract(v.vertrag_id, zeilen.map(z => z.vertrag_id))}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td className="vt-col-gruppe" style={{ padding: `${T.sp2} ${T.sp3}`, verticalAlign: 'top', whiteSpace: 'pre-line' }}>{normalizeGruppe(v.gruppe) ?? '—'}</td>
                  <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>
                    <LogoCell logo={v.logo} firma={v.firma} />
                  </td>
                  <td className="vt-col-firma" style={{ padding: `${T.sp2} ${T.sp3}` }}>{cleanText(v.firma) || '—'}</td>
                  <td className="vt-col-beschreibung" style={{ padding: `${T.sp2} ${T.sp3}`, maxWidth: 340 }}>
                    <div style={{
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.35em',
                      maxHeight: '2.7em',
                      whiteSpace: 'normal',
                    }} title={cleanText(v.beschreibung) || ''}>
                      {cleanText(v.beschreibung) || '—'}
                    </div>
                  </td>
                  <td className="vt-col-kosten" style={{ padding: `${T.sp2} ${T.sp3}`, textAlign: 'right' }}>
                    <div style={{ color: '#15803d', fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                      <Kostenwert value={formatKostenMonatlich(v.kosten_monatlich, v.kosten_jaehrlich)} />
                    </div>
                    <div style={{ color: '#334155', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                      <Kostenwert value={formatKostenJaehrlich(v.kosten_jaehrlich)} />
                    </div>
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
            <tfoot>
              <tr style={{ borderTop: `2px solid ${T.border}`, background: T.bgCard }}>
                <td colSpan={5} style={{ padding: `${T.sp2} ${T.sp3}`, color: T.textMuted, fontWeight: 700, textAlign: 'right' }}>
                  Summe
                </td>
                <td className="vt-col-kosten" style={{ padding: `${T.sp2} ${T.sp3}`, textAlign: 'right' }}>
                  <div style={{ color: '#15803d', fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                    <Kostenwert value={formatKosten(kostenSummen.monat)} />
                  </div>
                  <div style={{ color: '#334155', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                    <Kostenwert value={formatKosten(kostenSummen.jahr)} />
                  </div>
                </td>
                <td style={{ padding: `${T.sp2} ${T.sp3}` }} />
                <td style={{ padding: `${T.sp2} ${T.sp3}` }} />
              </tr>
            </tfoot>
            </table>
          </div>
        </>
      )}

      {gruppenEditorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'grid',
            placeItems: 'center',
            padding: T.sp4,
            zIndex: 100,
          }}
          onClick={() => setGruppenEditorOpen(false)}
        >
          <div
            style={{
              width: 'min(680px, 100%)',
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: T.sp4,
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: T.sp2, fontSize: 18 }}>Gruppen bearbeiten</h2>
            <p style={{ marginTop: 0, marginBottom: T.sp3, color: T.textMuted }}>
              Eine Gruppe pro Zeile. Diese Liste gilt nur für den aktuellen Benutzer/Inhaber.
            </p>
            <div style={{ marginBottom: T.sp3, borderRadius: T.r2, padding: T.sp3, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', lineHeight: 1.4 }}>
              Warnhinweis: Wenn du Gruppen umbenennst oder löschst, können vorhandene Verträge in der Liste nicht mehr angezeigt werden, weil sie der alten Gruppe zugeordnet bleiben.
            </div>
            <textarea
              value={gruppenEditorText}
              onChange={e => setGruppenEditorText(e.target.value)}
              rows={18}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: `1px solid ${T.border}`,
                borderRadius: T.r2,
                padding: T.sp3,
                font: 'inherit',
                resize: 'vertical',
                minHeight: 280,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.sp2, marginTop: T.sp3, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setGruppenEditorOpen(false)}
                style={{ border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.bgCard, cursor: 'pointer' }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={speichereGruppen}
                style={{ border: 'none', borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}`, background: T.primary, color: T.textOnTeal, cursor: 'pointer', fontWeight: 700 }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ownerVarianten(ownerId) {
  const raw = String(ownerId ?? '').trim()
  if (!raw || raw === '__all__') return []

  const normalized = raw.replace(/\s*[+-]\s*/g, m => m.includes('+') ? '+' : '-')
  const plus = normalized.replace(/-/g, '+')
  const dash = normalized.replace(/\+/g, '-')

  return [...new Set([
    normalized,
    plus,
    dash,
    normalized.toLowerCase(),
    plus.toLowerCase(),
    dash.toLowerCase(),
  ])]
}

function normalizeGruppe(value) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  return text.split(/\r?\n/).map(part => part.trim()).filter(Boolean)[0] ?? null
}

function escapePostgrestValue(value) {
  return String(value ?? '').replace(/,/g, '%2C')
}

function escapePostgrestPattern(value) {
  return String(value ?? '')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '%2C')
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

function cleanText(value) {
  if (value == null) return ''
  const text = String(value).trim()
  if (!text || enthaeltParserFehler(text)) return ''
  return text
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

function formatKosten(raw) {
  const value = parseKostenWert(raw)
  if (value == null) return '—'
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatKostenMonatlich(rawMonat, rawJahr) {
  const monat = parseKostenWert(rawMonat)
  if (monat != null) return formatKosten(monat)

  const jahr = parseKostenWert(rawJahr)
  if (jahr == null) return '—'
  return formatKosten(jahr / 12)
}

function formatKostenJaehrlich(raw) {
  return formatKosten(raw)
}

function parseKostenWert(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
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

  return parsed
}

function berechneKostenSummen(zeilen) {
  let monat = 0
  let jahr = 0

  for (const v of zeilen || []) {
    const jahrWert = parseKostenWert(v?.kosten_jaehrlich)
    const monatWert = parseKostenWert(v?.kosten_monatlich)

    if (jahrWert != null) jahr += jahrWert
    if (monatWert != null) {
      monat += monatWert
    } else if (jahrWert != null) {
      monat += jahrWert / 12
    }
  }

  return { monat, jahr }
}

function Kostenwert({ value }) {
  const parts = splitKostenTeile(value)
  if (!parts) return <span>—</span>

  return (
    <span
      style={{
        display: 'inline-grid',
        gridTemplateColumns: '10ch auto 2ch',
        alignItems: 'baseline',
        justifyContent: 'end',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ textAlign: 'right' }}>{parts.ganz}</span>
      <span>,</span>
      <span style={{ textAlign: 'left' }}>{parts.dez}</span>
    </span>
  )
}

function splitKostenTeile(text) {
  if (!text || text === '—') return null
  const cleaned = String(text).trim()
  const idx = cleaned.lastIndexOf(',')
  if (idx === -1) return { ganz: cleaned, dez: '00' }
  return {
    ganz: cleaned.slice(0, idx),
    dez: cleaned.slice(idx + 1),
  }
}

function LogoCell({ logo, firma }) {
  const [error, setError] = useState(false)
  const src = normalisiereLogoQuelle(logo)
  const boxStyle = {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    overflow: 'hidden',
  }

  if (src && !error) {
    return (
      <div style={boxStyle}>
        <img
          src={src}
          alt={firma || 'Logo'}
          loading="lazy"
          decoding="async"
          onError={() => setError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transform: 'scale(1.04)' }}
        />
      </div>
    )
  }

  return (
    <div style={{ ...boxStyle, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
      {logoText(firma)}
    </div>
  )
}

function normalisiereLogoQuelle(value) {
  if (!value || typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) return optimizeImageUrl(v, { width: 48, quality: 40 })
  if (v.startsWith('data:')) return v
  if (/^<svg[\s>]/i.test(v)) return `data:image/svg+xml;utf8,${encodeURIComponent(v)}`
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length >= 40) return `data:image/png;base64,${v.replace(/\s+/g, '')}`
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return optimizeImageUrl(`https://${v}`, { width: 48, quality: 40 })
  return null
}

function loadFilterState(key) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      suche: typeof parsed.suche === 'string' ? parsed.suche : '',
      gruppeFilter: typeof parsed.gruppeFilter === 'string' ? parsed.gruppeFilter : '__all__',
      sortierung: typeof parsed.sortierung === 'string' ? parsed.sortierung : 'firma_asc',
    }
  } catch {
    return null
  }
}

function saveFilterState(key, state) {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      suche: state.suche ?? '',
      gruppeFilter: state.gruppeFilter ?? '__all__',
      sortierung: state.sortierung ?? 'firma_asc',
    }))
  } catch {
    // Ignore storage errors (private mode or quota exceeded).
  }
}

function loadGruppenState(key) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return [...DEFAULT_GROUPEN]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_GROUPEN]
    const list = parsed
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
    return list.length > 0 ? [...new Set(list)] : [...DEFAULT_GROUPEN]
  } catch {
    return [...DEFAULT_GROUPEN]
  }
}

function saveGruppenState(key, gruppen) {
  try {
    window.localStorage.setItem(key, JSON.stringify(gruppen ?? []))
  } catch {
    // Ignore storage errors (private mode or quota exceeded).
  }
}

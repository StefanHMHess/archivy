import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../tokens'

export default function VertragsbesitzerAdmin() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [newName, setNewName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newAllowedUsers, setNewAllowedUsers] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [csvDelimiter, setCsvDelimiter] = useState(';')
  const [transferOwnerId, setTransferOwnerId] = useState('')
  const [deactivateMissing, setDeactivateMissing] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferStatus, setTransferStatus] = useState(null)

  useEffect(() => {
    loadOwners()
  }, [])

  useEffect(() => {
    if (!transferOwnerId && rows.length > 0) {
      setTransferOwnerId(rows[0].id)
    }
  }, [rows, transferOwnerId])

  async function loadOwners() {
    setLoading(true)
    setError(null)
    setTableMissing(false)

    const { data, error } = await supabase
      .from('vertragsbesitzer')
      .select('id,name,display_name,allowed_users')
      .order('name', { ascending: true })

    if (error) {
      const msg = error.message || ''
      const missing = msg.includes("Could not find the table 'public.vertragsbesitzer'")
      setTableMissing(missing)
      setError(missing ? null : msg)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data ?? []).map(normalizeRow))
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)

    const name = newName.trim()
    if (!name) return

    const id = slugify(name)
    const payload = {
      id,
      name,
      display_name: newDisplayName.trim() || name,
      allowed_users: parseEmails(newAllowedUsers),
    }

    const { error } = await supabase.from('vertragsbesitzer').insert(payload)
    if (error) {
      setError(error.message)
      return
    }

    setNewName('')
    setNewDisplayName('')
    setNewAllowedUsers('')
    await loadOwners()
  }

  async function handleSave(row) {
    setSavingId(row.id)
    setError(null)

    const payload = {
      name: row.name.trim(),
      display_name: (row.display_name || '').trim() || row.name.trim(),
      allowed_users: parseEmails(row.allowed_users_text),
      geaendert: new Date().toISOString(),
    }

    const { error } = await supabase.from('vertragsbesitzer').update(payload).eq('id', row.id)
    setSavingId(null)

    if (error) {
      setError(error.message)
      return
    }

    await loadOwners()
  }

  async function handleDelete(row) {
    const ok = window.confirm(`Inhaber "${row.display_name || row.name}" wirklich löschen?`)
    if (!ok) return

    setError(null)
    const { error } = await supabase.from('vertragsbesitzer').delete().eq('id', row.id)
    if (error) {
      setError(error.message)
      return
    }

    await loadOwners()
  }

  async function handleTransfer(mode) {
    if (!csvFile) {
      setTransferStatus({ kind: 'error', text: 'Bitte zuerst eine CSV-Datei auswählen.' })
      return
    }
    if (!transferOwnerId) {
      setTransferStatus({ kind: 'error', text: 'Bitte einen Ziel-Inhaber auswählen.' })
      return
    }

    setTransferBusy(true)
    setTransferStatus(null)

    try {
      const text = await csvFile.text()
      const parsedRows = parseCsv(text, csvDelimiter || ';')
      if (parsedRows.length < 2) {
        throw new Error('CSV enthält keine Datensätze.')
      }

      const header = parsedRows[0].map(normalizeHeader)
      const dataRows = parsedRows.slice(1)
      const payload = []
      for (let i = 0; i < dataRows.length; i += 1) {
        const mapped = mapFilemakerRow(toObject(header, dataRows[i]), transferOwnerId, i + 1)
        if (mapped) payload.push(mapped)
      }

      if (payload.length === 0) {
        throw new Error('Keine importierbaren Vertragszeilen in der CSV gefunden.')
      }

      const chunkSize = 200
      let upserted = 0
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize)
        const { error } = await supabase.from('vertraege').upsert(chunk, { onConflict: 'vertrag_id' })
        if (error) throw new Error(error.message)
        upserted += chunk.length
      }

      let deactivated = 0
      if (mode === 'sync' && deactivateMissing) {
        const incomingIds = new Set(payload.map(p => p.vertrag_id))
        const { data: existing, error: existingError } = await supabase
          .from('vertraege')
          .select('vertrag_id,aktiv')
          .eq('vertragsbesitzer_id', transferOwnerId)

        if (existingError) throw new Error(existingError.message)

        const missingIds = (existing ?? [])
          .filter(v => !incomingIds.has(v.vertrag_id) && v.aktiv !== false)
          .map(v => v.vertrag_id)

        if (missingIds.length > 0) {
          const { error: deactivateError } = await supabase
            .from('vertraege')
            .update({ aktiv: false, app_modified_at: new Date().toISOString(), sync_state: 'geaendert' })
            .eq('vertragsbesitzer_id', transferOwnerId)
            .in('vertrag_id', missingIds)

          if (deactivateError) throw new Error(deactivateError.message)
          deactivated = missingIds.length
        }
      }

      const modeText = mode === 'sync' ? 'Sync' : 'Import'
      const extra = mode === 'sync' && deactivateMissing ? `, ${deactivated} als inaktiv markiert` : ''
      setTransferStatus({ kind: 'success', text: `${modeText} erfolgreich: ${upserted} Verträge verarbeitet${extra}.` })
    } catch (e) {
      setTransferStatus({ kind: 'error', text: e.message || String(e) })
    } finally {
      setTransferBusy(false)
    }
  }

  const ownerCount = useMemo(() => rows.length, [rows])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: T.sp4, marginBottom: T.sp5, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Inhaber verwalten</h1>
          <p style={{ color: T.textMuted, marginTop: T.sp2, marginBottom: 0 }}>
            Anzahl: {ownerCount}
          </p>
        </div>

        <button
          onClick={loadOwners}
          style={{
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp4}`,
            cursor: 'pointer',
          }}
        >
          Neu laden
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: T.sp4, color: T.danger, background: '#fee', borderRadius: T.r2, padding: T.sp3 }}>
          {error}
        </div>
      )}

      {tableMissing && (
        <div style={{ marginBottom: T.sp4, color: '#9a3412', background: '#fff7ed', borderRadius: T.r2, padding: T.sp3 }}>
          Tabelle für <strong>Inhaber</strong> fehlt in der Datenbank (technisch: <strong>vertragsbesitzer</strong>). Führe im Supabase SQL Editor zuerst das Schema aus
          und lade dann diese Seite neu.
        </div>
      )}

      <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4, marginBottom: T.sp5 }}>
        <h2 style={{ marginTop: 0, fontSize: 16, marginBottom: T.sp2 }}>Dateiabgleich und Import (FileMaker CSV)</h2>
        <p style={{ marginTop: 0, marginBottom: T.sp3, color: T.textMuted }}>
          Persönlicher <strong>Sync</strong>: wiederholt ausführen, um Verträge laufend zu aktualisieren. Für spätere externe Nutzung bleibt
          der <strong>Import</strong> als separater Weg im selben Admin-Tab verfügbar.
        </p>

        <div style={{ display: 'grid', gap: T.sp3, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: T.sp1 }}>CSV-Datei</div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setCsvFile(e.target.files?.[0] || null)}
              style={{ width: '100%' }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: T.sp1 }}>Ziel-Inhaber</div>
            <select
              value={transferOwnerId}
              onChange={e => setTransferOwnerId(e.target.value)}
              style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}` }}
              disabled={rows.length === 0}
            >
              {rows.length === 0 ? (
                <option value="">Keine Inhaber vorhanden</option>
              ) : rows.map(owner => (
                <option key={owner.id} value={owner.id}>{owner.display_name || owner.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: T.sp1 }}>Trennzeichen</div>
            <input
              value={csvDelimiter}
              onChange={e => setCsvDelimiter(e.target.value.slice(0, 1))}
              placeholder=";"
              style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}` }}
            />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: T.sp2, marginTop: T.sp3, color: T.textMain }}>
          <input
            type="checkbox"
            checked={deactivateMissing}
            onChange={e => setDeactivateMissing(e.target.checked)}
          />
          Beim Sync: fehlende Verträge für den gewählten Inhaber auf inaktiv setzen
        </label>

        <div style={{ display: 'flex', gap: T.sp2, marginTop: T.sp4, flexWrap: 'wrap' }}>
          <button
            onClick={() => handleTransfer('sync')}
            disabled={transferBusy || !csvFile || !transferOwnerId}
            style={{
              background: T.primary,
              color: T.textOnTeal,
              border: 'none',
              borderRadius: T.r2,
              padding: `${T.sp2} ${T.sp4}`,
              cursor: transferBusy ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {transferBusy ? 'Verarbeitet…' : 'Sync aus CSV starten'}
          </button>

          <button
            onClick={() => handleTransfer('import')}
            disabled={transferBusy || !csvFile || !transferOwnerId}
            style={{
              background: T.bg,
              color: T.textMain,
              border: `1px solid ${T.border}`,
              borderRadius: T.r2,
              padding: `${T.sp2} ${T.sp4}`,
              cursor: transferBusy ? 'wait' : 'pointer',
            }}
          >
            Import aus CSV starten
          </button>
        </div>

        {transferStatus && (
          <div
            style={{
              marginTop: T.sp3,
              borderRadius: T.r2,
              padding: T.sp3,
              background: transferStatus.kind === 'success' ? '#ecfdf5' : '#fee2e2',
              color: transferStatus.kind === 'success' ? '#065f46' : '#991b1b',
            }}
          >
            {transferStatus.text}
          </div>
        )}
      </section>

      <form
        onSubmit={handleCreate}
        style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.r2, padding: T.sp4, marginBottom: T.sp5 }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16, marginBottom: T.sp3 }}>Neuen Inhaber anlegen</h2>

        <div style={{ display: 'grid', gap: T.sp3, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Input
            label="Name"
            value={newName}
            onChange={setNewName}
            placeholder="z. B. Nicole+Stefan"
            required
          />

          <Input
            label="Anzeigename"
            value={newDisplayName}
            onChange={setNewDisplayName}
            placeholder="optional"
          />

          <Input
            label="Zugewiesene Benutzer (E-Mails)"
            value={newAllowedUsers}
            onChange={setNewAllowedUsers}
            placeholder="a@x.de, b@x.de"
          />
        </div>

        <button
          type="submit"
          style={{
            marginTop: T.sp4,
            background: T.primary,
            color: T.textOnTeal,
            border: 'none',
            borderRadius: T.r2,
            padding: `${T.sp2} ${T.sp4}`,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Anlegen
        </button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: T.bg, textAlign: 'left' }}>
              {['ID', 'Name', 'Anzeigename', 'Benutzer-E-Mails', 'Aktionen'].map(h => (
                <th key={h} style={{ padding: `${T.sp2} ${T.sp3}`, borderBottom: `2px solid ${T.border}`, color: T.textMuted, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: T.sp4, color: T.textMuted }}>Lädt…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: T.sp4, color: T.textMuted }}>Keine Einträge vorhanden.</td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap', color: T.textMuted }}>{row.id}</td>
                <td style={{ padding: `${T.sp2} ${T.sp3}`, minWidth: 180 }}>
                  <input
                    value={row.name}
                    onChange={e => updateLocalRow(setRows, row.id, { name: e.target.value })}
                    style={cellInputStyle()}
                  />
                </td>
                <td style={{ padding: `${T.sp2} ${T.sp3}`, minWidth: 220 }}>
                  <input
                    value={row.display_name || ''}
                    onChange={e => updateLocalRow(setRows, row.id, { display_name: e.target.value })}
                    style={cellInputStyle()}
                  />
                </td>
                <td style={{ padding: `${T.sp2} ${T.sp3}`, minWidth: 320 }}>
                  <input
                    value={row.allowed_users_text}
                    onChange={e => updateLocalRow(setRows, row.id, { allowed_users_text: e.target.value })}
                    placeholder="a@x.de, b@x.de"
                    style={cellInputStyle()}
                  />
                </td>
                <td style={{ padding: `${T.sp2} ${T.sp3}`, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: T.sp2 }}>
                    <button
                      onClick={() => handleSave(row)}
                      disabled={savingId === row.id}
                      style={actionButtonStyle('save')}
                    >
                      {savingId === row.id ? 'Speichert…' : 'Speichern'}
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      style={actionButtonStyle('delete')}
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function mapFilemakerRow(row, ownerIdValue, rowNumber) {
  const vertragId = firstOf(row,
    'vertrag_id',
    'vertrags_id',
    'vertragsid',
    'id',
    'vertragnummer',
    'vertragsnummer'
  )

  const generatedId = vertragId || `FM-${ownerIdValue}-${rowNumber}`
  const firma = firstOf(row, 'firma', 'vertragspartner', 'anbieter', 'partner', 'name')
  const beschreibung = firstOf(row, 'beschreibung', 'bezeichnung', 'kurzbeschreibung')

  return {
    vertrag_id: String(generatedId),
    vertragsbesitzer_id: ownerIdValue,
    gruppe: firstOf(row, 'gruppe', 'kategorie'),
    untergruppe: firstOf(row, 'untergruppe', 'subgruppe', 'subkategorie'),
    firma: firma || null,
    kontakt: firstOf(row, 'kontakt', 'email', 'telefon', 'webseite', 'website'),
    beschreibung: beschreibung || null,
    vertragsnummer: firstOf(row, 'vertragsnummer', 'vertragnummer', 'nummer'),
    iban: firstOf(row, 'iban'),
    bic: firstOf(row, 'bic'),
    bank: firstOf(row, 'bank'),
    kosten_pro_rate: toNumeric(firstOf(row, 'kosten_pro_rate', 'betrag_pro_rate', 'rate')),
    kosten_monatlich: toNumeric(firstOf(row, 'kosten_monatlich', 'monatlich', 'kosten_monat')),
    kosten_jaehrlich: toNumeric(firstOf(row, 'kosten_jaehrlich', 'jaehrlich', 'kosten_jahr')),
    zahlungsweise: firstOf(row, 'zahlungsweise', 'raten', 'zahlungsintervall'),
    vertrags_datum: toDate(firstOf(row, 'vertrags_datum', 'vertragsdatum')),
    vertrags_beginn: toDate(firstOf(row, 'vertrags_beginn', 'vertragsbeginn', 'beginn')),
    vertrags_ablauf: toDate(firstOf(row, 'vertrags_ablauf', 'vertragsende', 'ablauf', 'ende')),
    kuendigungsfrist: firstOf(row, 'kuendigungsfrist', 'kuendigungs_frist'),
    aktiv: toBoolDefaultTrue(firstOf(row, 'aktiv', 'status')),
    notizen: firstOf(row, 'notizen', 'notiz', 'bemerkung'),
    sync_state: 'geaendert',
    app_modified_at: new Date().toISOString(),
  }
}

function parseCsv(content, delimiterValue) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  return lines.map(line => splitCsvLine(line, delimiterValue))
}

function splitCsvLine(line, delimiterValue) {
  const out = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiterValue && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }

    current += char
  }

  out.push(current)
  return out.map(v => v.trim())
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function toObject(header, row) {
  const obj = {}
  for (let i = 0; i < header.length; i += 1) {
    obj[header[i]] = row[i] ?? ''
  }
  return obj
}

function firstOf(obj, ...keys) {
  for (const key of keys) {
    const value = obj[key]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return null
}

function toNumeric(value) {
  if (!value) return null
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  if (!normalized) return null
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

function toDate(value) {
  if (!value) return null

  const rawValue = String(value).trim()
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (iso.test(rawValue)) return rawValue

  const de = rawValue.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (de) {
    const d = de[1].padStart(2, '0')
    const m = de[2].padStart(2, '0')
    const y = de[3].length === 2 ? `20${de[3]}` : de[3]
    return `${y}-${m}-${d}`
  }

  return null
}

function toBoolDefaultTrue(value) {
  if (!value) return true
  const normalized = String(value).trim().toLowerCase()
  if (['0', 'false', 'nein', 'inaktiv', 'inactive'].includes(normalized)) return false
  return true
}

function Input({ label, value, onChange, placeholder, required }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: T.sp1 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.r2, padding: `${T.sp2} ${T.sp3}` }}
      />
    </label>
  )
}

function updateLocalRow(setRows, id, patch) {
  setRows(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)))
}

function normalizeRow(row) {
  return {
    ...row,
    allowed_users_text: (row.allowed_users || []).join(', '),
  }
}

function parseEmails(value) {
  return value
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
}

function slugify(value) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return base || `owner-${Date.now()}`
}

function cellInputStyle() {
  return {
    width: '100%',
    border: `1px solid ${T.border}`,
    borderRadius: T.r1,
    padding: `${T.sp1} ${T.sp2}`,
  }
}

function actionButtonStyle(kind) {
  if (kind === 'delete') {
    return {
      background: '#fee2e2',
      color: '#991b1b',
      border: 'none',
      borderRadius: T.r1,
      padding: `${T.sp1} ${T.sp2}`,
      cursor: 'pointer',
    }
  }

  return {
    background: T.primary,
    color: T.textOnTeal,
    border: 'none',
    borderRadius: T.r1,
    padding: `${T.sp1} ${T.sp2}`,
    cursor: 'pointer',
  }
}

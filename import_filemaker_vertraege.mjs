import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const filePath = process.argv[2]
const ownerId = process.argv[3]
const delimiter = process.argv[4] || ';'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!filePath || !ownerId) {
  console.error('Usage: node import_filemaker_vertraege.mjs <csvPath> <inhaberId> [delimiter]')
  process.exit(1)
}

if (!url || !key) {
  console.error('Missing env vars. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).')
  process.exit(1)
}

const supabase = createClient(url, key)

const raw = fs.readFileSync(filePath, 'utf8')
const rows = parseCsv(raw, delimiter)
if (rows.length < 2) {
  console.error('CSV has no data rows.')
  process.exit(1)
}

const header = rows[0].map(normalizeHeader)
const dataRows = rows.slice(1)

const payload = []
for (let i = 0; i < dataRows.length; i += 1) {
  const r = toObject(header, dataRows[i])
  const mapped = mapFilemakerRow(r, ownerId, i + 1)
  if (mapped) payload.push(mapped)
}

if (payload.length === 0) {
  console.error('No importable rows found.')
  process.exit(1)
}

const chunkSize = 200
let inserted = 0
for (let i = 0; i < payload.length; i += chunkSize) {
  const chunk = payload.slice(i, i + chunkSize)
  const { error } = await supabase.from('vertraege').upsert(chunk, { onConflict: 'vertrag_id' })
  if (error) {
    console.error('Import error:', error.message)
    process.exit(1)
  }
  inserted += chunk.length
}

console.log(`Imported ${inserted} records for inhaber ${ownerId}.`)

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

function loadDotEnv() {
  const envPath = '.env'
  if (!fs.existsSync(envPath)) return

  const envText = fs.readFileSync(envPath, 'utf8')
  const lines = envText.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

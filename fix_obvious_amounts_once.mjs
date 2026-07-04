import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const APPLY = process.argv.includes('--apply')
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing env vars. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).')
  process.exit(1)
}

const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('vertraege')
  .select('vertrag_id, firma, kosten_pro_rate, kosten_monatlich, kosten_jaehrlich')
  .order('firma', { ascending: true })
  .limit(10000)

if (error) {
  console.error('Load failed:', error.message)
  process.exit(1)
}

const rows = data ?? []
const candidates = []

for (const row of rows) {
  const patch = {}
  const centPattern = getCentPatternPatch(row)

  if (centPattern.kosten_pro_rate !== undefined) patch.kosten_pro_rate = centPattern.kosten_pro_rate
  else if (shouldFix(row.kosten_pro_rate)) patch.kosten_pro_rate = divideBy100(row.kosten_pro_rate)

  if (centPattern.kosten_monatlich !== undefined) patch.kosten_monatlich = centPattern.kosten_monatlich
  else if (shouldFix(row.kosten_monatlich)) patch.kosten_monatlich = divideBy100(row.kosten_monatlich)

  if (centPattern.kosten_jaehrlich !== undefined) patch.kosten_jaehrlich = centPattern.kosten_jaehrlich
  else if (shouldFix(row.kosten_jaehrlich)) patch.kosten_jaehrlich = divideBy100(row.kosten_jaehrlich)

  if (Object.keys(patch).length > 0) {
    candidates.push({
      vertrag_id: row.vertrag_id,
      firma: row.firma,
      before: {
        kosten_pro_rate: row.kosten_pro_rate,
        kosten_monatlich: row.kosten_monatlich,
        kosten_jaehrlich: row.kosten_jaehrlich,
      },
      after: {
        kosten_pro_rate: patch.kosten_pro_rate ?? row.kosten_pro_rate,
        kosten_monatlich: patch.kosten_monatlich ?? row.kosten_monatlich,
        kosten_jaehrlich: patch.kosten_jaehrlich ?? row.kosten_jaehrlich,
      },
      patch,
    })
  }
}

console.log(`Gefundene offensichtliche 100x-Beträge: ${candidates.length}`)
for (const c of candidates) {
  console.log(`- ${c.vertrag_id} | ${c.firma || '—'}`)
  console.log(`  vorher: rate=${fmt(c.before.kosten_pro_rate)} monat=${fmt(c.before.kosten_monatlich)} jahr=${fmt(c.before.kosten_jaehrlich)}`)
  console.log(`  nachher: rate=${fmt(c.after.kosten_pro_rate)} monat=${fmt(c.after.kosten_monatlich)} jahr=${fmt(c.after.kosten_jaehrlich)}`)
}

if (!APPLY) {
  console.log('Dry-run beendet. Mit --apply werden die Korrekturen gespeichert.')
  process.exit(0)
}

let updated = 0
for (const c of candidates) {
  const payload = {
    ...c.patch,
    sync_state: 'geaendert',
    app_modified_at: new Date().toISOString(),
    modified_by: 'archivy-fix',
  }

  const { error: updateError } = await supabase
    .from('vertraege')
    .update(payload)
    .eq('vertrag_id', c.vertrag_id)

  if (updateError) {
    console.error(`Update fehlgeschlagen (${c.vertrag_id}): ${updateError.message}`)
    continue
  }

  updated += 1
}

console.log(`Korrektur abgeschlossen. Aktualisierte Verträge: ${updated}/${candidates.length}`)

function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function shouldFix(value) {
  const n = toNum(value)
  if (n == null) return false
  if (!Number.isInteger(n)) return false
  return Math.abs(n) >= 1_000_000 && Math.abs(n) % 100 === 0
}

function divideBy100(value) {
  const n = toNum(value)
  if (n == null) return value
  return n / 100
}

function fmt(value) {
  const n = toNum(value)
  if (n == null) return '—'
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getCentPatternPatch(row) {
  const r = toNum(row.kosten_pro_rate)
  const m = toNum(row.kosten_monatlich)
  const y = toNum(row.kosten_jaehrlich)

  const rLooksLikeCent = looksLikeCentInt(r)
  const mLooksLikeCent = looksLikeCentInt(m)
  const yLooksLikeCent = looksLikeCentInt(y)

  const patch = {}

  // Strong signal: yearly is exactly 12x monthly/rate and both look like cent-stored ints.
  if (rLooksLikeCent && yLooksLikeCent && y === r * 12) {
    patch.kosten_pro_rate = r / 100
    patch.kosten_jaehrlich = y / 100
  }

  if (mLooksLikeCent && yLooksLikeCent && y === m * 12) {
    patch.kosten_monatlich = m / 100
    patch.kosten_jaehrlich = y / 100
  }

  if (rLooksLikeCent && mLooksLikeCent && r === m) {
    patch.kosten_pro_rate = r / 100
    patch.kosten_monatlich = m / 100
  }

  return patch
}

function looksLikeCentInt(n) {
  return Number.isInteger(n) && Math.abs(n) >= 100_000
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

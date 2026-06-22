import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pjwfrshrhikcubssytfw.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY or URL')
  process.exit(1)
}

const sb = createClient(url, key)

const ids = [
  '16454',
  '16916', '17702', '17747', '17748', '17756', '17917', '17918', '17967',
  '18048', '18312', '18413', '19250', '19281', '19847', '19917', '19918',
]

const { data: exactRows, error: exactError } = await sb
  .from('vorgaenge')
  .select('vorgang_id, vertrag, beschreibung, kurzbeschreibung, vorgang_art, app_modified_at')
  .in('vorgang_id', ids)
  .order('vorgang_id', { ascending: true })

if (exactError) {
  console.error('Exact ID query error:', exactError.message)
  process.exit(1)
}

const rows = exactRows ?? []
const foundSet = new Set(rows.map(r => String(r.vorgang_id)))
const missingIds = ids.filter(id => !foundSet.has(id))

const emptyBeschreibungIds = rows
  .filter(r => !String(r.beschreibung ?? '').trim())
  .map(r => String(r.vorgang_id))

const nonEmptyBeschreibungSamples = rows
  .filter(r => String(r.beschreibung ?? '').trim())
  .map(r => ({
    vorgang_id: String(r.vorgang_id),
    beschreibung: preview(r.beschreibung),
  }))

const { data: recentRowsRaw, error: recentError } = await sb
  .from('vorgaenge')
  .select('vorgang_id, beschreibung, kurzbeschreibung, vorgang_art, app_modified_at')
  .order('app_modified_at', { ascending: false, nullsFirst: false })
  .limit(40)

if (recentError) {
  console.error('Recent query error:', recentError.message)
  process.exit(1)
}

const recentRows = recentRowsRaw ?? []
const recentStats = {
  total: recentRows.length,
  withBeschreibung: recentRows.filter(r => String(r.beschreibung ?? '').trim()).length,
  withoutBeschreibung: recentRows.filter(r => !String(r.beschreibung ?? '').trim()).length,
}

console.log(JSON.stringify({
  checkedIds: ids.length,
  foundIds: rows.length,
  missingIds,
  emptyBeschreibungIds,
  nonEmptyBeschreibungSamples,
  recentStats,
  recentTop10: recentRows.slice(0, 10).map(r => ({
    vorgang_id: String(r.vorgang_id),
    beschreibung: preview(r.beschreibung),
    kurzbeschreibung: preview(r.kurzbeschreibung),
    vorgang_art: preview(r.vorgang_art),
    app_modified_at: r.app_modified_at,
  })),
}, null, 2))

function preview(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  return s.length > 120 ? `${s.slice(0, 120)}...` : s
}

function loadDotEnv() {
  const envPath = '.env'
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

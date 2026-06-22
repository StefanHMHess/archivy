import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing Supabase credentials in env/.env')
  process.exit(1)
}

const sb = createClient(url, key)

const { data, error } = await sb
  .from('vorgaenge')
  .select('vorgang_id,vertrag,beschreibung,kurzbeschreibung,vorgang_art,app_modified_at,vertragsbesitzer_id')
  .order('app_modified_at', { ascending: false, nullsFirst: false })
  .limit(120)

if (error) {
  console.error('Query error:', error.message)
  process.exit(1)
}

const rows = data ?? []
const emptyDesc = rows.filter(r => !String(r.beschreibung ?? '').trim())
const nonEmptyDesc = rows.filter(r => String(r.beschreibung ?? '').trim())

console.log(JSON.stringify({
  total: rows.length,
  withBeschreibung: nonEmptyDesc.length,
  withoutBeschreibung: emptyDesc.length,
  latestFive: rows.slice(0, 5).map(r => ({
    vorgang_id: r.vorgang_id,
    vertrag: r.vertrag,
    beschreibung: preview(r.beschreibung),
    kurzbeschreibung: preview(r.kurzbeschreibung),
    vorgang_art: preview(r.vorgang_art),
    app_modified_at: r.app_modified_at,
  })),
  emptyDescFive: emptyDesc.slice(0, 5).map(r => ({
    vorgang_id: r.vorgang_id,
    vertrag: r.vertrag,
    kurzbeschreibung: preview(r.kurzbeschreibung),
    vorgang_art: preview(r.vorgang_art),
    app_modified_at: r.app_modified_at,
  })),
}, null, 2))

function preview(v) {
  const s = String(v ?? '').trim()
  return s.length > 80 ? `${s.slice(0, 80)}...` : s
}

function loadDotEnv() {
  const envPath = '.env'
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

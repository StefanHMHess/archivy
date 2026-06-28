import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (fs.existsSync('.env')) {
  const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/)
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

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

const { data: contracts, error: cErr } = await sb
  .from('vertraege')
  .select('vertrag_id,firma,beschreibung,vertragsbesitzer_id')
  .or('firma.ilike.%fahrzeug%,firma.ilike.%gothaer%,beschreibung.ilike.%fahrzeug%,beschreibung.ilike.%gothaer%')
  .order('firma', { ascending: true })
  .limit(50)

if (cErr) {
  console.error('vertraege error:', cErr.message)
  process.exit(1)
}

console.log('--- Treffer vertraege ---')
for (const v of contracts || []) {
  console.log(`${v.vertrag_id} | ${v.firma} | owner=${v.vertragsbesitzer_id}`)
}

console.log('\n--- Vorgang-Zuordnung je Vertrag ---')
for (const v of (contracts || []).slice(0, 15)) {
  const { count: byId } = await sb
    .from('vorgaenge')
    .select('vorgang_id', { count: 'exact', head: true })
    .eq('vertrag', v.vertrag_id)

  const name = String(v.firma || '').trim()
  let byName = 0
  if (name) {
    const res = await sb
      .from('vorgaenge')
      .select('vorgang_id', { count: 'exact', head: true })
      .ilike('vertrag', `%${name.replace(/%/g, '')}%`)
    byName = res.count || 0
  }

  console.log(`${v.vertrag_id}: byId=${byId || 0}, byNameLike=${byName}`)
}

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (fs.existsSync('.env')) {
  const envText = fs.readFileSync('.env', 'utf8')
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx <= 0) return
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (!process.env[key]) process.env[key] = value
  })
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const { data, error } = await supabase
  .from('vertraege')
  .select('id, vertrag_id, vertragsnummer, firma, vertragsbesitzer_id')
  .or('firma.ilike.%gothaer%,vertragsnummer.ilike.%11.562%,vertrag_id.ilike.%11.562%')
  .limit(100)

if (error) {
  console.error('ERROR', error.message)
  process.exit(1)
}

console.log(JSON.stringify(data ?? [], null, 2))

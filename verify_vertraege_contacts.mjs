import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pjwfrshrhikcubssytfw.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing Supabase URL/key in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const { count, error: countError } = await supabase
  .from('vertraege')
  .select('vertrag_id', { count: 'exact', head: true })

if (countError) {
  console.error('ERR_COUNT', countError.message)
  process.exit(1)
}

console.log('VERTRAEGE_COUNT', count ?? 0)

const { data, error } = await supabase
  .from('vertraege')
  .select('vertrag_id,firma,telefon,mobil,fax,email,webseite,kontakt')
  .order('vertrag_id', { ascending: true })
  .limit(10)

if (error) {
  console.error('ERR_DATA', error.message)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))

const rowsWithDirectContact = (data ?? []).filter(r => r.telefon || r.mobil || r.fax || r.email || r.webseite).length
console.log('ROWS_WITH_DIRECT_CONTACT_FIELDS', rowsWithDirectContact)

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
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

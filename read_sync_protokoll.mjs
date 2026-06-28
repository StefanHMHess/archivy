import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing Supabase env vars.')
  process.exit(1)
}

const sb = createClient(url, key)

const ack = process.argv.includes('--ack')

const { data, error } = await sb
  .from('sync_protokoll')
  .select('id,created_at,script_name,script_version,owner_id,status,ok_count,skip_count,error_count,needs_review,result_text,error_text')
  .eq('needs_review', true)
  .order('id', { ascending: false })
  .limit(30)

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

console.log(JSON.stringify(data ?? [], null, 2))

if (ack && (data?.length || 0) > 0) {
  const ids = data.map(r => r.id)
  const { error: updErr } = await sb
    .from('sync_protokoll')
    .update({
      needs_review: false,
      reviewed_at: new Date().toISOString(),
      reviewed_by: 'copilot-read-sync-protokoll',
    })
    .in('id', ids)

  if (updErr) {
    console.error('Ack failed:', updErr.message)
    process.exit(1)
  }

  console.log(`Acknowledged ${ids.length} log entries.`)
}

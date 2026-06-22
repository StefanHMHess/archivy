import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

loadDotEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pjwfrshrhikcubssytfw.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqd2Zyc2hyaGlrY3Vic3N5dGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTk1MjMsImV4cCI6MjA5NzI3NTUyM30.Nhv5yK1RkDYtwJc-A4zB7b1OJCNgZK89Y2kpyaenXM4'

const supabase = createClient(url, key)

const likePattern = 'vertrag-kontakt-%'

async function countRefs() {
  const { count, error } = await supabase
    .from('vertraege')
    .select('vertrag_id', { count: 'exact', head: true })
    .like('kontakt_adresse_id', likePattern)
  if (error) throw new Error(`Count vertraege failed: ${error.message}`)
  return count ?? 0
}

async function countAddrs() {
  const { count, error } = await supabase
    .from('adressen')
    .select('adresse_id', { count: 'exact', head: true })
    .like('adresse_id', likePattern)
  if (error) throw new Error(`Count adressen failed: ${error.message}`)
  return count ?? 0
}

async function run() {
  const beforeRefs = await countRefs()
  const beforeAddrs = await countAddrs()

  const { data: refsRows, error: refsErr } = await supabase
    .from('vertraege')
    .select('vertrag_id')
    .like('kontakt_adresse_id', likePattern)
    .limit(5000)
  if (refsErr) throw new Error(`Fetch refs failed: ${refsErr.message}`)

  let updated = 0
  for (const row of refsRows ?? []) {
    const { error } = await supabase
      .from('vertraege')
      .update({ kontakt_adresse_id: null, sync_state: 'geaendert' })
      .eq('vertrag_id', row.vertrag_id)
    if (error) throw new Error(`Update vertrag ${row.vertrag_id} failed: ${error.message}`)
    updated += 1
  }

  const { error: delErr, count: deleted } = await supabase
    .from('adressen')
    .delete({ count: 'exact' })
    .like('adresse_id', likePattern)
  if (delErr) throw new Error(`Delete adressen failed: ${delErr.message}`)

  const afterRefs = await countRefs()
  const afterAddrs = await countAddrs()

  console.log(JSON.stringify({
    auth: key.includes('service') ? 'service-like-key' : 'anon-or-env-key',
    before: { refs: beforeRefs, addrs: beforeAddrs },
    changed: { updatedVertraege: updated, deletedAdressen: deleted ?? 0 },
    after: { refs: afterRefs, addrs: afterAddrs },
  }, null, 2))
}

run().catch(err => {
  console.error(err.message)
  process.exit(1)
})

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

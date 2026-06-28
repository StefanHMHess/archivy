#!/usr/bin/env node
/**
 * Zeige alle Verträge mit verschiedenen Filter-Versuchen
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envPath = '.env'
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx)
        const value = trimmed.substring(eqIdx + 1)
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ Missing env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  console.log('🔍 Alle Verträge (ohne Filter):\n')

  const { data, error } = await supabase
    .from('vertraege')
    .select('vertrag_id, firma, vertragsbesitzer_id')

  if (error) {
    console.error('Fehler:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log('❌ Keine Verträge gefunden')
    return
  }

  console.log(`Gesamt: ${data.length} Verträge\n`)

  // Group by vertragsbesitzer_id
  const byOwner = {}
  data.forEach(v => {
    const owner = v.vertragsbesitzer_id || 'NULL'
    if (!byOwner[owner]) byOwner[owner] = []
    byOwner[owner].push(v)
  })

  Object.entries(byOwner).forEach(([owner, vertraege]) => {
    console.log(`Besitzer: "${owner}" (${vertraege.length} Verträge)`)
    vertraege.slice(0, 3).forEach(v => {
      console.log(`  - ${v.firma || v.vertrag_id}`)
    })
    if (vertraege.length > 3) {
      console.log(`  ... und ${vertraege.length - 3} weitere`)
    }
    console.log()
  })
}

main().catch(err => {
  console.error('❌ Fehler:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Zeige Beispiel-Verträge und deren vertragsbesitzer_id
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
  console.log('📋 Sample Verträge:\n')

  const { data: vertraege, error } = await supabase
    .from('vertraege')
    .select('vertrag_id, firma, vertragsbesitzer_id')
    .limit(10)

  if (error) {
    console.error('Fehler:', error.message)
    return
  }

  if (!vertraege || vertraege.length === 0) {
    console.log('❌ Keine Verträge gefunden')
    return
  }

  console.log(`Gefunden: ${vertraege.length} Verträge\n`)

  vertraege.forEach((v, idx) => {
    console.log(`${idx + 1}. ${v.firma || v.vertrag_id}`)
    console.log(`   ID: ${v.vertrag_id}`)
    console.log(`   Besitzer: "${v.vertragsbesitzer_id || 'NULL'}"`)
    console.log()
  })

  // Get distinct owner IDs
  console.log('📊 Alle unterschiedlichen vertragsbesitzer_id-Werte:')
  const allOwnerIds = new Set(vertraege.map(v => v.vertragsbesitzer_id).filter(Boolean))
  console.log(Array.from(allOwnerIds).join(', ') || 'Keine (alle NULL)')
}

main().catch(err => {
  console.error('Fehler:', err.message)
  process.exit(1)
})

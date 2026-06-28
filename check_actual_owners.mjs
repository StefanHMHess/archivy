#!/usr/bin/env node
/**
 * Zeige alle vorhandenen vertragsbesitzer_id-Werte in vertraege und vorgaenge
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

async function getDistinctOwners(table) {
  const { data, error } = await supabase
    .from(table)
    .select('vertragsbesitzer_id')
  
  if (error) {
    console.error(`Fehler bei ${table}:`, error.message)
    return []
  }

  const ids = [...new Set(data.map(row => row.vertragsbesitzer_id).filter(Boolean))]
  return ids.sort()
}

async function main() {
  console.log('🔍 Alle vertragsbesitzer_id-Werte in der Datenbank:\n')

  const vertraegeOwners = await getDistinctOwners('vertraege')
  const vorgaengeOwners = await getDistinctOwners('vorgaenge')
  
  const allOwners = [...new Set([...vertraegeOwners, ...vorgaengeOwners])]

  console.log(`Unique Owner-IDs: ${allOwners.join(', ')}\n`)

  console.log('📋 Verträge pro Besitzer:')
  for (const ownerId of allOwners) {
    const { count } = await supabase
      .from('vertraege')
      .select('*', { count: 'exact', head: true })
      .eq('vertragsbesitzer_id', ownerId)
    console.log(`  "${ownerId}": ${count || 0}`)
  }

  console.log('\n📝 Vorgänge pro Besitzer:')
  for (const ownerId of allOwners) {
    const { count } = await supabase
      .from('vorgaenge')
      .select('*', { count: 'exact', head: true })
      .eq('vertragsbesitzer_id', ownerId)
    console.log(`  "${ownerId}": ${count || 0}`)
  }
}

main().catch(err => {
  console.error('Fehler:', err.message)
  process.exit(1)
})

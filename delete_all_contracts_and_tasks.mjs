#!/usr/bin/env node
/**
 * Lösche alle Verträge und Vorgänge aus der Datenbank
 * WARNUNG: Dies ist irreversibel! Backup wird nicht automatisch erstellt.
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
  console.log('🗑️  LÖSCHE alle Verträge und Vorgänge\n')

  // Get counts before deletion
  const { count: vCount } = await supabase
    .from('vertraege')
    .select('*', { count: 'exact', head: true })

  const { count: voCount } = await supabase
    .from('vorgaenge')
    .select('*', { count: 'exact', head: true })

  console.log(`Zu löschen:`)
  console.log(`  📋 ${vCount || 0} Verträge`)
  console.log(`  📝 ${voCount || 0} Vorgänge`)
  console.log(`  Gesamt: ${(vCount || 0) + (voCount || 0)} Datensätze\n`)

  if ((vCount || 0) + (voCount || 0) === 0) {
    console.log('✓ Datenbank ist bereits leer.')
    return
  }

  console.log('⚠️  ACHTUNG: Dies ist irreversibel!')
  console.log('Wenn du fortfahren möchtest, führe aus:\n')
  console.log('node delete_all_contracts_and_tasks.mjs --confirm\n')
  process.exit(0)
}

if (process.argv[2] === '--confirm') {
  console.log('💥 Lösche Vorgänge...')
  supabase.from('vorgaenge').delete().gte('vorgang_id', '').then(({ error }) => {
    if (error) console.error('Fehler beim Löschen von Vorgängen:', error.message)
    else console.log('✓ Vorgänge gelöscht')
  }).then(() => {
    console.log('💥 Lösche Verträge...')
    return supabase.from('vertraege').delete().gte('vertrag_id', '')
  }).then(({ error }) => {
    if (error) console.error('Fehler beim Löschen von Verträgen:', error.message)
    else console.log('✓ Verträge gelöscht')
    console.log('\n✅ Datenbank gelöscht. Bereit für Neuimport.')
  }).catch(err => {
    console.error('❌ Fehler:', err.message)
    process.exit(1)
  })
} else {
  main().catch(err => {
    console.error('❌ Fehler:', err.message)
    process.exit(1)
  })
}

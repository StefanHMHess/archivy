#!/usr/bin/env node
/**
 * Migriere Verträge/Vorgänge von einer vertragsbesitzer_id zu einer anderen
 * Usage: node migrate_owner.mjs <from_owner_id> <to_owner_id>
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

const fromOwnerId = process.argv[2]
const toOwnerId = process.argv[3]

if (!fromOwnerId || !toOwnerId) {
  console.error('Usage: node migrate_owner.mjs <from_owner_id> <to_owner_id>')
  console.error('Example: node migrate_owner.mjs stefan nicole')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  console.log(`🔄 Migriere Datensätze von "${fromOwnerId}" nach "${toOwnerId}"\n`)

  // Count verträge
  const { count: vCount } = await supabase
    .from('vertraege')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)

  console.log(`📋 Verträge zu migrieren: ${vCount || 0}`)

  // Count vorgänge
  const { count: voCount } = await supabase
    .from('vorgaenge')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)

  console.log(`📝 Vorgänge zu migrieren: ${voCount || 0}`)

  if ((vCount || 0) === 0 && (voCount || 0) === 0) {
    console.log('\n⚠️ Keine Datensätze zum Migrieren gefunden.')
    return
  }

  console.log('\n🔧 Starte Migration...\n')

  // Migrate verträge
  if ((vCount || 0) > 0) {
    console.log(`  Aktualisiere ${vCount} Verträge...`)
    const { error: vError } = await supabase
      .from('vertraege')
      .update({ 
        vertragsbesitzer_id: toOwnerId,
        app_modified_at: new Date().toISOString(),
        sync_state: 'geaendert'
      })
      .eq('vertragsbesitzer_id', fromOwnerId)

    if (vError) {
      console.error(`  ❌ Fehler: ${vError.message}`)
      process.exit(1)
    }
    console.log(`  ✓ Verträge aktualisiert`)
  }

  // Migrate vorgänge
  if ((voCount || 0) > 0) {
    console.log(`  Aktualisiere ${voCount} Vorgänge...`)
    const { error: voError } = await supabase
      .from('vorgaenge')
      .update({ 
        vertragsbesitzer_id: toOwnerId,
        app_modified_at: new Date().toISOString(),
        sync_state: 'geaendert'
      })
      .eq('vertragsbesitzer_id', fromOwnerId)

    if (voError) {
      console.error(`  ❌ Fehler: ${voError.message}`)
      process.exit(1)
    }
    console.log(`  ✓ Vorgänge aktualisiert`)
  }

  console.log(`\n✅ Migration erfolgreich!`)
  console.log(`   ${(vCount || 0) + (voCount || 0)} Datensätze von "${fromOwnerId}" nach "${toOwnerId}" verschoben.`)
}

main().catch(err => {
  console.error('❌ Fehler:', err.message)
  process.exit(1)
})

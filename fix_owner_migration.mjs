#!/usr/bin/env node
/**
 * Fix: Verschiebe Verträge und Vorgänge von falschen zu richtigen Inhabern
 * Usage: node fix_owner_migration.mjs <from_owner_id> <to_owner_id>
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Load env
const envPath = '.env'
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...parts] = trimmed.split('=')
      if (key && parts.length > 0) {
        const value = parts.join('=')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ Missing env vars: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const fromOwnerId = process.argv[2]
const toOwnerId = process.argv[3]

if (!fromOwnerId || !toOwnerId) {
  console.error('Usage: node fix_owner_migration.mjs <from_owner_id> <to_owner_id>')
  console.error('Example: node fix_owner_migration.mjs stefan nicole')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  console.log(`🔄 Migriere Verträge und Vorgänge von "${fromOwnerId}" nach "${toOwnerId}"`)
  console.log()

  // Verify both owners exist
  const { data: owners } = await supabase
    .from('vertragsbesitzer')
    .select('id, name')

  const fromOwner = owners?.find(o => o.id === fromOwnerId)
  const toOwner = owners?.find(o => o.id === toOwnerId)

  if (!fromOwner) {
    console.error(`❌ Inhaber "${fromOwnerId}" existiert nicht`)
    process.exit(1)
  }
  if (!toOwner) {
    console.error(`❌ Ziel-Inhaber "${toOwnerId}" existiert nicht`)
    process.exit(1)
  }

  console.log(`✓ Quelle: ${fromOwner.name} (${fromOwnerId})`)
  console.log(`✓ Ziel: ${toOwner.name} (${toOwnerId})`)
  console.log()

  // Count verträge to migrate
  const { count: vCount } = await supabase
    .from('vertraege')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)

  console.log(`📋 ${vCount} Verträge zu migrieren`)

  // Count vorgänge to migrate
  const { count: voCount } = await supabase
    .from('vorgaenge')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)

  console.log(`📝 ${voCount} Vorgänge zu migrieren`)
  console.log()

  if (vCount === 0 && voCount === 0) {
    console.log('⚠️  Keine Datensätze zum Migrieren gefunden.')
    process.exit(0)
  }

  // Migrate verträge
  if (vCount > 0) {
    console.log(`🔄 Migriere Verträge...`)
    const { error: vError } = await supabase
      .from('vertraege')
      .update({ 
        vertragsbesitzer_id: toOwnerId,
        app_modified_at: new Date().toISOString(),
        sync_state: 'geaendert'
      })
      .eq('vertragsbesitzer_id', fromOwnerId)

    if (vError) {
      console.error(`❌ Fehler beim Migrieren von Verträgen: ${vError.message}`)
      process.exit(1)
    }
    console.log(`✓ ${vCount} Verträge migriert`)
  }

  // Migrate vorgänge
  if (voCount > 0) {
    console.log(`🔄 Migriere Vorgänge...`)
    const { error: voError } = await supabase
      .from('vorgaenge')
      .update({ 
        vertragsbesitzer_id: toOwnerId,
        app_modified_at: new Date().toISOString(),
        sync_state: 'geaendert'
      })
      .eq('vertragsbesitzer_id', fromOwnerId)

    if (voError) {
      console.error(`❌ Fehler beim Migrieren von Vorgängen: ${voError.message}`)
      process.exit(1)
    }
    console.log(`✓ ${voCount} Vorgänge migriert`)
  }

  console.log()
  console.log(`✅ Migration erfolgreich abgeschlossen!`)
  console.log(`   ${vCount + voCount} Datensätze von "${fromOwnerId}" nach "${toOwnerId}" verschoben.`)
}

main().catch(err => {
  console.error('❌ Fehler:', err.message)
  process.exit(1)
})

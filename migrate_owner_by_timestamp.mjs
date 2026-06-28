#!/usr/bin/env node
/**
 * Selektive Migration: Verschiebe nur die neuen Verträge/Vorgänge von Stefan zu Nicole
 * Verträge älter als der Cutoff-Zeitpunkt bleiben bei Stefan
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

const cutoffTime = process.argv[2] || '2026-06-22T19:35:00'
const fromOwnerId = 'stefan'
const toOwnerId = 'nicole'

const supabase = createClient(url, key)

async function main() {
  console.log(`🔄 Selektive Migration nach Zeitstempel`)
  console.log(`   Quelle: "${fromOwnerId}"`)
  console.log(`   Ziel: "${toOwnerId}"`)
  console.log(`   Cutoff: ${cutoffTime}`)
  console.log(`   (Verträge NACH diesem Zeitpunkt werden migriert)\n`)

  // Count verträge to migrate (after cutoff)
  const { count: vCount } = await supabase
    .from('vertraege')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)
    .gt('app_modified_at', cutoffTime)

  console.log(`📋 Verträge zu migrieren: ${vCount || 0}`)

  // Count verträge that stay (before cutoff)
  const { count: vStay } = await supabase
    .from('vertraege')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)
    .lte('app_modified_at', cutoffTime)

  console.log(`📋 Verträge bleiben bei Stefan: ${vStay || 0}`)

  // Count vorgänge to migrate
  const { count: voCount } = await supabase
    .from('vorgaenge')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)
    .gt('app_modified_at', cutoffTime)

  console.log(`📝 Vorgänge zu migrieren: ${voCount || 0}`)

  // Count vorgänge that stay
  const { count: voStay } = await supabase
    .from('vorgaenge')
    .select('*', { count: 'exact', head: true })
    .eq('vertragsbesitzer_id', fromOwnerId)
    .lte('app_modified_at', cutoffTime)

  console.log(`📝 Vorgänge bleiben bei Stefan: ${voStay || 0}`)

  const totalMigrate = (vCount || 0) + (voCount || 0)
  const totalStay = (vStay || 0) + (voStay || 0)

  if (totalMigrate === 0) {
    console.log('\n⚠️ Keine Datensätze zum Migrieren gefunden.')
    return
  }

  console.log(`\n📊 Zusammenfassung:`)
  console.log(`   → ${totalMigrate} Datensätze migrieren`)
  console.log(`   ← ${totalStay} Datensätze bleiben bei Stefan`)

  console.log(`\n🔧 Starte Migration...\n`)

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
      .gt('app_modified_at', cutoffTime)

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
      .gt('app_modified_at', cutoffTime)

    if (voError) {
      console.error(`  ❌ Fehler: ${voError.message}`)
      process.exit(1)
    }
    console.log(`  ✓ Vorgänge aktualisiert`)
  }

  console.log(`\n✅ Migration erfolgreich!`)
  console.log(`   ${totalMigrate} Datensätze von "${fromOwnerId}" nach "${toOwnerId}" verschoben`)
  console.log(`   ${totalStay} Datensätze bleiben bei "${fromOwnerId}"`)
}

main().catch(err => {
  console.error('❌ Fehler:', err.message)
  process.exit(1)
})

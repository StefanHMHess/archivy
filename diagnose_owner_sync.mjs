#!/usr/bin/env node
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Load env
const envPath = '.env'
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value && !process.env[key]) {
      process.env[key] = value.trim()
    }
  })
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing env vars. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, key)

async function main() {
  console.log('📊 Diagnostiziere Verträge und Vorgänge nach Besitzer...\n')

  // Get all owners
  const { data: owners, error: ownerError } = await supabase
    .from('vertragsbesitzer')
    .select('id, name, display_name')
    .order('name')

  if (ownerError) {
    console.error('❌ Fehler beim Laden der Inhaber:', ownerError.message)
    process.exit(1)
  }

  console.log(`Inhaber in der Datenbank: ${owners.length}\n`)

  for (const owner of owners) {
    console.log(`\n📋 ${owner.display_name || owner.name} (${owner.id}):`)
    
    // Count verträge
    const { data: vertraege, error: vError } = await supabase
      .from('vertraege')
      .select('vertrag_id, firma')
      .eq('vertragsbesitzer_id', owner.id)
      .limit(5)

    if (vError) {
      console.error(`  ❌ Fehler beim Laden von Verträgen: ${vError.message}`)
    } else {
      const { count: vCount } = await supabase
        .from('vertraege')
        .select('*', { count: 'exact', head: true })
        .eq('vertragsbesitzer_id', owner.id)
      
      console.log(`  Verträge: ${vCount}`)
      if (vertraege.length > 0) {
        vertraege.forEach(v => {
          console.log(`    - ${v.firma || v.vertrag_id}`)
        })
      }
    }

    // Count vorgänge
    const { data: vorgaenge, error: voError } = await supabase
      .from('vorgaenge')
      .select('vorgang_id, kurzbeschreibung, vertrag')
      .eq('vertragsbesitzer_id', owner.id)
      .limit(5)

    if (voError) {
      console.error(`  ❌ Fehler beim Laden von Vorgängen: ${voError.message}`)
    } else {
      const { count: voCount } = await supabase
        .from('vorgaenge')
        .select('*', { count: 'exact', head: true })
        .eq('vertragsbesitzer_id', owner.id)
      
      console.log(`  Vorgänge: ${voCount}`)
      if (vorgaenge.length > 0) {
        vorgaenge.forEach(v => {
          console.log(`    - ${v.kurzbeschreibung || v.vorgang_id} (Vertrag: ${v.vertrag || 'keine'})`)
        })
      }
    }
  }

  console.log('\n\n🔍 Verträge mit fehlender/unbekannter vertragsbesitzer_id:')
  const { data: orphaned } = await supabase
    .from('vertraege')
    .select('vertrag_id, firma, vertragsbesitzer_id')
    .is('vertragsbesitzer_id', null)
    .limit(10)

  if (orphaned && orphaned.length > 0) {
    orphaned.forEach(v => {
      console.log(`  - ${v.firma || v.vertrag_id} (vertragsbesitzer_id: null)`)
    })
  } else {
    console.log('  Keine Verträge mit NULL vertragsbesitzer_id gefunden.')
  }
}

main().catch(err => {
  console.error('Fehler:', err)
  process.exit(1)
})

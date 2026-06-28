#!/usr/bin/env node
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envPath = '.env'
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...parts] = trimmed.split('=')
      if (key && parts.length > 0) {
        process.env[key] = parts.join('=')
      }
    }
  })
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const supabase = createClient(url, key)

async function main() {
  console.log('📊 Verfügbare Inhaber in der Datenbank:\n')

  const { data: owners, error } = await supabase
    .from('vertragsbesitzer')
    .select('id, name, display_name')
    .order('name')

  if (error) {
    console.error('Fehler:', error.message)
    return
  }

  if (!owners || owners.length === 0) {
    console.log('❌ Keine Inhaber gefunden')
    return
  }

  owners.forEach(o => {
    console.log(`  ID: "${o.id}" → ${o.display_name || o.name}`)
  })

  console.log('\n📋 Verträge nach Besitzer:')
  for (const owner of owners) {
    const { count } = await supabase
      .from('vertraege')
      .select('*', { count: 'exact', head: true })
      .eq('vertragsbesitzer_id', owner.id)
    console.log(`  ${owner.id}: ${count || 0} Verträge`)
  }

  console.log('\n📝 Vorgänge nach Besitzer:')
  for (const owner of owners) {
    const { count } = await supabase
      .from('vorgaenge')
      .select('*', { count: 'exact', head: true })
      .eq('vertragsbesitzer_id', owner.id)
    console.log(`  ${owner.id}: ${count || 0} Vorgänge`)
  }
}

main().catch(console.error)

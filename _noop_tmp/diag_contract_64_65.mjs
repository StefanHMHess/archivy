import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (fs.existsSync('.env')) {
  const envText = fs.readFileSync('.env', 'utf8')
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx <= 0) return
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (!process.env[key]) process.env[key] = value
  })
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

function norm(value) {
  return String(value ?? '').trim().toLowerCase()
}

function compact(value) {
  return norm(value).replace(/[^a-z0-9]/g, '')
}

const ids = ['64', '65']

for (const id of ids) {
  const { data: contract, error: cErr } = await supabase
    .from('vertraege')
    .select('*')
    .eq('vertrag_id', id)
    .maybeSingle()

  console.log(`\n=== CONTRACT_ID=${id} ===`)
  if (cErr) {
    console.log('CONTRACT_ERROR', cErr.message)
    continue
  }
  if (!contract) {
    console.log('NOT_FOUND')
    continue
  }

  console.log(JSON.stringify({
    id: contract.id,
    vertrag_id: contract.vertrag_id,
    vertragsnummer: contract.vertragsnummer,
    firma: contract.firma,
    owner: contract.vertragsbesitzer_id,
  }, null, 2))

  const needles = [contract.vertrag_id, contract.vertragsnummer, contract.firma]
  console.log('NEEDLES', JSON.stringify(needles))
  console.log('COMPACT', JSON.stringify(needles.map(compact)))

  const { data: rows, error: vErr } = await supabase
    .from('vorgaenge')
    .select('vorgang_id, vertrag, kurzbeschreibung, datum, datei_pfad, vertragsbesitzer_id')
    .order('datum', { ascending: true })
    .limit(5000)

  if (vErr) {
    console.log('VORGANG_ERROR', vErr.message)
    continue
  }

  const exact = []
  const compactExact = []
  const fuzzy = []
  const ownerOnly = []
  const needleNorms = needles.map(norm).filter(Boolean)
  const needleCompacts = needles.map(compact).filter(Boolean)

  for (const row of rows ?? []) {
    const rowNorm = norm(row.vertrag)
    const rowCompact = compact(row.vertrag)
    const hitExact = needleNorms.includes(rowNorm)
    const hitCompact = rowCompact && needleCompacts.includes(rowCompact)
    const hitFuzzy = rowCompact && needleCompacts.some((n) => n.length >= 6 && (rowCompact.includes(n) || n.includes(rowCompact)))
    const hitOwner = row.vertragsbesitzer_id === contract.vertragsbesitzer_id

    if (hitExact) exact.push(row)
    else if (hitCompact) compactExact.push(row)
    else if (hitFuzzy) fuzzy.push(row)
    else if (hitOwner) ownerOnly.push(row)
  }

  const summarize = (label, list) => {
    console.log(`\n${label}=${list.length}`)
    for (const row of list.slice(0, 12)) {
      console.log(JSON.stringify({
        vorgang_id: row.vorgang_id,
        vertrag: row.vertrag,
        owner: row.vertragsbesitzer_id,
        datum: row.datum,
        datei_pfad: row.datei_pfad,
      }))
    }
  }

  summarize('EXACT', exact)
  summarize('COMPACT', compactExact)
  summarize('FUZZY', fuzzy)
  summarize('OWNER_ONLY', ownerOnly)
}

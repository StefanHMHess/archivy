import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Supabase-Zugangsdaten fehlen. Bitte .env-Datei prüfen (VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY).')
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

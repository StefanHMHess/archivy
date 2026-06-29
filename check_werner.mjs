import { createClient } from '@supabase/supabase-js'

const url = 'https://vxuepkxmnshaxktxwqlx.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dWVwa3htbnNoYXhrdHh3cWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwMTk4OTAsImV4cCI6MTg5NDc4NzQ5MH0.mEvXz_8J4gWXpGgwVcQvVUSh8e3vgP72K5eEuKJk3L4'

const sb = createClient(url, key)

const { data, error } = await sb
  .from('vorgaenge')
  .select('id, vorgang_id, vertragsbesitzer_id, beschreibung, kurzbeschreibung, vorgang_art')
  .eq('vertragsbesitzer_id', 'werner')
  .limit(5)

console.log('Werner vorgaenge:', JSON.stringify({ count: data?.length, data, error }, null, 2))

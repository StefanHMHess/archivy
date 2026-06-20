import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pjwfrshrhikcubssytfw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqd2Zyc2hyaGlrY3Vic3N5dGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTk1MjMsImV4cCI6MjA5NzI3NTUyM30.Nhv5yK1RkDYtwJc-A4zB7b1OJCNgZK89Y2kpyaenXM4'
)

const { data, error } = await supabase.from('vorgaenge').insert([
  {
    vorgang_id: 'TEST-001',
    vorgang_art: 'Inspektion',
    kurzbeschreibung: 'Test-Vorgang für PDF-Feature',
    beschreibung: 'Das ist ein Test-Vorgang um die PDF-Upload und Anzeige zu testen.',
    bvh: 'BVH-2024-001',
    ba: 'BA-001',
    frist: '2026-12-31',
    verantwortlicher: 'Stefan',
    ersteller: 'System',
    sync_state: 'synchronisiert',
    created_at: new Date().toISOString(),
    erstellt: new Date().toISOString(),
  }
])

if (error) {
  console.error('Error:', error.message)
} else {
  console.log('Vorgang inserted:', data)
}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://pjwfrshrhikcubssytfw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqd2Zyc2hyaGlrY3Vic3N5dGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTk1MjMsImV4cCI6MjA5NzI3NTUyM30.Nhv5yK1RkDYtwJc-A4zB7b1OJCNgZK89Y2kpyaenXM4'
);
const { data, error } = await sb.from('vorgaenge')
  .select('vorgang_id,vertrag,vertragsbesitzer_id')
  .order('vorgang_id', { ascending: false })
  .limit(15);
if (error) { console.log('ERROR', error.message); process.exit(1); }
data.forEach(r => console.log(
  String(r.vorgang_id).padStart(6),
  (r.vertrag || '').substring(0, 25).padEnd(26),
  r.vertragsbesitzer_id
));

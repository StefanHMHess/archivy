import fs from 'node:fs'

loadDotEnv()

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || ''

let role = 'unknown'
try {
  const payload = key.split('.')[1]
  if (payload) {
    role = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role || 'unknown'
  }
} catch {
  role = 'invalid'
}

console.log('KEY_ROLE', role)

function loadDotEnv() {
  const envPath = '.env'
  if (!fs.existsSync(envPath)) return

  const envText = fs.readFileSync(envPath, 'utf8')
  const lines = envText.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

import { supabase } from './supabase'

function safeDecode(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export function normalizeStoragePath(bucket, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim().replace(/^"|"$/g, '')
  if (!trimmed) return null

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      const path = safeDecode(url.pathname || '')
      const match = path.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/)
      if (match) {
        const [, foundBucket, objectPath] = match
        if (!bucket || foundBucket === bucket) return objectPath
      }
      // For non-storage URLs, keep the absolute URL as fallback.
      return trimmed
    } catch {
      return trimmed
    }
  }

  let normalized = safeDecode(trimmed)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')

  if (normalized.includes('?')) {
    normalized = normalized.split('?')[0]
  }

  if (bucket && normalized.startsWith(`${bucket}/`)) {
    normalized = normalized.slice(bucket.length + 1)
  }
  return normalized || null
}

export async function uploadFile(bucket, file, path) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const normalizedPath = normalizeStoragePath(bucket, path)
  if (!normalizedPath) return null

  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    return normalizedPath
  }

  const candidates = Array.from(new Set([
    normalizedPath,
    normalizedPath.replace(/%2F/gi, '/'),
    normalizedPath.replace(/\+/g, ' '),
    normalizedPath.replace(/\s+/g, ' '),
  ].filter(Boolean)))

  for (const candidate of candidates) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(candidate, expiresIn)

    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(normalizedPath)

  return publicData?.publicUrl || null
}

export async function deleteFile(bucket, path) {
  const normalizedPath = normalizeStoragePath(bucket, path)
  if (!normalizedPath) return
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) return

  const { error } = await supabase.storage.from(bucket).remove([normalizedPath])
  if (error) console.error(`Delete failed: ${error.message}`)
}

export function getFileName(path) {
  if (!path) return null
  return path.split('/').pop()
}

export function optimizeImageUrl(url, { width = 256, quality = 65, format = 'webp' } = {}) {
  if (!url || typeof url !== 'string') return url
  const trimmed = url.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return trimmed

  const sep = trimmed.includes('?') ? '&' : '?'
  const params = `width=${width}&quality=${quality}&format=${format}`
  return `${trimmed}${sep}${params}`
}

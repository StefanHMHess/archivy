import { supabase } from './supabase'

export async function uploadFile(bucket, file, path) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error) {
    console.error(`Failed to get signed URL: ${error.message}`)
    return null
  }
  return data.signedUrl
}

export async function deleteFile(bucket, path) {
  if (!path) return

  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.error(`Delete failed: ${error.message}`)
}

export function getFileName(path) {
  if (!path) return null
  return path.split('/').pop()
}

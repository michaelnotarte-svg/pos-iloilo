// Client helpers for the "pull receipts from Google Drive" import path.
// The Drive service-account auth + folder read happen server-side in
// /api/drive-pull; here we just list, download, and downscale for parsing.
import { downscaleSrc } from './parseReceipt'

async function drive(action, extra = {}) {
  const res = await fetch('/api/drive-pull', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
  const json = await res.json().catch(() => ({ error: 'Bad response from Drive endpoint' }))
  if (!res.ok) throw new Error(json.error || `Drive endpoint returned ${res.status}`)
  return json
}

/** List image files currently in the shared dump folder. */
export async function listDriveReceipts() {
  const { files } = await drive('list')
  return files || []
}

/** The shared folder's web URL (for the phone QR code). */
export async function getDriveFolder() {
  return drive('folder') // { folderId, folderUrl }
}

/**
 * Download one Drive image and downscale it (same pipeline as local uploads).
 * Returns { dataUrl, base64, media_type }.
 */
export async function fetchDriveReceipt(fileId) {
  const { base64, media_type } = await drive('download', { fileId })
  return downscaleSrc(`data:${media_type};base64,${base64}`)
}

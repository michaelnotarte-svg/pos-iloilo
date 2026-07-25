// Google Drive pull — shared core. Authenticates a service account (no external
// deps: we mint the JWT with node:crypto and exchange it for an access token),
// lists images in the dump folder, and downloads a file's bytes as base64.
//
// Reads from env: GOOGLE_SA_KEY (the SA JSON, raw or base64-encoded),
// GDRIVE_FOLDER_ID (the shared dump folder). The SA needs Viewer on that folder.
import crypto from 'node:crypto'

function parseServiceAccount(raw) {
  if (!raw) throw new Error('GOOGLE_SA_KEY is not set')
  const tryJson = (s) => { try { return JSON.parse(s) } catch { return null } }
  return tryJson(raw) || tryJson(Buffer.from(raw, 'base64').toString('utf8')) ||
    (() => { throw new Error('GOOGLE_SA_KEY is not valid JSON or base64-JSON') })()
}

const b64u = (b) => Buffer.from(b).toString('base64url')

export async function getAccessToken(rawKey) {
  const sa = parseServiceAccount(rawKey)
  const now = Math.floor(Date.now() / 1000)
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }))
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`)
    .sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google token error: ${JSON.stringify(json)}`)
  return json.access_token
}

/** List image files in the folder, oldest-first (createdTime order). */
export async function listImages(token, folderId) {
  const params = new URLSearchParams({
    q: `"${folderId}" in parents and trashed=false`,
    fields: 'files(id,name,mimeType,size,createdTime)',
    orderBy: 'createdTime',
    pageSize: '1000',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (json.error) throw new Error(`Drive list error: ${json.error.message}`)
  return (json.files || [])
    .filter((f) => (f.mimeType || '').startsWith('image/'))
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: Number(f.size) || 0, createdTime: f.createdTime }))
}

/** Download one file's bytes, returned as base64 + media_type. */
export async function downloadImage(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive download ${res.status}`)
  const media_type = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return { base64: buf.toString('base64'), media_type }
}

/** Handle a {action} request body. Returns { ok, status, json }. */
export async function driveRequest(body, env) {
  const rawKey = env.GOOGLE_SA_KEY
  const folderId = env.GDRIVE_FOLDER_ID
  if (!rawKey || !folderId) {
    return { ok: false, status: 500, json: { error: 'GOOGLE_SA_KEY / GDRIVE_FOLDER_ID not set on the server.' } }
  }
  // Folder metadata needs no Google call — build the web URL from the id.
  if (body?.action === 'folder') {
    return { ok: true, status: 200, json: { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}` } }
  }
  try {
    const token = await getAccessToken(rawKey)
    if (body?.action === 'download') {
      if (!body.fileId) return { ok: false, status: 400, json: { error: 'fileId required' } }
      const dl = await downloadImage(token, body.fileId)
      return { ok: true, status: 200, json: dl }
    }
    // default: list
    const files = await listImages(token, folderId)
    return { ok: true, status: 200, json: { files } }
  } catch (err) {
    return { ok: false, status: 502, json: { error: String(err?.message || err) } }
  }
}

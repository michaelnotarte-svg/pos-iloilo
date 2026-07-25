// Vercel serverless function: POST /api/drive-pull
//   { action: "list" }                -> { files: [{id,name,size,...}] }
//   { action: "download", fileId }    -> { base64, media_type }
import { driveRequest } from './_drive.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const result = await driveRequest(body, process.env)
    res.status(result.status).json(result.json)
  } catch (err) {
    res.status(500).json({ error: 'Drive request failed', detail: String(err?.message || err) })
  }
}

// Vercel serverless function: POST /api/parse-receipt
// Thin wrapper around the shared core in ./_parse.js.
import { parseReceipt } from './_parse.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const result = await parseReceipt(body, process.env.ANTHROPIC_API_KEY)
    res.status(result.status).json(result.json)
  } catch (err) {
    res.status(500).json({ error: 'Parse failed', detail: String(err?.message || err) })
  }
}

// Shared receipt-parsing core. Used by both the Vercel serverless function
// (api/parse-receipt.js, production) and the Vite dev middleware (vite.config.js,
// local `npm run dev`) so there is ONE prompt + one Anthropic call to maintain.
//
// The API key is read from process.env.ANTHROPIC_API_KEY and never leaves the
// server — the browser only ever sees the parsed JSON back.

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export function buildPrompt(items = [], customers = []) {
  return `You are reading a photo of a HANDWRITTEN sales invoice from a Philippine meat-distribution business. The handwriting is cursive shorthand, so raw transcription is unreliable — use the official lists below to resolve names.

Return ONLY a JSON object (no prose, no markdown):
{
  "invoice_number": string|null,
  "date": "YYYY-MM-DD"|null,
  "customer_name": string|null,        // raw as written
  "customer_match": string|null,       // EXACT entry copied from CUSTOMER LIST, or null if no confident match
  "sale_type": string|null,
  "lines": [ {
    "item_text": string,               // raw as written
    "item_match": string|null,         // EXACT entry copied from ITEM LIST, or null if no confident match
    "boxes": number|null, "kilos": number|null, "unit_price": number|null, "amount": number|null
  } ],
  "parsed_total": number|null,
  "low_confidence_fields": string[]
}
Rules:
- item_match / customer_match MUST be copied character-for-character from the lists below, or null. Never invent a name that isn't in the list.
- Numbers must be numbers (not strings); use null for anything you can't read. Do NOT guess a number — leaving it null is safer than a wrong value. Watch decimal points carefully.
- List every line item.

ITEM LIST:
${items.join('\n')}

CUSTOMER LIST:
${customers.join('\n')}`
}

function extractJson(text) {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a === -1 || b === -1) return null
  try { return JSON.parse(text.slice(a, b + 1)) } catch { return null }
}

/**
 * body: { image (base64, no data: prefix), media_type, items:[], customers:[], model? }
 * Returns { ok, status, json } — json is the parsed receipt or { error }.
 */
export async function parseReceipt(body, apiKey) {
  if (!apiKey) return { ok: false, status: 500, json: { error: 'ANTHROPIC_API_KEY is not set on the server.' } }
  const { image, media_type, items = [], customers = [], model = DEFAULT_MODEL } = body || {}
  if (!image || !media_type) return { ok: false, status: 400, json: { error: 'image and media_type are required.' } }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data: image } },
          { type: 'text', text: buildPrompt(items, customers) },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, status: 502, json: { error: `Anthropic ${res.status}`, detail } }
  }
  const data = await res.json()
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')
  const parsed = extractJson(text)
  if (!parsed) return { ok: false, status: 502, json: { error: 'Model did not return valid JSON.', raw: text } }
  return { ok: true, status: 200, json: { ...parsed, _usage: data.usage, _model: model } }
}

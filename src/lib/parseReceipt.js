// Client helper for the receipt-import feature: downscale a photo in the browser
// (keeps the upload small + under serverless body limits) and POST it to the
// /api/parse-receipt endpoint, which does the Claude vision call server-side.

/**
 * Draw an image (from any src: object URL or data URL) to a canvas capped at
 * maxDim on its longest edge; return JPEG base64 (no data: prefix) + a dataUrl
 * for on-screen preview. `revoke` frees an object URL once loaded.
 */
export function downscaleSrc(src, { maxDim = 1600, quality = 0.82, revoke = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(src)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ dataUrl, base64: dataUrl.split(',')[1], media_type: 'image/jpeg' })
    }
    img.onerror = () => { if (revoke) URL.revokeObjectURL(src); reject(new Error('Could not read image')) }
    img.src = src
  })
}

/** Read a local File and downscale it. */
export function downscaleImage(file, maxDim = 1600, quality = 0.82) {
  return downscaleSrc(URL.createObjectURL(file), { maxDim, quality, revoke: true })
}

/** POST an image + glossary to the parse endpoint. Returns the parsed receipt. */
export async function parseReceipt({ base64, media_type, items, customers }) {
  const res = await fetch('/api/parse-receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: base64, media_type, items, customers }),
  })
  const json = await res.json().catch(() => ({ error: 'Bad response from parser' }))
  if (!res.ok) throw new Error(json.error || `Parser returned ${res.status}`)
  return json
}

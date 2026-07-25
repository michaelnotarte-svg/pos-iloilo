import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { parseReceipt } from './api/_parse.js'
import { driveRequest } from './api/_drive.js'

// Dev-only middleware mirroring the Vercel serverless functions so /api/* works
// under `npm run dev`. Keys come from the (git-ignored) .env — none are
// VITE_-prefixed, so they never reach the browser bundle.
function jsonPost(route, handle) {
  return (req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end('Method not allowed'); return }
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', async () => {
      try {
        const result = await handle(raw ? JSON.parse(raw) : {})
        res.statusCode = result.status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(result.json))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: `${route} failed`, detail: String(err?.message || err) }))
      }
    })
  }
}

function apiMiddleware(env) {
  return {
    name: 'pos-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/parse-receipt',
        jsonPost('parse-receipt', (body) => parseReceipt(body, env.ANTHROPIC_API_KEY)))
      server.middlewares.use('/api/drive-pull',
        jsonPost('drive-pull', (body) => driveRequest(body, env)))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), apiMiddleware(env)],
  }
})

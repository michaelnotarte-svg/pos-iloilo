// One-off Bacolod Phase A importer: loads items.csv + customers.csv into Supabase.
// Uses the SERVICE ROLE key (bypasses RLS). Idempotent — upserts on the explicit
// id in each CSV, so re-running is safe and won't create duplicates.
//
//   node scripts/import_bacolod.mjs [path-to-csv-folder]
//
// Reads from .env.local:  VITE_SUPABASE_URL,  SUPABASE_SERVICE_ROLE_KEY
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// --- tiny .env.local loader (no dependency) ---
const envPath = path.join(process.cwd(), '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const URL = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// --- quote-aware CSV parser (handles commas inside quoted fields) ---
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const header = rows.shift()
  return rows.filter((r) => r.length && r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

const folder = process.argv[2] || 'C:/Users/Dada/Downloads/bacolod_backfill'
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

async function upsertAll(table, rows, label) {
  const size = 500
  let done = 0
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) { console.error(`\n${table} chunk failed:`, error.message); process.exit(1) }
    done += chunk.length
    process.stdout.write(`\r${label}: ${done}/${rows.length}`)
  }
  console.log(`  ✓`)
}

const items = parseCsv(fs.readFileSync(path.join(folder, 'items.csv'), 'utf8'))
  .map((r) => ({ id: r.id, name: r.name, location: r.location }))
const customers = parseCsv(fs.readFileSync(path.join(folder, 'customers.csv'), 'utf8'))
  .map((r) => ({ id: r.id, business_name: r.business_name, display_name: r.display_name || null, type: r.type, location: r.location }))

console.log(`Importing to ${URL}`)
console.log(`  items: ${items.length}, customers: ${customers.length}`)
await upsertAll('items', items, 'items')
await upsertAll('customers', customers, 'customers')
console.log('Done.')

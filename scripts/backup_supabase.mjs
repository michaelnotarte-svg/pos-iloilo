// Local full-data backup of the Supabase database.
// Dumps every app table to timestamped JSON files under a backup folder, using
// the service-role key (bypasses RLS, so soft-deleted rows are included too).
//
//   node scripts/backup_supabase.mjs
//
// Options (env vars):
//   BACKUP_DIR      where to write   (default: <home>/pos-backups)
//   BACKUP_KEEP     keep N days      (default: 30; older folders are pruned)
//
// Restore note: this is a DATA backup (JSON per table), not schema. The schema
// lives in supabase/migrations. To rebuild: run the migrations on a fresh DB,
// then re-insert these JSON rows (respecting FK order). For a schema+data dump
// that restores in one shot, use pg_dump instead (see the chat notes).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

// Every table the app owns (parents before children — handy for restore order).
const TABLES = [
  'locations', 'profiles', 'list_options', 'app_settings', 'expense_categories',
  'customers', 'items',
  'purchase_orders', 'stock_entries',
  'invoices', 'invoice_lines', 'invoice_line_allocations', 'partial_payments',
  'inventory_archive', 'inventory_adjustments', 'oversell_overrides',
  'expenses', 'deposit_slips', 'drive_imports', 'audit_log',
]

async function dumpTable(table) {
  const size = 1000
  const out = []
  for (let from = 0; ; from += size) {
    // Order by id for stable pagination; fall back to unordered for keyless tables.
    let q = sb.from(table).select('*').range(from, from + size - 1)
    let { data, error } = await q.order('id', { ascending: true })
    if (error && /column .*id.* does not exist|order/i.test(error.message)) {
      ;({ data, error } = await sb.from(table).select('*').range(from, from + size - 1))
    }
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < size) break
  }
  return out
}

const now = new Date()
const stamp = now.toISOString().replace(/[:T]/g, '-').replace(/\..+/, '') // 2026-09-12-04-15-00
const root = process.env.BACKUP_DIR || path.join(os.homedir(), 'pos-backups')
const dir = path.join(root, stamp)
fs.mkdirSync(dir, { recursive: true })

console.log(`Backing up to ${dir}`)
const manifest = { started_at: now.toISOString(), url, tables: {} }
let grand = 0
for (const t of TABLES) {
  try {
    const rows = await dumpTable(t)
    fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows))
    manifest.tables[t] = rows.length
    grand += rows.length
    console.log(`  ${t}: ${rows.length}`)
  } catch (e) {
    manifest.tables[t] = `ERROR: ${e.message}`
    console.error(`  ${t}: FAILED — ${e.message}`)
  }
}
manifest.finished_at = new Date().toISOString()
manifest.total_rows = grand
fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Done. ${grand} rows across ${TABLES.length} tables.`)

// Prune old backups
const keep = Number(process.env.BACKUP_KEEP || 30)
const cutoff = Date.now() - keep * 86400000
for (const name of fs.readdirSync(root)) {
  const p = path.join(root, name)
  try {
    const st = fs.statSync(p)
    if (st.isDirectory() && st.mtimeMs < cutoff) {
      fs.rmSync(p, { recursive: true, force: true })
      console.log(`Pruned old backup ${name}`)
    }
  } catch { /* ignore */ }
}

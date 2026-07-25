// Bacolod Phase B loader — historical sales (2022-2026) into Supabase.
// Idempotent: every row carries an explicit UUID, so re-running upserts on id.
//   node scripts/load_bacolod_phaseB.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DIR = 'C:/Users/Dada/Downloads/bacolod_phaseB'
const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows.filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const load = (f) => parseCsv(fs.readFileSync(path.join(DIR, f), 'utf8'))
const n = (v) => (v === '' || v == null ? null : Number(v))
const s = (v) => (v === '' || v == null ? null : v)

async function push(table, rows, size = 500) {
  let done = 0
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + size), { onConflict: 'id' })
    if (error) { console.error(`\n  ${table} failed at row ${i}:`, error.message); process.exit(1) }
    done += Math.min(size, rows.length - i)
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`)
  }
  console.log('  ✓')
}

// 0. remove the 2 OCR test invoices
const { data: test } = await supabase.from('invoices').select('id, invoice_number')
  .eq('location', 'Bacolod').not('invoice_number', 'like', 'B-%')
if (test?.length) {
  await supabase.from('invoices').delete().in('id', test.map((t) => t.id))
  console.log(`removed ${test.length} test invoice(s): ${test.map((t) => t.invoice_number).join(', ')}`)
}

// 1. new customers
const customers = load('new_customers.csv')
console.log(`\nloading ${customers.length} new customers…`)
await push('customers', customers)

// 2. invoices
const invoices = load('invoices.csv').map((r) => ({
  id: r.id, invoice_number: r.invoice_number, location: r.location,
  customer_id: r.customer_id, date: r.date, storage: r.storage,
  sale_type: r.sale_type, status: r.status,
  sales_person: s(r.sales_person), notes: s(r.notes),
}))
console.log(`loading ${invoices.length} invoices…`)
await push('invoices', invoices)

// 3. lines
const lines = load('invoice_lines.csv').map((r) => ({
  id: r.id, invoice_id: r.invoice_id, item_id: r.item_id, storage: r.storage,
  batch_number: r.batch_number, unit_price: n(r.unit_price), boxes: n(r.boxes), kilos: n(r.kilos),
}))
console.log(`loading ${lines.length} invoice lines…`)
await push('invoice_lines', lines, 1000)

// 4. payments (no explicit id in the CSV — insert once, guarded)
const { count: existingPays } = await supabase.from('partial_payments')
  .select('*', { count: 'exact', head: true }).eq('notes', 'Historical import (marked Paid in tracker)')
if (existingPays) {
  console.log(`payments: ${existingPays} already present — skipping`)
} else {
  const pays = load('payments.csv').map((r) => ({
    invoice_id: r.invoice_id, amount_paid: n(r.amount_paid), date_paid: r.date_paid,
    mode_of_payment: r.mode_of_payment, remaining_balance: n(r.remaining_balance), notes: r.notes,
  }))
  console.log(`loading ${pays.length} payments…`)
  for (let i = 0; i < pays.length; i += 1000) {
    const { error } = await supabase.from('partial_payments').insert(pays.slice(i, i + 1000))
    if (error) { console.error('\n  payments failed:', error.message); process.exit(1) }
    process.stdout.write(`\r  partial_payments: ${Math.min(i + 1000, pays.length)}/${pays.length}`)
  }
  console.log('  ✓')
}

// 5. seed Bacolod's branch-scoped dropdowns
const seed = [
  ...['Pta Taytay', 'OCSI', 'Sikat Araw', 'Murcia'].map((name, i) => ({ list_type: 'storage', name, sort_order: i + 1, location: 'Bacolod' })),
  ...['Delivery', 'Walk-in', 'Out-of-Town'].map((name, i) => ({ list_type: 'sale_type', name, sort_order: i + 1, location: 'Bacolod' })),
]
for (const row of seed) {
  const { data: hit } = await supabase.from('list_options').select('id')
    .eq('list_type', row.list_type).eq('name', row.name).eq('location', 'Bacolod').maybeSingle()
  if (!hit) await supabase.from('list_options').insert(row)
}
console.log(`seeded ${seed.length} Bacolod list options (warehouses + sale types)`)
console.log('\nDone.')

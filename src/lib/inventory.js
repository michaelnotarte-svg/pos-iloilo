import { supabase } from './supabase'

const num = (x) => Number(x) || 0

// Single source of truth for inventory movements, used by the Inventory page
// and the on-hand helpers in the entry forms.
// Returns an array of { date, item_id, item, batch, storage, boxes, kilos, type }.
export async function fetchMovements() {
  const [arch, stock, sales, adj] = await Promise.all([
    supabase.from('inventory_archive').select('snapshot_date, item_id, batch_number, storage, boxes, kilos, items(name)'),
    supabase.from('stock_entries').select('date, item_id, batch_number, storage, boxes, kilos, items(name), purchase_orders(from_storage)'),
    supabase.from('invoice_lines').select('item_id, batch_number, storage, boxes, kilos, items(name), invoices(date)'),
    supabase.from('inventory_adjustments').select('date, item_id, batch_number, storage, boxes, kilos, items(name)'),
  ])

  const m = []
  for (const r of arch.data ?? [])
    m.push({ date: r.snapshot_date, item_id: r.item_id, item: r.items?.name ?? '—', batch: r.batch_number ?? '—', storage: r.storage, boxes: num(r.boxes), kilos: num(r.kilos), type: 'Opening' })

  for (const r of stock.data ?? []) {
    const from = r.purchase_orders?.from_storage
    const base = { date: r.date, item_id: r.item_id, item: r.items?.name ?? '—', batch: r.batch_number ?? '—' }
    if (from) {
      // Transfer: into destination (line storage), out of the from warehouse
      m.push({ ...base, storage: r.storage, boxes: num(r.boxes), kilos: num(r.kilos), type: 'Transfer In' })
      m.push({ ...base, storage: from, boxes: -num(r.boxes), kilos: -num(r.kilos), type: 'Transfer Out' })
    } else {
      m.push({ ...base, storage: r.storage, boxes: num(r.boxes), kilos: num(r.kilos), type: 'Stock Dump' })
    }
  }

  for (const r of sales.data ?? [])
    m.push({ date: r.invoices?.date, item_id: r.item_id, item: r.items?.name ?? '—', batch: r.batch_number ?? '—', storage: r.storage, boxes: -num(r.boxes), kilos: -num(r.kilos), type: 'Sale' })

  for (const r of adj.data ?? [])
    m.push({ date: r.date, item_id: r.item_id, item: r.items?.name ?? '—', batch: r.batch_number ?? '—', storage: r.storage, boxes: num(r.boxes), kilos: num(r.kilos), type: 'Adjustment' })

  return m.filter((x) => x.date)
}

// Build a Map keyed `${item_id}|${storage}` -> { boxes, kilos } as of an optional date.
export function onHandMap(moves, asOf) {
  const map = new Map()
  for (const mv of moves) {
    if (asOf && mv.date > asOf) continue
    const k = `${mv.item_id}|${mv.storage}`
    const o = map.get(k) || { boxes: 0, kilos: 0 }
    o.boxes += mv.boxes
    o.kilos += mv.kilos
    map.set(k, o)
  }
  return map
}

export function lookup(map, itemId, storage) {
  return map.get(`${itemId}|${storage}`) || { boxes: 0, kilos: 0 }
}

// Set of item_ids that have positive kilos at a given storage.
export function inStockItemIds(map, storage) {
  const ids = new Set()
  for (const [k, v] of map) {
    const [itemId, st] = k.split('|')
    if (st === storage && v.kilos > 0) ids.add(itemId)
  }
  return ids
}

export function avgKgBox(onhand) {
  return onhand.boxes > 0 ? onhand.kilos / onhand.boxes : 0
}

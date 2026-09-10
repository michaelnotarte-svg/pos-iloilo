import { supabase } from './supabase'

// Returns an array of option names for a given list_type.
// Falls back to `fallback` if the table is empty (e.g. before the migration runs).
// When `location` is given, returns shared entries (location null) plus that
// branch's own entries — used for 'storage' so each branch sees its warehouses.
export async function fetchListNames(listType, fallback = [], location = null) {
  let q = supabase
    .from('list_options')
    .select('name, location')
    .eq('list_type', listType)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  const { data } = await q
  let rows = data ?? []
  if (location) rows = rows.filter((r) => !r.location || r.location === location)
  const names = rows.map((r) => r.name)
  return names.length ? names : fallback
}

export const STORAGE_FALLBACK = ['Everest', 'FishingPort']
export const PAYMENT_FALLBACK = ['Cash', 'A.R.', 'Check', 'Bank Transfer', 'Bank Deposit', 'GCash']
export const SALE_TYPE_FALLBACK = ['Walk-in', 'Delivery', 'Out-of-Town']

// Product lines (see migration 0027). Meat = boxed meat sold by kilo (default);
// Chorizo = sold per unit.
export const PRODUCT_LINE_FALLBACK = ['Meat', 'Chorizo']
export const DEFAULT_PRODUCT_LINE = 'Meat'
// Unit-of-measure a product line sells in. Unit-sold lines are listed here; every
// other line defaults to kilos. (sell_by is also stored per item; this only seeds
// the default when picking a line in the item form.)
const UNIT_SOLD_LINES = new Set(['Chorizo'])
export const uomForLine = (line) => (UNIT_SOLD_LINES.has(line) ? 'unit' : 'kg')

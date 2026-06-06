import { supabase } from './supabase'

// Returns an array of option names for a given list_type.
// Falls back to `fallback` if the table is empty (e.g. before the migration runs).
export async function fetchListNames(listType, fallback = []) {
  const { data } = await supabase
    .from('list_options')
    .select('name')
    .eq('list_type', listType)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  const names = (data ?? []).map((r) => r.name)
  return names.length ? names : fallback
}

export const STORAGE_FALLBACK = ['Everest', 'FishingPort']
export const PAYMENT_FALLBACK = ['Cash', 'A.R.', 'Check', 'Bank Transfer', 'Bank Deposit', 'GCash']

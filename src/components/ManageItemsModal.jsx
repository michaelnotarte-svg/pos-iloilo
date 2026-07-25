import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/friendlyError'

// Item name = "Base - Brand" (matches the Items page). Kept in sync with
// Items.jsx buildName().
function buildName(base, brand) {
  const b = base.trim()
  const br = (brand || '').trim()
  return br ? `${b} - ${br}` : b
}

/**
 * Quick item manager for use in-context (e.g. the OCR import screen), mirroring
 * ManageCustomersModal. Full editing lives on the Items page.
 * Props:
 *   onClose
 *   onChange(newId?) - refetch the parent item list; receives the new item's id
 *                      after an add so the caller can auto-select it
 */
export default function ManageItemsModal({ onClose, onChange }) {
  const { activeLocation, profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('items')
      .select('id, name')
      .eq('location', activeLocation)
      .order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  async function add(e) {
    e.preventDefault()
    if (!base.trim()) { setError('Item name is required.'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('items').insert({
      name: buildName(base, brand),
      base_name: base.trim(),
      brand: brand.trim() || null,
      category: category.trim() || null,
      location: activeLocation,
    }).select('id').single()
    setSaving(false)
    if (err) { setError(friendlyError(err, { profile })); return }
    setBase(''); setBrand(''); setCategory('')
    await load()
    onChange?.(data?.id)
  }

  async function remove() {
    if (!deleteTarget) return
    await supabase.from('items').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    await load()
    onChange?.()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Manage Items</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <form onSubmit={add} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Item name *" value={base} onChange={(e) => setBase(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {base.trim() && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Saved as: <span className="font-semibold text-gray-700 dark:text-gray-200">{buildName(base, brand)}</span>
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg">
                Add Item
              </button>
            </div>
          </form>
          {error && <p className="text-red-500 text-xs">{error}</p>}

          <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {loading ? (
              <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">No items yet.</li>
            ) : (
              items.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{i.name}</span>
                  <button onClick={() => setDeleteTarget(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </li>
              ))
            )}
          </ul>

          <div className="flex justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Done</button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Remove item?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span className="font-medium text-gray-700 dark:text-gray-200">{deleteTarget.name}</span> will be removed. Existing invoices that already use it are not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
              <button onClick={remove} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

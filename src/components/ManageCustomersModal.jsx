import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/**
 * Quick customer manager — add (display + business name + type) and remove.
 * Full editing lives on the Customers page; this is for fast in-context use.
 * Props:
 *   onClose
 *   onChange(newId?) - refetch parent customer list; receives the new customer's
 *                      id after an add so the caller can auto-select it
 *   defaultType      - 'Customer' | 'BN' — preselects the type toggle
 */
export default function ManageCustomersModal({ onClose, onChange, defaultType = 'Customer' }) {
  const { activeLocation } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [display, setDisplay] = useState('')
  const [business, setBusiness] = useState('')
  const [type, setType] = useState(defaultType === 'BN' ? 'BN' : 'Customer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('id, business_name, display_name, type')
      .eq('location', activeLocation)
      .order('business_name')
    setCustomers(data ?? [])
    setLoading(false)
  }

  async function add(e) {
    e.preventDefault()
    if (!business.trim() && !display.trim()) { setError('Enter a name.'); return }
    setSaving(true)
    setError('')
    const business_name = business.trim() || display.trim()
    const { data, error: err } = await supabase.from('customers').insert({
      business_name,
      display_name: display.trim() || null,
      type,
      location: activeLocation,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setDisplay(''); setBusiness('')
    await load()
    onChange?.(data?.id)   // hand the new id back so the form can select it
  }

  async function remove() {
    if (!deleteTarget) return
    await supabase.from('customers').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    await load()
    onChange?.()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Manage Customers</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <form onSubmit={add} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Type</span>
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                {['Customer', 'BN'].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-4 py-1 text-xs font-medium ${type === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Display name"
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Business name"
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg">
                Add Customer
              </button>
            </div>
          </form>
          {error && <p className="text-red-500 text-xs">{error}</p>}

          <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {loading ? (
              <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Loading…</li>
            ) : customers.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">No customers yet.</li>
            ) : (
              customers.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {c.display_name || c.business_name}
                    {c.display_name && <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">({c.business_name})</span>}
                    {c.type === 'BN' && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">BN</span>}
                  </span>
                  <button onClick={() => setDeleteTarget(c)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
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
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Remove customer?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span className="font-medium text-gray-700 dark:text-gray-200">{deleteTarget.display_name || deleteTarget.business_name}</span> will be removed.
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

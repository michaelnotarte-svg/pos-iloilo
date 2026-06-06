import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_OPTIONS = ['Everest', 'FishingPort']

const EMPTY_FORM = {
  snapshot_date: new Date().toISOString().slice(0, 10),
  item_id: '',
  batch_number: '',
  storage: 'Everest',
  boxes: '',
  kilos: '',
  notes: '',
}

function fmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

export default function Inventory() {
  const [rows, setRows]       = useState([])
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  const [storageFilter, setStorageFilter] = useState('All')
  const [dateFilter, setDateFilter]       = useState('')
  const [search, setSearch]               = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: invData }, { data: itemData }] = await Promise.all([
      supabase
        .from('inventory_archive')
        .select('*, items(name, category)')
        .order('snapshot_date', { ascending: false }),
      supabase.from('items').select('id, name, category').order('name'),
    ])
    setRows(invData ?? [])
    setItems(itemData ?? [])
    setLoading(false)
  }

  // Unique snapshot dates for the date filter
  const dateOptions = ['All', ...Array.from(
    new Set(rows.map((r) => r.snapshot_date).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a))]

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      r.items?.name?.toLowerCase().includes(q) ||
      r.batch_number?.toString().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    const matchStorage = storageFilter === 'All' || r.storage === storageFilter
    const matchDate    = !dateFilter || dateFilter === 'All' || r.snapshot_date === dateFilter
    return matchSearch && matchStorage && matchDate
  })

  // Group by item name, FIFO order within each group (oldest batch first)
  const grouped = filtered.reduce((acc, r) => {
    const key = r.items?.name ?? 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})
  const groupKeys = Object.keys(grouped).sort()

  const totalKilos = filtered.reduce((s, r) => s + (Number(r.kilos) || 0), 0)
  const totalBoxes = filtered.reduce((s, r) => s + (Number(r.boxes) || 0), 0)

  // ── CRUD ─────────────────────────────────────────────────
  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError('')
    setModalOpen(true)
  }

  function openEdit(r) {
    setForm({
      snapshot_date: r.snapshot_date,
      item_id:       r.item_id,
      batch_number:  r.batch_number,
      storage:       r.storage,
      boxes:         r.boxes ?? '',
      kilos:         r.kilos,
      notes:         r.notes ?? '',
    })
    setEditId(r.id)
    setError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.item_id)           { setError('Select an item.'); return }
    if (!form.batch_number.toString().trim()) { setError('Batch # is required.'); return }
    if (!form.kilos)             { setError('Kilos is required.'); return }
    if (!form.snapshot_date)     { setError('Date is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      snapshot_date: form.snapshot_date,
      item_id:       form.item_id,
      batch_number:  form.batch_number.toString().trim(),
      storage:       form.storage,
      boxes:         form.boxes ? Number(form.boxes) : null,
      kilos:         Number(form.kilos),
      notes:         form.notes.trim() || null,
    }
    let err
    if (editId) {
      ;({ error: err } = await supabase.from('inventory_archive').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('inventory_archive').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    fetchAll()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await supabase.from('inventory_archive').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    fetchAll()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-800">Inventory</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + Log Stock
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-5">
        Manual inventory entries — opening balances and physical counts. PO receipts are tracked separately under Purchase Orders.
      </p>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex gap-6 mb-5 text-sm">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Total Kilos</span>
            <p className="font-bold text-gray-800 text-base">{fmt(totalKilos)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Total Boxes</span>
            <p className="font-bold text-gray-800 text-base">{totalBoxes > 0 ? totalBoxes.toLocaleString() : '—'}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Batches</span>
            <p className="font-bold text-gray-800 text-base">{filtered.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search item, batch, or notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={storageFilter}
          onChange={(e) => setStorageFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Locations</option>
          {STORAGE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dateOptions.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No inventory records. Use "+ Log Stock" to enter your opening balances.</p>
      ) : (
        <div className="space-y-4">
          {groupKeys.map((itemName) => {
            const batches   = grouped[itemName].slice().sort((a, b) => a.batch_number - b.batch_number)
            const itemKilos = batches.reduce((s, b) => s + (Number(b.kilos) || 0), 0)
            const itemBoxes = batches.reduce((s, b) => s + (Number(b.boxes) || 0), 0)
            const category  = batches[0]?.items?.category

            return (
              <div key={itemName} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Item header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">{itemName}</span>
                    {category && <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{category}</span>}
                  </div>
                  <div className="text-xs text-gray-600 font-medium flex gap-4">
                    <span>{fmt(itemKilos)} kg</span>
                    {itemBoxes > 0 && <span>{itemBoxes.toLocaleString()} boxes</span>}
                    <span className="text-gray-400">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</span>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead className="text-gray-400 text-xs uppercase bg-white">
                    <tr>
                      <th className="text-left px-5 py-2">Batch #</th>
                      <th className="text-left px-5 py-2">Storage</th>
                      <th className="text-right px-5 py-2">Boxes</th>
                      <th className="text-right px-5 py-2">Kilos</th>
                      <th className="text-left px-5 py-2">Date</th>
                      <th className="text-left px-5 py-2">Notes</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono text-sm font-semibold text-gray-700">
                          {b.batch_number}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${b.storage === 'Everest' ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
                            {b.storage}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">{b.boxes != null ? Number(b.boxes).toLocaleString() : '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{fmt(b.kilos)}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{b.snapshot_date}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs max-w-xs truncate">{b.notes ?? '—'}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <button onClick={() => openEdit(b)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                          <button onClick={() => setDeleteTarget(b)} className="text-red-500 hover:underline text-xs">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Log Stock Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{editId ? 'Edit Entry' : 'Log Stock'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.snapshot_date}
                  onChange={(e) => set('snapshot_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Item *</label>
                <select
                  value={form.item_id}
                  onChange={(e) => set('item_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}{i.category ? ` (${i.category})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Batch # *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.batch_number}
                    onChange={(e) => set('batch_number', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Storage *</label>
                  <select
                    value={form.storage}
                    onChange={(e) => set('storage', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STORAGE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Boxes</label>
                  <input
                    type="number"
                    step="any"
                    value={form.boxes}
                    onChange={(e) => set('boxes', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kilos *</label>
                  <input
                    type="number"
                    step="any"
                    value={form.kilos}
                    onChange={(e) => set('kilos', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="e.g. Opening balance, physical count"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Delete entry?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{deleteTarget.items?.name}</span> Batch {deleteTarget.batch_number} — {fmt(deleteTarget.kilos)} kg will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

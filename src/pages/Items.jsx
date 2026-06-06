import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = { name: '', category: '', unit: 'box' }

export default function Items() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase.from('items').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  const filtered = items.filter((i) => {
    const q = search.toLowerCase()
    return i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q)
  })

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item) {
    setForm({ name: item.name, category: item.category ?? '', unit: item.unit ?? 'box' })
    setEditId(item.id)
    setError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit.trim() || 'box',
    }
    let err
    if (editId) {
      ;({ error: err } = await supabase.from('items').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('items').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    fetchItems()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await supabase.from('items').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    fetchItems()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Items</h1>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          + Add Item
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by name or category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No items found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Unit</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                    <button onClick={() => setDeleteTarget(item)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{editId ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>box</option>
                  <option>kg</option>
                  <option>pack</option>
                  <option>piece</option>
                  <option>bag</option>
                </select>
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

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Delete item?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{deleteTarget.name}</span> will be permanently removed.
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

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

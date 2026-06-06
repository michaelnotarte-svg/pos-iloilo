import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  category: '',
}

function fmt(n) {
  return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [catError, setCatError] = useState('')
  const [deleteCatTarget, setDeleteCatTarget] = useState(null)

  const [monthFilter, setMonthFilter] = useState('All')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: expData }, { data: catData }] = await Promise.all([
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
    ])
    setExpenses(expData ?? [])
    setCategories(catData ?? [])
    setLoading(false)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('expense_categories').select('*').order('name')
    setCategories(data ?? [])
  }

  // Month options for filter
  const monthOptions = ['All', ...Array.from(
    new Set(expenses.map((e) => e.date?.slice(0, 7)))
  ).filter(Boolean).sort((a, b) => b.localeCompare(a))]

  const filtered = monthFilter === 'All'
    ? expenses
    : expenses.filter((e) => e.date?.startsWith(monthFilter))

  const monthTotal = filtered.reduce((s, e) => s + Number(e.amount), 0)

  // ── Expense CRUD ─────────────────────────────────────────
  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  function openAdd() {
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    setEditId(null)
    setError('')
    setModalOpen(true)
  }

  function openEdit(e) {
    setForm({ date: e.date, description: e.description, amount: e.amount, category: e.category ?? '' })
    setEditId(e.id)
    setError('')
    setModalOpen(true)
  }

  async function handleSave(ev) {
    ev.preventDefault()
    if (!form.description.trim()) { setError('Description is required.'); return }
    if (!form.amount) { setError('Amount is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      date: form.date,
      description: form.description.trim(),
      amount: Number(form.amount),
      category: form.category || null,
    }
    let err
    if (editId) {
      ;({ error: err } = await supabase.from('expenses').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('expenses').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    fetchAll()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await supabase.from('expenses').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    fetchAll()
  }

  // ── Category CRUD ─────────────────────────────────────────
  async function handleAddCategory(ev) {
    ev.preventDefault()
    if (!newCatName.trim()) { setCatError('Name is required.'); return }
    setSavingCat(true)
    setCatError('')
    const { error: err } = await supabase.from('expense_categories').insert({ name: newCatName.trim() })
    setSavingCat(false)
    if (err) { setCatError(err.message); return }
    setNewCatName('')
    fetchCategories()
  }

  async function handleDeleteCategory() {
    if (!deleteCatTarget) return
    await supabase.from('expense_categories').delete().eq('id', deleteCatTarget.id)
    setDeleteCatTarget(null)
    fetchCategories()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Expenses</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + Add Expense
        </button>
      </div>

      {/* Month filter + total */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Month</label>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {monthOptions.map((m) => <option key={m}>{m}</option>)}
        </select>
        {monthFilter !== 'All' && (
          <span className="ml-auto text-sm font-semibold text-gray-700">
            Total: ₱{fmt(monthTotal)}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No expenses found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{e.date}</td>
                  <td className="px-5 py-3 text-gray-800">{e.description}</td>
                  <td className="px-5 py-3">
                    {e.category
                      ? <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{e.category}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-gray-800">₱{fmt(e.amount)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                    <button onClick={() => setDeleteTarget(e)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={3} className="px-5 py-3 text-right text-xs uppercase text-gray-500 tracking-wide font-semibold">
                  {monthFilter === 'All' ? 'Grand Total' : 'Month Total'}
                </td>
                <td className="px-5 py-3 text-right font-bold text-gray-800">₱{fmt(monthTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{editId ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
                <input
                  type="number"
                  step="any"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Category</label>
                  <button
                    type="button"
                    onClick={() => { setCatError(''); setNewCatName(''); setCatModalOpen(true) }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Manage categories
                  </button>
                </div>
                <select
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
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

      {/* ── Manage Categories Modal ── */}
      {catModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Manage Categories</h2>
              <button onClick={() => setCatModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Add new */}
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  placeholder="New category name…"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={savingCat}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg"
                >
                  Add
                </button>
              </form>
              {catError && <p className="text-red-500 text-xs">{catError}</p>}

              {/* List */}
              <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                {categories.length === 0 && (
                  <li className="px-4 py-3 text-sm text-gray-400">No categories yet.</li>
                )}
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{c.name}</span>
                    <button
                      onClick={() => setDeleteCatTarget(c)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex justify-end">
                <button onClick={() => setCatModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Expense Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Delete expense?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{deleteTarget.description}</span> — ₱{fmt(deleteTarget.amount)} will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Category Confirm ── */}
      {deleteCatTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Remove category?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{deleteCatTarget.name}</span> will be removed. Existing expenses using this category are not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteCatTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleDeleteCategory} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = {
  po_number: '',
  date: new Date().toISOString().slice(0, 10),
  supplier: '',
  source: '',
  category: '',
  notes: '',
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchOrders() }, [])

  async function fetchOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, stock_entries(boxes, kilos, items(name))')
      .order('date', { ascending: false })

    const enriched = (data ?? []).map((po) => {
      const entries = po.stock_entries ?? []
      return {
        ...po,
        lineCount:  entries.length,
        totalBoxes: entries.reduce((s, e) => s + (Number(e.boxes) || 0), 0),
        totalKilos: entries.reduce((s, e) => s + (Number(e.kilos) || 0), 0),
        itemList:   [...new Set(entries.map((e) => e.items?.name).filter(Boolean))].join(', '),
      }
    })
    setOrders(enriched)
    setLoading(false)
  }

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase()
    return (
      o.po_number?.toLowerCase().includes(q) ||
      o.supplier?.toLowerCase().includes(q) ||
      o.source?.toLowerCase().includes(q) ||
      o.category?.toLowerCase().includes(q)
    )
  })

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.po_number.trim()) { setError('PO # is required.'); return }
    if (!form.date) { setError('Date is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      po_number: form.po_number.trim(),
      date: form.date,
      supplier: form.supplier.trim() || null,
      source: form.source.trim() || null,
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
    }
    const { data, error: err } = await supabase
      .from('purchase_orders')
      .insert(payload)
      .select()
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    navigate(`/inventory/${data.id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Purchase Orders</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + New PO
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by PO #, supplier, source, category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No purchase orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">PO #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-right px-4 py-3"># Items</th>
                <th className="text-right px-4 py-3">Total Boxes</th>
                <th className="text-right px-4 py-3">Total Kilos</th>
                <th className="text-left px-4 py-3">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/inventory/${o.id}`)}
                  className="hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-blue-700">{o.po_number}</td>
                  <td className="px-4 py-3 text-gray-600">{o.date}</td>
                  <td className="px-4 py-3 text-gray-600">{o.supplier ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.lineCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.totalBoxes > 0 ? o.totalBoxes.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.totalKilos > 0 ? o.totalKilos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={o.itemList}>{o.itemList || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New PO Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">New Purchase Order</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="PO # *" value={form.po_number} onChange={(v) => set('po_number', v)} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => set('date', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Supplier" value={form.supplier} onChange={(v) => set('supplier', v)} />
                <Field label="Source" value={form.source} onChange={(v) => set('source', v)} />
              </div>
              <Field label="Category" value={form.category} onChange={(v) => set('category', v)} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {saving ? 'Creating…' : 'Create & Add Items →'}
                </button>
              </div>
            </form>
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

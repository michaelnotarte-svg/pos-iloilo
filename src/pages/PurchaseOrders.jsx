import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchListNames, STORAGE_FALLBACK } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'

const EMPTY_FORM = {
  po_number: '',
  date: new Date().toISOString().slice(0, 10),
  storage: 'Everest',
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
  const [storageOptions, setStorageOptions] = useState(STORAGE_FALLBACK)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [supplierOptions, setSupplierOptions] = useState([])
  const [sourceOptions, setSourceOptions] = useState([])
  const [manageList, setManageList] = useState(null) // list_type | null

  useEffect(() => { fetchOrders(); loadLists() }, [])

  async function loadLists() {
    setStorageOptions(await fetchListNames('storage', STORAGE_FALLBACK))
    setCategoryOptions(await fetchListNames('delivery_category', []))
    setSupplierOptions(await fetchListNames('supplier', []))
    setSourceOptions(await fetchListNames('source', []))
  }
  const loadStorage = loadLists

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
    if (!form.date) { setError('Date is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      po_number: form.po_number.trim() || null,
      date: form.date,
      storage: form.storage,
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
    navigate(`/stocks/${data.id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Stocks</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + New Delivery
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by ref #, supplier, source, category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No stock deliveries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-right px-4 py-3"># Items</th>
                <th className="text-right px-4 py-3">Total Boxes</th>
                <th className="text-right px-4 py-3">Total Kilos</th>
                <th className="text-left px-4 py-3">Items</th>
                <th className="text-left px-4 py-3">Ref #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/stocks/${o.id}`)}
                  className="hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-700">{o.date}</td>
                  <td className="px-4 py-3 text-gray-600">{o.source ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.lineCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.totalBoxes > 0 ? o.totalBoxes.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.totalKilos > 0 ? o.totalKilos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={o.itemList}>{o.itemList || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{o.po_number || '—'}</td>
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
              <h2 className="font-semibold text-gray-800">New Stock Delivery</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600">Storage *</label>
                    <button type="button" onClick={() => setManageList('storage')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                  </div>
                  <select
                    value={form.storage}
                    onChange={(e) => set('storage', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {storageOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ManagedSelect label="Source" value={form.source} onChange={(v) => set('source', v)} options={sourceOptions} onManage={() => setManageList('source')} />
                <ManagedSelect label="Supplier" value={form.supplier} onChange={(v) => set('supplier', v)} options={supplierOptions} onManage={() => setManageList('supplier')} />
              </div>
              <ManagedSelect label="Category" value={form.category} onChange={(v) => set('category', v)} options={categoryOptions} onManage={() => setManageList('delivery_category')} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Field label="Ref # (optional)" value={form.po_number} onChange={(v) => set('po_number', v)} />
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

      {manageList && (
        <ManageListModal
          listType={manageList}
          title={LIST_TITLES[manageList] ?? 'Manage List'}
          onClose={() => setManageList(null)}
          onChange={loadLists}
        />
      )}
    </div>
  )
}

const LIST_TITLES = {
  storage: 'Manage Storage Locations',
  source: 'Manage Sources',
  supplier: 'Manage Suppliers',
  delivery_category: 'Manage Categories',
}

function ManagedSelect({ label, value, onChange, options, onManage }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        <button type="button" onClick={onManage} className="text-[11px] text-blue-600 hover:underline">Manage</button>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— None —</option>
        {options.map((o) => <option key={o}>{o}</option>)}
        {value && !options.includes(value) && <option>{value}</option>}
      </select>
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

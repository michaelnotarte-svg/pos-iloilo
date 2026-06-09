import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchListNames, STORAGE_FALLBACK } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'

const EMPTY_FORM = {
  po_number: '',
  date: new Date().toISOString().slice(0, 10),
  storage: 'Everest',
  from_storage: '',
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
    const isTransfer = form.category === 'Transfer'
    if (isTransfer) {
      if (!form.from_storage) { setError('From warehouse is required for a transfer.'); return }
      if (form.from_storage === form.storage) { setError('From and To warehouses must be different.'); return }
    }
    setSaving(true)
    setError('')
    const payload = {
      po_number: form.po_number.trim() || null,
      date: form.date,
      storage: form.storage,
      from_storage: isTransfer ? form.from_storage : null,
      supplier: isTransfer ? null : (form.supplier.trim() || null),
      source: isTransfer ? null : (form.source.trim() || null),
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
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Stocks</h1>
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
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">No stock deliveries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs">
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
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/stocks/${o.id}`)}
                  className="hover:bg-blue-50 dark:hover:bg-gray-700/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-200">{o.date}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{o.source ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{o.lineCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{o.totalBoxes > 0 ? o.totalBoxes.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{o.totalKilos > 0 ? o.totalKilos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate" title={o.itemList}>{o.itemList || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{o.po_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New PO Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">{form.category === 'Transfer' ? 'New Stock Transfer' : 'New Stock Delivery'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}

              {/* Category first — drives the rest of the form */}
              <ManagedSelect label="Category" value={form.category} onChange={(v) => set('category', v)} options={categoryOptions} onManage={() => setManageList('delivery_category')} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => set('date', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">{form.category === 'Transfer' ? 'To Warehouse *' : 'Storage *'}</label>
                    <button type="button" onClick={() => setManageList('storage')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                  </div>
                  <select
                    value={form.storage}
                    onChange={(e) => set('storage', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {storageOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {form.category === 'Transfer' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">From Warehouse *</label>
                  <select
                    value={form.from_storage}
                    onChange={(e) => set('from_storage', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select source warehouse…</option>
                    {storageOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Stock will be deducted from here and added to the destination warehouse.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <ManagedSelect label="Source" value={form.source} onChange={(v) => set('source', v)} options={sourceOptions} onManage={() => setManageList('source')} />
                  <ManagedSelect label="Supplier" value={form.supplier} onChange={(v) => set('supplier', v)} options={supplierOptions} onManage={() => setManageList('supplier')} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Field label="Ref # (optional)" value={form.po_number} onChange={(v) => set('po_number', v)} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">
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
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</label>
        <button type="button" onClick={onManage} className="text-[11px] text-blue-600 hover:underline">Manage</button>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

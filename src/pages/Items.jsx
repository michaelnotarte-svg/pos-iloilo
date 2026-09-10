import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchListNames, PRODUCT_LINE_FALLBACK, DEFAULT_PRODUCT_LINE, uomForLine } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/friendlyError'

const EMPTY_FORM = { base_name: '', brand: '', category: '', product_line: DEFAULT_PRODUCT_LINE, sell_by: 'kg' }

function buildName(base, brand) {
  const b = base.trim()
  const br = brand.trim()
  return br ? `${b} - ${br}` : b
}

export default function Items() {
  const { activeLocation, canWrite, profile } = useAuth()
  const canEdit = canWrite(['Stocks', 'Sales'])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState('')
  const [categoryOptions, setCategoryOptions] = useState([])
  const [baseOptions, setBaseOptions] = useState([])
  const [brandOptions, setBrandOptions] = useState([])
  const [lineOptions, setLineOptions] = useState(PRODUCT_LINE_FALLBACK)
  const [lineFilter, setLineFilter] = useState('All')
  const [manageList, setManageList] = useState(null)

  useEffect(() => { fetchItems(); loadCategories() }, [activeLocation])

  async function loadCategories() {
    setCategoryOptions(await fetchListNames('item_category', []))
    setBaseOptions(await fetchListNames('item_base', []))
    setBrandOptions(await fetchListNames('brand', []))
    setLineOptions(await fetchListNames('product_line', PRODUCT_LINE_FALLBACK))
  }

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase.from('items').select('*').eq('location', activeLocation).order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  const filtered = items.filter((i) => {
    const q = search.toLowerCase()
    const textOK = (
      i.name?.toLowerCase().includes(q) ||
      i.brand?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    )
    const line = i.product_line || DEFAULT_PRODUCT_LINE
    const lineOK = lineFilter === 'All' || line === lineFilter
    return textOK && lineOK
  })

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item) {
    setForm({
      base_name: item.base_name ?? item.name ?? '',
      brand: item.brand ?? '',
      category: item.category ?? '',
      product_line: item.product_line || DEFAULT_PRODUCT_LINE,
      sell_by: item.sell_by || 'kg',
    })
    setEditId(item.id)
    setError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.base_name.trim()) { setError('Item name is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: buildName(form.base_name, form.brand),
      base_name: form.base_name.trim(),
      brand: form.brand.trim() || null,
      category: form.category.trim() || null,
      product_line: form.product_line || DEFAULT_PRODUCT_LINE,
      sell_by: form.sell_by || 'kg',
      location: activeLocation,
    }
    let err
    if (editId) {
      ;({ error: err } = await supabase.from('items').update(payload).eq('id', editId))
    } else {
      ;({ error: err } = await supabase.from('items').insert(payload))
    }
    setSaving(false)
    if (err) { setError(friendlyError(err, { profile })); return }
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
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Items</h1>
        {canEdit && (
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          + Add Item
        </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by name or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-44 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="All">All Lines</option>
          {lineOptions.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">No items found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Line</th>
                <th className="text-left px-4 py-3">Brand</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${(item.sell_by === 'unit') ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {item.product_line || DEFAULT_PRODUCT_LINE}{item.sell_by === 'unit' ? ' · unit' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.brand ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.category ?? '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>}
                    {canEdit && <button onClick={() => setDeleteTarget(item)} className="text-red-500 hover:underline text-xs">Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">{editId ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <ManagedSelect label="Item *" value={form.base_name} onChange={(v) => setForm({ ...form, base_name: v })} options={baseOptions} onManage={() => setManageList('item_base')} />
              <ManagedSelect label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} options={brandOptions} onManage={() => setManageList('brand')} />
              {form.base_name.trim() && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Saved as: <span className="font-semibold text-gray-700 dark:text-gray-200">{buildName(form.base_name, form.brand)}</span>
                </p>
              )}
              {/* Product line drives its own item list, inventory view and totals;
                  picking a line seeds its unit of measure. */}
              <ManagedSelect
                label="Product Line *"
                value={form.product_line}
                onChange={(v) => setForm({ ...form, product_line: v, sell_by: uomForLine(v) })}
                options={lineOptions}
                onManage={() => setManageList('product_line')}
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sold by</label>
                <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  {[['kg', 'Kilos'], ['unit', 'Units']].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, sell_by: v })}
                      className={`px-3 py-2 text-sm font-medium ${form.sell_by === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Category</label>
                  <button type="button" onClick={() => setManageList('item_category')} className="text-xs text-blue-600 hover:underline">Manage</button>
                </div>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {categoryOptions.map((c) => <option key={c}>{c}</option>)}
                  {form.category && !categoryOptions.includes(form.category) && <option>{form.category}</option>}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
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
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Delete item?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span className="font-medium text-gray-700 dark:text-gray-200">{deleteTarget.name}</span> will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
              <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {manageList && (
        <ManageListModal
          listType={manageList}
          title={ITEM_LIST_TITLES[manageList] ?? 'Manage List'}
          onClose={() => setManageList(null)}
          onChange={loadCategories}
        />
      )}
    </div>
  )
}

const ITEM_LIST_TITLES = {
  item_base: 'Manage Item Names',
  brand: 'Manage Brands',
  item_category: 'Manage Item Categories',
  product_line: 'Manage Product Lines',
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

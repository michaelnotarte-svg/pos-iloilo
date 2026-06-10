import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/settings'
import { fetchListNames, PAYMENT_FALLBACK, STORAGE_FALLBACK } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'
import ManageCustomersModal from '../components/ManageCustomersModal'
import { useAuth } from '../lib/auth'

const SALE_TYPES = ['Walk-in', 'Delivery', 'Out-of-Town']
const STATUSES = ['Unpaid', 'Partial', 'Paid']

const STATUS_STYLE = {
  Paid: 'bg-green-100 text-green-700',
  Unpaid: 'bg-red-100 text-red-700',
  Partial: 'bg-yellow-100 text-yellow-700',
}

const EMPTY_FORM = {
  invoice_number: '',
  customer_id: '',
  date: new Date().toISOString().slice(0, 10),
  storage: 'Everest',
  sale_type: 'Walk-in',
  status: 'Unpaid',
  payment_method: '',
}

export default function Invoices() {
  const navigate = useNavigate()
  const { activeLocation } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [paymentOptions, setPaymentOptions] = useState(PAYMENT_FALLBACK)
  const [storageOptions, setStorageOptions] = useState(STORAGE_FALLBACK)
  const [managePayment, setManagePayment] = useState(false)
  const [manageStorage, setManageStorage] = useState(false)
  const [manageCustomers, setManageCustomers] = useState(false)

  useEffect(() => { fetchAll(); loadPayments() }, [activeLocation])

  async function loadPayments() {
    setPaymentOptions(await fetchListNames('payment_method', PAYMENT_FALLBACK))
    setStorageOptions(await fetchListNames('storage', STORAGE_FALLBACK, activeLocation))
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('id, business_name, display_name').eq('location', activeLocation).order('business_name')
    setCustomers(data ?? [])
  }

  async function fetchAll() {
    setLoading(true)
    const [{ data: invData }, { data: custData }] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customers(business_name, display_name), invoice_lines(amount)')
        .eq('location', activeLocation)
        .order('date', { ascending: false }),
      supabase.from('customers').select('id, business_name, display_name').eq('location', activeLocation).order('business_name'),
    ])
    setInvoices(invData ?? [])
    setCustomers(custData ?? [])
    setLoading(false)
  }

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase()
    const matchSearch =
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customers?.business_name?.toLowerCase().includes(q) ||
      inv.customers?.display_name?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'All' || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.invoice_number.trim()) { setError('Invoice # is required.'); return }
    if (!form.date) { setError('Date is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      invoice_number: form.invoice_number.trim(),
      location: activeLocation,
      customer_id: form.customer_id || null,
      date: form.date,
      storage: form.storage,
      sale_type: form.sale_type,
      status: form.status,
      payment_method: form.status === 'Paid' ? (form.payment_method || null) : null,
    }
    const { data, error: err } = await supabase.from('invoices').insert(payload).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    navigate(`/invoices/${data.id}`)
  }

  const grandTotal = (inv) =>
    (inv.invoice_lines ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Invoices</h1>
        <button
          onClick={() => { setForm(EMPTY_FORM); setError(''); setModalOpen(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + New Invoice
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by invoice # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">No invoices found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="hover:bg-blue-50 dark:hover:bg-gray-700/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{inv.date}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{inv.customers ? (inv.customers.display_name || inv.customers.business_name) : <span className="text-gray-400 dark:text-gray-500 italic">Walk-in</span>}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{inv.sale_type}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-100">
                    {money(grandTotal(inv))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">New Invoice</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 space-y-3">
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Invoice # *</label>
                  <input
                    type="text"
                    value={form.invoice_number}
                    onChange={(e) => set('invoice_number', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => set('date', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Customer</label>
                  <button type="button" onClick={() => setManageCustomers(true)} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                </div>
                <select
                  value={form.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Walk-in / No customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Warehouse *</label>
                  <button type="button" onClick={() => setManageStorage(true)} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                </div>
                <select
                  value={form.storage}
                  onChange={(e) => set('storage', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {storageOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">All line items will draw stock from this warehouse (FIFO by batch).</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sale Type</label>
                  <select
                    value={form.sale_type}
                    onChange={(e) => set('sale_type', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SALE_TYPES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {form.status === 'Paid' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Payment Method</label>
                    <button type="button" onClick={() => setManagePayment(true)} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                  </div>
                  <select
                    value={form.payment_method}
                    onChange={(e) => set('payment_method', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select —</option>
                    {paymentOptions.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {saving ? 'Creating…' : 'Create & Add Lines →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managePayment && (
        <ManageListModal
          listType="payment_method"
          title="Manage Payment Methods"
          onClose={() => setManagePayment(false)}
          onChange={loadPayments}
        />
      )}

      {manageStorage && (
        <ManageListModal
          listType="storage"
          title="Manage Storage Locations"
          onClose={() => setManageStorage(false)}
          onChange={loadPayments}
        />
      )}

      {manageCustomers && (
        <ManageCustomersModal
          onClose={() => setManageCustomers(false)}
          onChange={loadCustomers}
        />
      )}
    </div>
  )
}

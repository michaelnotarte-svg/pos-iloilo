import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, selectAll } from '../lib/supabase'
import { money } from '../lib/settings'
import { fetchListNames, PAYMENT_FALLBACK, STORAGE_FALLBACK, SALE_TYPE_FALLBACK } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'
import ManageCustomersModal from '../components/ManageCustomersModal'
import SearchSelect from '../components/SearchSelect'
import { useAuth } from '../lib/auth'

const STATUSES = ['Unpaid', 'Partial', 'Paid']

// Invoice filters persist for the browser session, so drilling into an invoice
// and coming back doesn't wipe what you were validating.
const FILTERS_KEY = 'pos.invoiceFilters'
function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY)) || {} } catch { return {} }
}

const LIST_TITLES = {
  payment_method: 'Manage Payment Methods',
  storage: 'Manage Storage Locations',
  sale_type: 'Manage Sale Types',
  sales_person: 'Manage Sales People',
}

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
  sales_person: '',
  notes: '',
}

export default function Invoices() {
  const navigate = useNavigate()
  const { activeLocation, canWrite } = useAuth()
  const canEdit = canWrite('Sales')
  // Filters survive navigating into an invoice and back (kept for the browser session)
  const [saved] = useState(loadSavedFilters)
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(saved.search ?? '')
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter ?? 'All')
  const [dateFrom, setDateFrom] = useState(saved.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(saved.dateTo ?? '')
  const [viewMode, setViewMode] = useState(saved.viewMode ?? 'summary') // 'summary' | 'items'
  const [loadAll, setLoadAll] = useState(saved.loadAll ?? false) // false = last 30 days, true = full history
  const [page, setPage] = useState(saved.page ?? 1)
  const [unpaidKpi, setUnpaidKpi] = useState(null) // server-side total AR (all-time, this branch)
  const PAGE_SIZE = 50
  const recentCutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [custType, setCustType] = useState('Customer') // new-invoice filter
  const [typeView, setTypeView] = useState(saved.typeView ?? 'Both') // list filter
  const [saleTypeFilter, setSaleTypeFilter] = useState(saved.saleTypeFilter ?? 'All')
  const anyFilter = !!search || statusFilter !== 'All' || !!dateFrom || !!dateTo || typeView !== 'Both' || saleTypeFilter !== 'All'
  function resetFilters() { setSearch(''); setStatusFilter('All'); setDateFrom(''); setDateTo(''); setTypeView('Both'); setSaleTypeFilter('All') }
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [paymentOptions, setPaymentOptions] = useState(PAYMENT_FALLBACK)
  const [storageOptions, setStorageOptions] = useState(STORAGE_FALLBACK)
  const [saleTypeOptions, setSaleTypeOptions] = useState(SALE_TYPE_FALLBACK)
  const [salesPersonOptions, setSalesPersonOptions] = useState([])
  const [manageList, setManageList] = useState(null) // 'payment_method' | 'storage' | 'sale_type' | 'sales_person'
  const [manageCustomers, setManageCustomers] = useState(false)

  useEffect(() => { fetchAll(); loadLists() }, [activeLocation, loadAll, dateFrom, dateTo])
  // Always-accurate AR for the branch (independent of the load window)
  useEffect(() => {
    supabase.rpc('unpaid_summary', { p_location: activeLocation }).then(({ data }) => setUnpaidKpi(data || null))
  }, [activeLocation])
  // Reset to the first page whenever the view or filters change — but not on the
  // first render, or we'd clobber the page restored from the saved filters.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    setPage(1)
  }, [search, statusFilter, typeView, saleTypeFilter, dateFrom, dateTo, viewMode, loadAll])

  // Remember the filters for this session
  useEffect(() => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
      search, statusFilter, typeView, saleTypeFilter, dateFrom, dateTo, viewMode, loadAll, page,
    }))
  }, [search, statusFilter, typeView, saleTypeFilter, dateFrom, dateTo, viewMode, loadAll, page])

  async function loadLists() {
    setPaymentOptions(await fetchListNames('payment_method', PAYMENT_FALLBACK))
    setStorageOptions(await fetchListNames('storage', STORAGE_FALLBACK, activeLocation))
    setSaleTypeOptions(await fetchListNames('sale_type', SALE_TYPE_FALLBACK))
    setSalesPersonOptions(await fetchListNames('sales_person', [], activeLocation))
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('id, business_name, display_name, type').eq('location', activeLocation).order('business_name')
    setCustomers(data ?? [])
  }

  async function fetchAll() {
    setLoading(true)
    const sel = '*, customers(business_name, display_name, type), invoice_lines(amount, boxes, kilos, batch_number, items(name)), partial_payments(amount_paid)'
    // Narrow on the SERVER: an explicit date range wins; otherwise last 30 days
    // unless "Show all" is on. selectAll() pages past the 1000-row cap as needed.
    const base = () => {
      let q = supabase.from('invoices').select(sel).eq('location', activeLocation).order('date', { ascending: false })
      if (dateFrom) q = q.gte('date', dateFrom)
      if (dateTo) q = q.lte('date', dateTo)
      if (!dateFrom && !dateTo && !loadAll) q = q.gte('date', recentCutoff)
      return q
    }
    const invP = selectAll(base)
    const [invData, { data: custData }] = await Promise.all([
      invP,
      supabase.from('customers').select('id, business_name, display_name, type').eq('location', activeLocation).order('business_name'),
    ])
    setInvoices(invData ?? [])
    setCustomers(custData ?? [])
    setLoading(false)
  }

  const grandTotal = (inv) =>
    (inv.invoice_lines ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const paidOf = (inv) =>
    (inv.partial_payments ?? []).reduce((s, p) => s + (Number(p.amount_paid) || 0), 0)
  const balanceOf = (inv) => grandTotal(inv) - paidOf(inv)
  const derivedStatus = (inv) => {
    const total = grandTotal(inv), paid = paidOf(inv)
    if (total - paid <= 0.01) return 'Paid' // nothing outstanding (incl. ₱0 owner's-draw/BN)
    return paid > 0.01 ? 'Partial' : 'Unpaid'
  }

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase()
    const matchSearch =
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customers?.business_name?.toLowerCase().includes(q) ||
      inv.customers?.display_name?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'All' || derivedStatus(inv) === statusFilter
    const matchDate = (!dateFrom || inv.date >= dateFrom) && (!dateTo || inv.date <= dateTo)
    const matchType = typeView === 'Both' || (inv.customers?.type ?? 'Customer') === typeView
    const matchSaleType = saleTypeFilter === 'All' || inv.sale_type === saleTypeFilter
    return matchSearch && matchStatus && matchDate && matchType && matchSaleType
  })

  // KPIs over the filtered set — outstanding = Unpaid + Partial balances
  const outstanding = filtered.filter((inv) => balanceOf(inv) > 1e-9)
  const kpiUnpaidCount = outstanding.length
  const kpiUnpaidAmount = outstanding.reduce((s, inv) => s + balanceOf(inv), 0)

  // Prefer the server-side AR total; fall back to the windowed calc if the RPC isn't available yet
  const uCount = unpaidKpi ? Number(unpaidKpi.count) : kpiUnpaidCount
  const uAmount = unpaidKpi ? Number(unpaidKpi.amount) : kpiUnpaidAmount

  // ── Totals for the filtered set (shown above the list) ──
  const kilosOf = (inv) => (inv.invoice_lines ?? []).reduce((s, l) => s + (Number(l.kilos) || 0), 0)
  const boxesOf = (inv) => (inv.invoice_lines ?? []).reduce((s, l) => s + (Number(l.boxes) || 0), 0)
  const totals = filtered.reduce(
    (a, inv) => {
      a.count++
      a.kilos += kilosOf(inv)
      a.boxes += boxesOf(inv)
      a.amount += grandTotal(inv)
      a.paid += paidOf(inv)
      return a
    },
    { count: 0, kilos: 0, boxes: 0, amount: 0, paid: 0 }
  )
  // Breakout per sale type
  const byType = {}
  for (const inv of filtered) {
    const t = inv.sale_type || '—'
    const b = byType[t] || (byType[t] = { count: 0, kilos: 0, boxes: 0, amount: 0 })
    b.count++
    b.kilos += kilosOf(inv)
    b.boxes += boxesOf(inv)
    b.amount += grandTotal(inv)
  }
  const typeRows = Object.entries(byType).sort((a, b) => b[1].amount - a[1].amount)
  const nfx = (n, d = 2) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })

  // Client-side pagination of the rendered list
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.invoice_number.trim()) { setError('Invoice # is required.'); return }
    if (!form.customer_id) { setError('A customer is required.'); return }
    if (!form.date) { setError('Date is required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      invoice_number: form.invoice_number.trim(),
      location: activeLocation,
      customer_id: form.customer_id,
      date: form.date,
      storage: form.storage,
      sale_type: form.sale_type,
      sales_person: form.sales_person || null,
      status: 'Unpaid',
      notes: form.notes?.trim() || null,
    }
    const { data, error: err } = await supabase.from('invoices').insert(payload).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setModalOpen(false)
    navigate(`/invoices/${data.id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Invoices</h1>
        {canEdit && (
        <button
          onClick={() => { setForm(EMPTY_FORM); setError(''); setModalOpen(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + New Invoice
        </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Unpaid Invoices</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{uCount}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Unpaid + Partial · all-time</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Unpaid Amount</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{money(uAmount)}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Outstanding balance · all-time</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by invoice # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-44 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          value={typeView}
          onChange={(e) => setTypeView(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Both">Customer + BN</option>
          <option value="Customer">Customer only</option>
          <option value="BN">BN only</option>
        </select>
        <select
          value={saleTypeFilter}
          onChange={(e) => setSaleTypeFilter(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All Sale Types</option>
          {saleTypeOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-blue-600 hover:underline">clear</button>}
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          {[['summary', 'Summary'], ['items', 'Items']].map(([v, label]) => (
            <button key={v} onClick={() => setViewMode(v)} className={`px-3 py-2 text-sm font-medium ${viewMode === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>{label}</button>
          ))}
        </div>
        {anyFilter && <button onClick={resetFilters} className="text-xs text-blue-600 hover:underline self-center">Reset filters</button>}
        <div className="flex items-center gap-2 text-xs self-center ml-auto">
          <span className="text-gray-400 dark:text-gray-500">{(dateFrom || dateTo) ? 'Selected range' : loadAll ? 'All history' : 'Last 30 days'}{!loading && ` · ${filtered.length}`}</span>
          <button onClick={() => setLoadAll((v) => !v)} className="text-blue-600 hover:underline">{loadAll ? 'Show recent' : 'Show all'}</button>
        </div>
      </div>

      {/* Totals for the filtered set */}
      {!loading && filtered.length > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-700">
            <Tot label="Invoices" value={totals.count.toLocaleString()} />
            <Tot label="Total Kilos" value={nfx(totals.kilos)} />
            <Tot label="Total Boxes" value={nfx(totals.boxes, 0)} />
            <Tot label="Total Invoice" value={money(totals.amount)} />
            <Tot label="Total Paid" value={money(totals.paid)} accent="text-green-600 dark:text-green-400" />
            <Tot label="Balance" value={money(totals.amount - totals.paid)} accent="text-red-600 dark:text-red-400" />
          </div>
          {typeRows.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Breakout by sale type</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-400 dark:text-gray-500">
                    <tr>
                      <th className="text-left font-medium py-1">Type</th>
                      <th className="text-right font-medium py-1">Invoices</th>
                      <th className="text-right font-medium py-1">Kilos</th>
                      <th className="text-right font-medium py-1">Boxes</th>
                      <th className="text-right font-medium py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {typeRows.map(([t, b]) => (
                      <tr key={t}>
                        <td className="py-1.5 text-gray-700 dark:text-gray-200">{t}</td>
                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-300">{b.count.toLocaleString()}</td>
                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-300">{nfx(b.kilos)}</td>
                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-300">{nfx(b.boxes, 0)}</td>
                        <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-200">{money(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
          {!dateFrom && !dateTo && !loadAll
            ? 'No invoices in the last 30 days — pick a date range above, or choose “Show all”.'
            : 'No invoices found.'}
        </p>
      ) : viewMode === 'items' ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Item</th>
                <th className="text-left px-4 py-3">Batch(es)</th>
                <th className="text-right px-4 py-3">Boxes</th>
                <th className="text-right px-4 py-3">Kilos</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {pageRows.flatMap((inv) => {
                const cust = inv.customers ? (inv.customers.display_name || inv.customers.business_name) : 'Walk-in'
                const lines = inv.invoice_lines ?? []
                if (lines.length === 0) return [(
                  <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="hover:bg-blue-50 dark:hover:bg-gray-700/40 cursor-pointer border-t-2 border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-2.5 font-medium text-blue-700">{inv.invoice_number}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{inv.date}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{cust}</td>
                    <td colSpan={5} className="px-4 py-2.5 text-gray-400 dark:text-gray-500 italic">no items</td>
                  </tr>
                )]
                return lines.map((l, idx) => (
                  <tr key={inv.id + '-' + idx} onClick={() => navigate(`/invoices/${inv.id}`)} className={`hover:bg-blue-50 dark:hover:bg-gray-700/40 cursor-pointer ${idx === 0 ? 'border-t-2 border-gray-200 dark:border-gray-700' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-blue-700">{idx === 0 ? inv.invoice_number : ''}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{idx === 0 ? inv.date : ''}</td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{idx === 0 ? cust : ''}</td>
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-100">{l.items?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">{l.batch_number}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{l.boxes != null ? Number(l.boxes).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{Number(l.kilos).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-gray-100">{money(l.amount)}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
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
                <th className="text-right px-4 py-3">Payment</th>
                <th className="text-right px-4 py-3">Balance</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {pageRows.map((inv) => {
                const total = grandTotal(inv), paid = paidOf(inv), bal = total - paid
                const st = derivedStatus(inv)
                return (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="hover:bg-blue-50 dark:hover:bg-gray-700/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{inv.date}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{inv.customers ? (inv.customers.display_name || inv.customers.business_name) : <span className="text-gray-400 dark:text-gray-500 italic">Walk-in</span>}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{inv.sale_type}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-100">{money(total)}</td>
                  <td className="px-4 py-3 text-right text-green-700 dark:text-green-400">{paid > 0 ? money(paid) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-medium ${bal > 1e-9 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{money(bal)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[st]}`}>
                      {st}
                    </span>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-gray-400 dark:text-gray-500 text-xs">
            {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700/40">←</button>
            <span className="px-2 text-gray-500 dark:text-gray-400 text-xs">Page {pageSafe} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700/40">→</button>
          </div>
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

              {/* Customer type — promoted to top; switches the dropdown below */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Type</label>
                <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  {['Customer', 'BN'].map((t) => (
                    <button type="button" key={t} onClick={() => { setCustType(t); set('customer_id', '') }} className={`px-5 py-1.5 text-sm font-medium ${custType === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>{t}</button>
                  ))}
                </div>
                {custType === 'BN' && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Owner's draw / internal — prices are optional on line items.</p>}
              </div>

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
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Customer *</label>
                  <button type="button" onClick={() => setManageCustomers(true)} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                </div>
                <SearchSelect
                  value={form.customer_id}
                  onChange={(id) => set('customer_id', id)}
                  options={customers
                    .filter((c) => (c.type ?? 'Customer') === custType)
                    .map((c) => ({ id: c.id, label: c.display_name || c.business_name }))}
                  placeholder={`Type to search ${custType === 'BN' ? 'BN' : 'customers'}…`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Warehouse *</label>
                  <button type="button" onClick={() => setManageList('storage')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Sale Type</label>
                    <button type="button" onClick={() => setManageList('sale_type')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                  </div>
                  <select
                    value={form.sale_type}
                    onChange={(e) => set('sale_type', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {saleTypeOptions.map((s) => <option key={s}>{s}</option>)}
                    {form.sale_type && !saleTypeOptions.includes(form.sale_type) && <option>{form.sale_type}</option>}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Sales Person</label>
                    <button type="button" onClick={() => setManageList('sales_person')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                  </div>
                  <select
                    value={form.sales_person}
                    onChange={(e) => set('sales_person', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— None —</option>
                    {salesPersonOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-500">New invoices start as Unpaid. Status updates automatically as payments are recorded.</p>

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

      {manageList && (
        <ManageListModal
          listType={manageList}
          title={LIST_TITLES[manageList] ?? 'Manage List'}
          onClose={() => setManageList(null)}
          onChange={loadLists}
        />
      )}

      {manageCustomers && (
        <ManageCustomersModal
          defaultType={custType}
          onClose={() => setManageCustomers(false)}
          onChange={async (newId) => {
            await loadCustomers()
            if (newId) set('customer_id', newId) // auto-select the one just added
          }}
        />
      )}
    </div>
  )
}

// One tile in the totals strip above the invoice list
function Tot({ label, value, accent }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${accent || 'text-gray-800 dark:text-gray-100'}`}>{value}</p>
    </div>
  )
}

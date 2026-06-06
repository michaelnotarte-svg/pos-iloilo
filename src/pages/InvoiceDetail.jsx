import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchListNames, STORAGE_FALLBACK, PAYMENT_FALLBACK } from '../lib/lists'
import ManageListModal from '../components/ManageListModal'

const SALE_TYPES = ['Walk-in', 'Delivery', 'Out-of-Town']
const STATUSES = ['Unpaid', 'Partial', 'Paid']

const STATUS_STYLE = {
  Paid: 'bg-green-100 text-green-700',
  Unpaid: 'bg-red-100 text-red-700',
  Partial: 'bg-yellow-100 text-yellow-700',
}

const EMPTY_LINE = {
  item_id: '',
  storage: 'Everest',
  batch_number: '',
  unit_price: '',
  boxes: '',
  kilos: '',
}

const EMPTY_PAYMENT = {
  amount_paid: '',
  date_paid: new Date().toISOString().slice(0, 10),
  mode_of_payment: 'Cash',
  deposit_date: '',
  remaining_balance: '',
}

function fmt(n) {
  return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [inv, setInv] = useState(null)
  const [lines, setLines] = useState([])
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // Header edit
  const [editingHeader, setEditingHeader] = useState(false)
  const [headerForm, setHeaderForm] = useState({})
  const [savingHeader, setSavingHeader] = useState(false)

  // Line modal
  const [lineModal, setLineModal] = useState(false)
  const [lineForm, setLineForm] = useState(EMPTY_LINE)
  const [editLineId, setEditLineId] = useState(null)
  const [savingLine, setSavingLine] = useState(false)
  const [lineError, setLineError] = useState('')
  const [deleteLineTarget, setDeleteLineTarget] = useState(null)

  // Payment modal
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState(EMPTY_PAYMENT)
  const [editPayId, setEditPayId] = useState(null)
  const [savingPay, setSavingPay] = useState(false)
  const [payError, setPayError] = useState('')
  const [deletePayTarget, setDeletePayTarget] = useState(null)

  const [deleteInvConfirm, setDeleteInvConfirm] = useState(false)

  const [storageOptions, setStorageOptions] = useState(STORAGE_FALLBACK)
  const [paymentOptions, setPaymentOptions] = useState(PAYMENT_FALLBACK)
  const [manageList, setManageList] = useState(null) // 'storage' | 'payment_method' | null

  useEffect(() => { fetchAll(); loadLists() }, [id])

  async function loadLists() {
    setStorageOptions(await fetchListNames('storage', STORAGE_FALLBACK))
    setPaymentOptions(await fetchListNames('payment_method', PAYMENT_FALLBACK))
  }

  async function fetchAll() {
    setLoading(true)
    const [{ data: invData }, { data: linesData }, { data: paymentsData }, { data: custData }, { data: itemsData }] =
      await Promise.all([
        supabase.from('invoices').select('*, customers(business_name, display_name)').eq('id', id).single(),
        supabase.from('invoice_lines').select('*, items(name)').eq('invoice_id', id).order('created_at'),
        supabase.from('partial_payments').select('*').eq('invoice_id', id).order('date_paid'),
        supabase.from('customers').select('id, business_name, display_name').order('business_name'),
        supabase.from('items').select('id, name').order('name'),
      ])
    setInv(invData)
    setHeaderForm({
      invoice_number: invData?.invoice_number ?? '',
      customer_id: invData?.customer_id ?? '',
      date: invData?.date ?? '',
      sale_type: invData?.sale_type ?? 'Walk-in',
      status: invData?.status ?? 'Unpaid',
    })
    setLines(linesData ?? [])
    setPayments(paymentsData ?? [])
    setCustomers(custData ?? [])
    setItems(itemsData ?? [])
    setLoading(false)
  }

  // ── Header ───────────────────────────────────────────────
  async function saveHeader(e) {
    e.preventDefault()
    setSavingHeader(true)
    await supabase.from('invoices').update({
      invoice_number: headerForm.invoice_number,
      customer_id: headerForm.customer_id || null,
      date: headerForm.date,
      sale_type: headerForm.sale_type,
      status: headerForm.status,
    }).eq('id', id)
    setSavingHeader(false)
    setEditingHeader(false)
    fetchAll()
  }

  // ── Lines ─────────────────────────────────────────────────
  function openAddLine() {
    setLineForm(EMPTY_LINE)
    setEditLineId(null)
    setLineError('')
    setLineModal(true)
  }

  function openEditLine(l) {
    setLineForm({
      item_id: l.item_id,
      storage: l.storage,
      batch_number: l.batch_number,
      unit_price: l.unit_price,
      boxes: l.boxes ?? '',
      kilos: l.kilos,
    })
    setEditLineId(l.id)
    setLineError('')
    setLineModal(true)
  }

  async function saveLine(e) {
    e.preventDefault()
    if (!lineForm.item_id) { setLineError('Select an item.'); return }
    if (!lineForm.batch_number.trim()) { setLineError('Batch # is required.'); return }
    if (!lineForm.unit_price || !lineForm.kilos) { setLineError('Unit price and kilos are required.'); return }
    setSavingLine(true)
    setLineError('')
    const payload = {
      invoice_id: id,
      item_id: lineForm.item_id,
      storage: lineForm.storage,
      batch_number: lineForm.batch_number.trim(),
      unit_price: Number(lineForm.unit_price),
      boxes: lineForm.boxes ? Number(lineForm.boxes) : null,
      kilos: Number(lineForm.kilos),
    }
    let err
    if (editLineId) {
      ;({ error: err } = await supabase.from('invoice_lines').update(payload).eq('id', editLineId))
    } else {
      ;({ error: err } = await supabase.from('invoice_lines').insert(payload))
    }
    setSavingLine(false)
    if (err) { setLineError(err.message); return }
    setLineModal(false)
    fetchAll()
  }

  async function deleteLine() {
    if (!deleteLineTarget) return
    await supabase.from('invoice_lines').delete().eq('id', deleteLineTarget.id)
    setDeleteLineTarget(null)
    fetchAll()
  }

  // ── Payments ──────────────────────────────────────────────
  function openAddPayment() {
    const remaining = totalAmount - totalPaid
    setPayForm({ ...EMPTY_PAYMENT, remaining_balance: remaining > 0 ? fmt(remaining).replace(/,/g, '') : '0' })
    setEditPayId(null)
    setPayError('')
    setPayModal(true)
  }

  function openEditPayment(p) {
    setPayForm({
      amount_paid: p.amount_paid,
      date_paid: p.date_paid,
      mode_of_payment: p.mode_of_payment,
      deposit_date: p.deposit_date ?? '',
      remaining_balance: p.remaining_balance ?? '',
    })
    setEditPayId(p.id)
    setPayError('')
    setPayModal(true)
  }

  async function savePayment(e) {
    e.preventDefault()
    if (!payForm.amount_paid) { setPayError('Amount is required.'); return }
    setSavingPay(true)
    setPayError('')
    const payload = {
      invoice_id: id,
      amount_paid: Number(payForm.amount_paid),
      date_paid: payForm.date_paid,
      mode_of_payment: payForm.mode_of_payment,
      deposit_date: payForm.deposit_date || null,
      remaining_balance: payForm.remaining_balance ? Number(payForm.remaining_balance) : null,
    }
    let err
    if (editPayId) {
      ;({ error: err } = await supabase.from('partial_payments').update(payload).eq('id', editPayId))
    } else {
      ;({ error: err } = await supabase.from('partial_payments').insert(payload))
    }
    setSavingPay(false)
    if (err) { setPayError(err.message); return }
    setPayModal(false)
    fetchAll()
  }

  async function deletePayment() {
    if (!deletePayTarget) return
    await supabase.from('partial_payments').delete().eq('id', deletePayTarget.id)
    setDeletePayTarget(null)
    fetchAll()
  }

  async function deleteInvoice() {
    await supabase.from('invoices').delete().eq('id', id)
    navigate('/invoices')
  }

  // ── Totals ────────────────────────────────────────────────
  const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0)
  const balance = totalAmount - totalPaid

  if (loading) return <p className="text-sm text-gray-400 text-center py-20">Loading…</p>
  if (!inv) return <p className="text-sm text-red-400 text-center py-20">Invoice not found.</p>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => navigate('/invoices')} className="text-sm text-blue-600 hover:underline">
        ← Back to Invoices
      </button>

      {/* ── Invoice Header ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Invoice <span className="text-blue-700">#{inv.invoice_number}</span>
            </h2>
            {!editingHeader && (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[inv.status]}`}>
                {inv.status}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!editingHeader && (
              <>
                <button onClick={() => setEditingHeader(true)} className="text-sm text-blue-600 hover:underline">Edit</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setDeleteInvConfirm(true)} className="text-sm text-red-500 hover:underline">Delete</button>
              </>
            )}
          </div>
        </div>

        {editingHeader ? (
          <form onSubmit={saveHeader} className="px-6 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Invoice #" value={headerForm.invoice_number} onChange={(v) => setHeaderForm({ ...headerForm, invoice_number: v })} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={headerForm.date} onChange={(e) => setHeaderForm({ ...headerForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
              <select value={headerForm.customer_id} onChange={(e) => setHeaderForm({ ...headerForm, customer_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Walk-in —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.business_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sale Type</label>
                <select value={headerForm.sale_type} onChange={(e) => setHeaderForm({ ...headerForm, sale_type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {SALE_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={headerForm.status} onChange={(e) => setHeaderForm({ ...headerForm, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingHeader} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {savingHeader ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingHeader(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-sm">
            <InfoRow label="Date" value={inv.date} />
            <InfoRow label="Customer" value={inv.customers ? (inv.customers.display_name || inv.customers.business_name) : 'Walk-in'} />
            <InfoRow label="Sale Type" value={inv.sale_type} />
            <InfoRow label="Status" value={inv.status} />
          </div>
        )}
      </div>

      {/* ── Line Items ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Line Items</h3>
          <button onClick={openAddLine} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            + Add Item
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-left px-4 py-3">Batch #</th>
                  <th className="text-left px-4 py-3">Storage</th>
                  <th className="text-right px-4 py-3">Boxes</th>
                  <th className="text-right px-4 py-3">Kilos</th>
                  <th className="text-right px-4 py-3">Unit Price</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{l.items?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{l.batch_number}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${l.storage === 'Everest' ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
                        {l.storage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{l.boxes != null ? Number(l.boxes).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(l.kilos)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">₱{fmt(l.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">₱{fmt(l.amount)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEditLine(l)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                      <button onClick={() => setDeleteLineTarget(l)} className="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-700 text-sm">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right text-xs uppercase text-gray-500 tracking-wide">Invoice Total</td>
                  <td className="px-4 py-3 text-right text-gray-900">₱{fmt(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Payments / AR ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Payments</h3>
          </div>
          <button onClick={openAddPayment} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            + Add Payment
          </button>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="text-left px-4 py-3">Date Paid</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Deposit Date</th>
                  <th className="text-right px-4 py-3">Amount Paid</th>
                  <th className="text-right px-4 py-3">Remaining</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{p.date_paid}</td>
                    <td className="px-4 py-3 text-gray-600">{p.mode_of_payment}</td>
                    <td className="px-4 py-3 text-gray-500">{p.deposit_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">₱{fmt(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.remaining_balance != null ? `₱${fmt(p.remaining_balance)}` : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEditPayment(p)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                      <button onClick={() => setDeletePayTarget(p)} className="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Running balance footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-10 text-sm">
          <span className="text-gray-500">Total Paid: <span className="font-semibold text-gray-800">₱{fmt(totalPaid)}</span></span>
          <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            Balance: ₱{fmt(balance)}
          </span>
        </div>
      </div>

      {/* ── Line Item Modal ── */}
      {lineModal && (
        <Modal title={editLineId ? 'Edit Line Item' : 'Add Line Item'} onClose={() => setLineModal(false)}>
          <form onSubmit={saveLine} className="space-y-3">
            {lineError && <p className="text-red-500 text-xs">{lineError}</p>}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Item *</label>
              <select value={lineForm.item_id} onChange={(e) => setLineForm({ ...lineForm, item_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select item…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Storage *</label>
                  <button type="button" onClick={() => setManageList('storage')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                </div>
                <select value={lineForm.storage} onChange={(e) => setLineForm({ ...lineForm, storage: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {storageOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <F label="Batch # *" value={lineForm.batch_number} onChange={(v) => setLineForm({ ...lineForm, batch_number: v })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <F label="Boxes" value={lineForm.boxes} onChange={(v) => setLineForm({ ...lineForm, boxes: v })} type="number" />
              <F label="Kilos *" value={lineForm.kilos} onChange={(v) => setLineForm({ ...lineForm, kilos: v })} type="number" />
              <F label="Unit Price *" value={lineForm.unit_price} onChange={(v) => setLineForm({ ...lineForm, unit_price: v })} type="number" />
            </div>
            {lineForm.kilos && lineForm.unit_price && (
              <p className="text-xs text-gray-500 text-right">
                Amount: <span className="font-semibold text-gray-800">₱{fmt(Number(lineForm.kilos) * Number(lineForm.unit_price))}</span>
              </p>
            )}
            <ModalActions onCancel={() => setLineModal(false)} saving={savingLine} />
          </form>
        </Modal>
      )}

      {/* ── Payment Modal ── */}
      {payModal && (
        <Modal title={editPayId ? 'Edit Payment' : 'Add Payment'} onClose={() => setPayModal(false)}>
          <form onSubmit={savePayment} className="space-y-3">
            {payError && <p className="text-red-500 text-xs">{payError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <F label="Amount Paid *" value={payForm.amount_paid} onChange={(v) => setPayForm({ ...payForm, amount_paid: v })} type="number" />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date Paid</label>
                <input type="date" value={payForm.date_paid} onChange={(e) => setPayForm({ ...payForm, date_paid: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">Mode of Payment</label>
                <button type="button" onClick={() => setManageList('payment_method')} className="text-[11px] text-blue-600 hover:underline">Manage</button>
              </div>
              <select value={payForm.mode_of_payment} onChange={(e) => setPayForm({ ...payForm, mode_of_payment: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {paymentOptions.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deposit Date</label>
                <input type="date" value={payForm.deposit_date} onChange={(e) => setPayForm({ ...payForm, deposit_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <F label="Remaining Balance" value={payForm.remaining_balance} onChange={(v) => setPayForm({ ...payForm, remaining_balance: v })} type="number" />
            </div>
            <ModalActions onCancel={() => setPayModal(false)} saving={savingPay} />
          </form>
        </Modal>
      )}

      {/* ── Confirm Dialogs ── */}
      {deleteLineTarget && (
        <Confirm
          title="Delete line item?"
          message={`${deleteLineTarget.items?.name} — Batch ${deleteLineTarget.batch_number} will be removed.`}
          onCancel={() => setDeleteLineTarget(null)}
          onConfirm={deleteLine}
        />
      )}
      {deletePayTarget && (
        <Confirm
          title="Delete payment?"
          message={`₱${fmt(deletePayTarget.amount_paid)} on ${deletePayTarget.date_paid} will be removed.`}
          onCancel={() => setDeletePayTarget(null)}
          onConfirm={deletePayment}
        />
      )}
      {deleteInvConfirm && (
        <Confirm
          title="Delete this invoice?"
          message={`Invoice #${inv.invoice_number} and all its lines and payments will be permanently deleted.`}
          onCancel={() => setDeleteInvConfirm(false)}
          onConfirm={deleteInvoice}
          destructive
        />
      )}

      {manageList && (
        <ManageListModal
          listType={manageList}
          title={manageList === 'storage' ? 'Manage Storage Locations' : 'Manage Payment Methods'}
          onClose={() => setManageList(null)}
          onChange={loadLists}
        />
      )}
    </div>
  )
}

// ── Shared small components ───────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <p className="text-gray-800 mt-0.5">{value ?? '—'}</p>
    </div>
  )
}

function F({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onCancel, saving }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function Confirm({ title, message, onCancel, onConfirm, destructive = true }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={onConfirm} className={`text-white text-sm font-medium px-4 py-2 rounded-lg ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

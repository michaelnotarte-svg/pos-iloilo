import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STORAGE_OPTIONS = ['Everest', 'FishingPort']

const EMPTY_LINE = {
  item_id: '',
  storage: 'Everest',
  batch_number: '',
  boxes: '',
  kilos: '',
  date: new Date().toISOString().slice(0, 10),
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [po, setPo] = useState(null)
  const [lines, setLines] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  // PO header edit
  const [editingHeader, setEditingHeader] = useState(false)
  const [headerForm, setHeaderForm] = useState({})
  const [savingHeader, setSavingHeader] = useState(false)

  // Line item modal
  const [lineModal, setLineModal] = useState(false)
  const [lineForm, setLineForm] = useState(EMPTY_LINE)
  const [editLineId, setEditLineId] = useState(null)
  const [savingLine, setSavingLine] = useState(false)
  const [lineError, setLineError] = useState('')

  const [deleteLineTarget, setDeleteLineTarget] = useState(null)
  const [deletePOConfirm, setDeletePOConfirm] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: poData }, { data: linesData }, { data: itemsData }] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', id).single(),
      supabase
        .from('stock_entries')
        .select('*, items(name, unit)')
        .eq('po_id', id)
        .order('created_at'),
      supabase.from('items').select('id, name, unit').order('name'),
    ])
    setPo(poData)
    setHeaderForm({
      po_number: poData?.po_number ?? '',
      date: poData?.date ?? '',
      supplier: poData?.supplier ?? '',
      source: poData?.source ?? '',
      category: poData?.category ?? '',
      notes: poData?.notes ?? '',
    })
    setLines(linesData ?? [])
    setItems(itemsData ?? [])
    setLoading(false)
  }

  // ── Header ──────────────────────────────────────────────
  async function saveHeader(e) {
    e.preventDefault()
    setSavingHeader(true)
    await supabase.from('purchase_orders').update({
      po_number: headerForm.po_number,
      date: headerForm.date,
      supplier: headerForm.supplier || null,
      source: headerForm.source || null,
      category: headerForm.category || null,
      notes: headerForm.notes || null,
    }).eq('id', id)
    setSavingHeader(false)
    setEditingHeader(false)
    fetchAll()
  }

  // ── Lines ────────────────────────────────────────────────
  async function openAddLine() {
    setLineForm({ ...EMPTY_LINE, date: po?.date ?? new Date().toISOString().slice(0, 10) })
    setEditLineId(null)
    setLineError('')
    setLineModal(true)
  }

  async function generateBatchNumber(itemId) {
    if (!itemId) return ''
    const { count } = await supabase
      .from('stock_entries')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
    return String((count ?? 0) + 1)
  }

  async function handleItemChange(itemId) {
    const batch = await generateBatchNumber(itemId)
    setLineForm((f) => ({ ...f, item_id: itemId, batch_number: batch }))
  }

  function openEditLine(line) {
    setLineForm({
      item_id: line.item_id,
      storage: line.storage,
      batch_number: line.batch_number,
      boxes: line.boxes ?? '',
      kilos: line.kilos ?? '',
      date: line.date,
    })
    setEditLineId(line.id)
    setLineError('')
    setLineModal(true)
  }

  async function saveLine(e) {
    e.preventDefault()
    if (!lineForm.item_id) { setLineError('Select an item.'); return }
    if (!lineForm.batch_number.trim()) { setLineError('Batch number is required.'); return }
    if (!lineForm.kilos) { setLineError('Kilos is required.'); return }
    setSavingLine(true)
    setLineError('')
    const payload = {
      po_id: id,
      item_id: lineForm.item_id,
      storage: lineForm.storage,
      batch_number: lineForm.batch_number.trim(),
      boxes: lineForm.boxes ? Number(lineForm.boxes) : null,
      kilos: Number(lineForm.kilos),
      date: lineForm.date,
    }
    let err
    if (editLineId) {
      ;({ error: err } = await supabase.from('stock_entries').update(payload).eq('id', editLineId))
    } else {
      ;({ error: err } = await supabase.from('stock_entries').insert(payload))
    }
    setSavingLine(false)
    if (err) { setLineError(err.message); return }
    setLineModal(false)
    fetchAll()
  }

  async function deleteLine() {
    if (!deleteLineTarget) return
    await supabase.from('stock_entries').delete().eq('id', deleteLineTarget.id)
    setDeleteLineTarget(null)
    fetchAll()
  }

  async function deletePO() {
    await supabase.from('purchase_orders').delete().eq('id', id)
    navigate('/inventory')
  }

  // ── Totals ───────────────────────────────────────────────
  const totalBoxes = lines.reduce((s, l) => s + (Number(l.boxes) || 0), 0)
  const totalKilos = lines.reduce((s, l) => s + (Number(l.kilos) || 0), 0)

  if (loading) return <p className="text-sm text-gray-400 text-center py-20">Loading…</p>
  if (!po) return <p className="text-sm text-red-400 text-center py-20">PO not found.</p>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/inventory')} className="text-sm text-blue-600 hover:underline">
        ← Back to Purchase Orders
      </button>

      {/* ── PO Header Card ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            PO # <span className="text-blue-700">{po.po_number}</span>
          </h2>
          <div className="flex gap-2">
            {!editingHeader && (
              <>
                <button
                  onClick={() => setEditingHeader(true)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setDeletePOConfirm(true)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Delete PO
                </button>
              </>
            )}
          </div>
        </div>

        {editingHeader ? (
          <form onSubmit={saveHeader} className="px-6 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <HField label="PO #" value={headerForm.po_number} onChange={(v) => setHeaderForm({ ...headerForm, po_number: v })} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={headerForm.date}
                  onChange={(e) => setHeaderForm({ ...headerForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HField label="Supplier" value={headerForm.supplier} onChange={(v) => setHeaderForm({ ...headerForm, supplier: v })} />
              <HField label="Source" value={headerForm.source} onChange={(v) => setHeaderForm({ ...headerForm, source: v })} />
            </div>
            <HField label="Category" value={headerForm.category} onChange={(v) => setHeaderForm({ ...headerForm, category: v })} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                rows={2}
                value={headerForm.notes}
                onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingHeader} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {savingHeader ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingHeader(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
            <InfoRow label="Date" value={po.date} />
            <InfoRow label="Supplier" value={po.supplier} />
            <InfoRow label="Source" value={po.source} />
            <InfoRow label="Category" value={po.category} />
            {po.notes && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</span>
                <p className="text-gray-700 mt-0.5">{po.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Stock Entries ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Stock Entries</h3>
          <button
            onClick={openAddLine}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + Add Item
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No items yet. Add the first one.</p>
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
                  <th className="text-left px-4 py-3">Date</th>
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
                    <td className="px-4 py-3 text-right text-gray-700">{l.boxes != null ? Number(l.boxes).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{Number(l.kilos).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                    <td className="px-4 py-3 text-gray-500">{l.date}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEditLine(l)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                      <button onClick={() => setDeleteLineTarget(l)} className="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 text-sm font-semibold text-gray-700 border-t border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase text-gray-500 tracking-wide">Totals</td>
                  <td className="px-4 py-3 text-right">{totalBoxes.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totalKilos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Line Item Modal ── */}
      {lineModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{editLineId ? 'Edit Stock Entry' : 'Add Stock Entry'}</h2>
              <button onClick={() => setLineModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={saveLine} className="px-6 py-4 space-y-3">
              {lineError && <p className="text-red-500 text-xs">{lineError}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Item *</label>
                <select
                  value={lineForm.item_id}
                  onChange={(e) => handleItemChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Storage *</label>
                  <select
                    value={lineForm.storage}
                    onChange={(e) => setLineForm({ ...lineForm, storage: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STORAGE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <LField label="Batch # *" value={lineForm.batch_number} onChange={(v) => setLineForm({ ...lineForm, batch_number: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LField label="Boxes" value={lineForm.boxes} onChange={(v) => setLineForm({ ...lineForm, boxes: v })} type="number" />
                <LField label="Kilos *" value={lineForm.kilos} onChange={(v) => setLineForm({ ...lineForm, kilos: v })} type="number" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={lineForm.date}
                  onChange={(e) => setLineForm({ ...lineForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setLineModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button type="submit" disabled={savingLine} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {savingLine ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Line Confirmation */}
      {deleteLineTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Delete this entry?</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{deleteLineTarget.items?.name}</span> — Batch {deleteLineTarget.batch_number} will be removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteLineTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={deleteLine} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete PO Confirmation */}
      {deletePOConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-800 mb-2">Delete this PO?</h2>
            <p className="text-sm text-gray-500 mb-4">
              PO <span className="font-medium text-gray-700">{po.po_number}</span> and all its stock entries will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePOConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={deletePO} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Delete PO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <p className="text-gray-800 mt-0.5">{value ?? '—'}</p>
    </div>
  )
}

function HField({ label, value, onChange }) {
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

function LField({ label, value, onChange, type = 'text' }) {
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

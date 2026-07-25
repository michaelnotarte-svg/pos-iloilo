import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/settings'
import { fetchListNames, STORAGE_FALLBACK, SALE_TYPE_FALLBACK } from '../lib/lists'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/friendlyError'
import SearchSelect from '../components/SearchSelect'
import ManageCustomersModal from '../components/ManageCustomersModal'
import ManageItemsModal from '../components/ManageItemsModal'
import { downscaleImage, parseReceipt } from '../lib/parseReceipt'
import { listDriveReceipts, fetchDriveReceipt, getDriveFolder } from '../lib/driveImport'
import QRCode from 'qrcode'

// Imported lines are not FIFO-allocated (Bacolod inventory isn't maintained), so
// batch_number — which is NOT NULL — gets this marker.
const IMPORT_BATCH = 'IMPORT'
const QA_LOCATION = 'Bacolod' // feature is gated to this branch during QA
const DEFAULT_WH = 'Pta Taytay' // Bacolod's dominant warehouse — prefilled, still editable
const today = () => new Date().toISOString().slice(0, 10)

const num = (v) => (v === '' || v == null ? null : Number(v))

export default function ImportInvoices() {
  const navigate = useNavigate()
  const { activeLocation, canWrite, profile } = useAuth()
  const canEdit = canWrite('Sales')

  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [storageOptions, setStorageOptions] = useState(STORAGE_FALLBACK)
  const [saleTypeOptions, setSaleTypeOptions] = useState(SALE_TYPE_FALLBACK)
  const [salesPersonOptions, setSalesPersonOptions] = useState([])

  const [phase, setPhase] = useState('upload') // 'upload' | 'review'
  const [queue, setQueue] = useState([])       // receipt entries
  const [idx, setIdx] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveMsg, setDriveMsg] = useState('')
  const [showQR, setShowQR] = useState(false)
  const [qr, setQr] = useState(null) // { dataUrl, folderUrl }
  const [manageCustomers, setManageCustomers] = useState(false)
  const [manageItems, setManageItems] = useState(false)
  const fileRef = useRef(null)

  async function loadCustomers(selectId) {
    const { data } = await supabase.from('customers').select('id, business_name, display_name, type')
      .eq('location', activeLocation).order('business_name')
    setCustomers(data ?? [])
    if (selectId) updateForm({ customer_id: selectId })
  }
  async function loadItems() {
    const { data } = await supabase.from('items').select('id, name').eq('location', activeLocation).order('name')
    setItems(data ?? [])
  }

  // Build the phone QR from the branch's Drive folder (generated in-browser).
  useEffect(() => {
    let ok = true
    getDriveFolder()
      .then(async ({ folderUrl }) => {
        const dataUrl = await QRCode.toDataURL(folderUrl, { width: 220, margin: 1 })
        if (ok) setQr({ dataUrl, folderUrl })
      })
      .catch(() => { if (ok) setQr(null) })
    return () => { ok = false }
  }, [activeLocation])

  useEffect(() => {
    let ok = true
    Promise.all([
      supabase.from('items').select('id, name').eq('location', activeLocation).order('name'),
      supabase.from('customers').select('id, business_name, display_name, type').eq('location', activeLocation).order('business_name'),
      fetchListNames('storage', STORAGE_FALLBACK, activeLocation),
      fetchListNames('sale_type', SALE_TYPE_FALLBACK, activeLocation),
      fetchListNames('sales_person', [], activeLocation),
    ]).then(([{ data: it }, { data: cu }, st, sale, sp]) => {
      if (!ok) return
      setItems(it ?? [])
      setCustomers(cu ?? [])
      setStorageOptions(st)
      setSaleTypeOptions(sale)
      setSalesPersonOptions(sp)
    })
    return () => { ok = false }
  }, [activeLocation])

  // Glossary sent to the model + lookup maps to resolve its matches back to ids.
  const custLabel = (c) => c.display_name || c.business_name
  const itemNames = useMemo(() => items.map((i) => i.name), [items])
  const custLabels = useMemo(() => customers.map(custLabel), [customers])
  const itemByName = useMemo(() => new Map(items.map((i) => [i.name, i.id])), [items])
  const custById = useMemo(() => {
    const m = new Map()
    for (const c of customers) {
      m.set(custLabel(c), c.id)
      if (c.business_name) m.set(c.business_name, c.id)
      if (c.display_name) m.set(c.display_name, c.id)
    }
    return m
  }, [customers])

  function toForm(parsed) {
    const matchedId = (parsed.customer_match && custById.get(parsed.customer_match)) || ''
    const matched = customers.find((c) => c.id === matchedId)
    return {
      invoice_number: parsed.invoice_number || '',
      date: parsed.date || today(),
      customer_id: matchedId,
      customer_type: matched?.type === 'BN' ? 'BN' : 'Customer',
      // Sale type / sales person aren't on the receipt — leave blank. Warehouse
      // defaults to the branch's dominant one but stays editable.
      storage: storageOptions.includes(DEFAULT_WH) ? DEFAULT_WH : '',
      sale_type: '',
      sales_person: '',
      notes: '',
      lines: (parsed.lines || []).map((l) => ({
        item_id: (l.item_match && itemByName.get(l.item_match)) || '',
        item_text: l.item_text || '',
        boxes: l.boxes ?? '',
        kilos: l.kilos ?? '',
        unit_price: l.unit_price ?? '',
        parsed_amount: l.amount ?? null,
      })),
      parsed_total: parsed.parsed_total ?? null,
      low_conf: parsed.low_confidence_fields || [],
    }
  }

  function patchEntry(i, patch) {
    setQueue((q) => q.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setQueue(files.map((f) => ({ id: crypto.randomUUID(), fileName: f.name, status: 'parsing', dataUrl: null, form: null, error: '' })))
    setIdx(0)
    setPhase('review')
    for (let i = 0; i < files.length; i++) {
      try {
        const { dataUrl, base64, media_type } = await downscaleImage(files[i])
        patchEntry(i, { dataUrl })
        const parsed = await parseReceipt({ base64, media_type, items: itemNames, customers: custLabels })
        patchEntry(i, { status: 'ready', form: toForm(parsed) })
      } catch (e) {
        patchEntry(i, { status: 'error', error: String(e?.message || e) })
      }
    }
  }

  // Pull new receipts from the shared Google Drive folder. Files already turned
  // into invoices (or skipped) are recorded in drive_imports and won't reappear.
  async function handleDrive() {
    setDriveBusy(true)
    setDriveMsg('Checking Drive…')
    try {
      const [files, { data: done }] = await Promise.all([
        listDriveReceipts(),
        supabase.from('drive_imports').select('file_id').eq('location', activeLocation),
      ])
      const seen = new Set((done ?? []).map((r) => r.file_id))
      const fresh = files.filter((f) => !seen.has(f.id))
      if (!fresh.length) {
        setDriveBusy(false)
        setDriveMsg(files.length ? 'No new receipts in Drive — everything here is already imported.' : 'The Drive folder is empty.')
        return
      }
      setQueue(fresh.map((f) => ({ id: crypto.randomUUID(), driveFileId: f.id, fileName: f.name, status: 'parsing', dataUrl: null, form: null, error: '' })))
      setIdx(0)
      setPhase('review')
      setDriveBusy(false)
      for (let i = 0; i < fresh.length; i++) {
        try {
          const { dataUrl, base64, media_type } = await fetchDriveReceipt(fresh[i].id)
          patchEntry(i, { dataUrl })
          const parsed = await parseReceipt({ base64, media_type, items: itemNames, customers: custLabels })
          patchEntry(i, { status: 'ready', form: toForm(parsed) })
        } catch (e) {
          patchEntry(i, { status: 'error', error: String(e?.message || e) })
        }
      }
    } catch (e) {
      setDriveBusy(false)
      setDriveMsg(`Couldn't reach Drive: ${String(e?.message || e)}`)
    }
  }

  // Remember a Drive file's outcome so a re-pull skips it.
  async function recordDrive(entry, status, invoiceId = null) {
    if (!entry?.driveFileId) return
    await supabase.from('drive_imports').upsert(
      { file_id: entry.driveFileId, file_name: entry.fileName, location: activeLocation, invoice_id: invoiceId, status },
      { onConflict: 'file_id' },
    )
  }

  const cur = queue[idx]
  const isBN = cur?.form?.customer_type === 'BN'
  const savedCount = queue.filter((e) => e.status === 'saved').length
  const skippedCount = queue.filter((e) => e.status === 'skipped').length
  const discardedCount = queue.filter((e) => e.status === 'discarded').length

  function updateForm(patch) { patchEntry(idx, { form: { ...cur.form, ...patch } }) }
  function updateLine(li, patch) {
    updateForm({ lines: cur.form.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) })
  }
  function removeLine(li) { updateForm({ lines: cur.form.lines.filter((_, j) => j !== li) }) }
  function addLine() {
    updateForm({ lines: [...cur.form.lines, { item_id: '', item_text: '(added)', boxes: '', kilos: '', unit_price: '', parsed_amount: null }] })
  }

  // ── Flag foundations (deterministic, form-side) ──
  // Line: does unit_price × kilos reconcile with the amount written on the receipt?
  function lineComputed(l) {
    const k = num(l.kilos), p = num(l.unit_price)
    return k != null && p != null ? k * p : null
  }
  function lineFlag(l) {
    const comp = lineComputed(l)
    if (comp == null || l.parsed_amount == null) return null
    const diff = Math.abs(comp - l.parsed_amount)
    if (diff <= Math.max(0.5, Math.abs(l.parsed_amount) * 0.01)) return null
    return { comp, parsed: l.parsed_amount }
  }
  const computedTotal = cur?.form ? cur.form.lines.reduce((s, l) => s + (lineComputed(l) || 0), 0) : 0
  const totalFlag =
    cur?.form?.parsed_total != null &&
    Math.abs(computedTotal - cur.form.parsed_total) > Math.max(1, Math.abs(cur.form.parsed_total) * 0.01)

  function advance() {
    const next = queue.findIndex((e, j) => j > idx && !['saved', 'skipped', 'discarded'].includes(e.status))
    if (next !== -1) { setIdx(next); setZoom(false); setSaveError('') }
  }

  // Skip = set aside for now. No marker is written, so this receipt returns on the
  // next Drive pull.
  function skip() { patchEntry(idx, { status: 'skipped' }); setSaveError(''); advance() }
  // Discard = not an invoice (junk photo, blurry, dupe). Recorded as processed so
  // it never resurfaces, without creating an invoice.
  async function discard() { await recordDrive(cur, 'discarded'); patchEntry(idx, { status: 'discarded' }); setSaveError(''); advance() }

  async function approve() {
    const f = cur.form
    if (!f.invoice_number.trim()) { setSaveError('Invoice # is required.'); return }
    if (!f.customer_id) { setSaveError('A customer is required.'); return }
    if (!f.storage) { setSaveError('Pick a warehouse.'); return }
    if (!f.sale_type) { setSaveError('Pick a sale type.'); return }
    const lines = f.lines.filter((l) => l.item_id || l.kilos || l.unit_price)
    if (!lines.length) { setSaveError('Add at least one line item.'); return }
    for (const l of lines) {
      if (!l.item_id) { setSaveError('Every line needs a matched item.'); return }
      if (!num(l.kilos)) { setSaveError('Every line needs kilos.'); return }
      if (isBN) {
        if (!num(l.boxes)) { setSaveError('BN entries need boxes on every line.'); return }
      } else if (!num(l.unit_price)) {
        setSaveError('Every line needs a unit price.'); return
      }
    }
    setSaving(true)
    setSaveError('')
    const numTrim = f.invoice_number.trim()
    // Guard against a duplicate invoice number (unique across the system). This
    // catches same-branch dupes early; the unique constraint + friendlyError is
    // the backstop for numbers hidden by RLS (other branch / soft-deleted).
    const { data: dup } = await supabase.from('invoices').select('id').eq('invoice_number', numTrim).limit(1)
    if (dup && dup.length) { setSaving(false); setSaveError(`Invoice # ${numTrim} is already used. Enter a different number.`); return }
    const { data: inv, error: e1 } = await supabase.from('invoices').insert({
      invoice_number: numTrim,
      location: activeLocation,
      customer_id: f.customer_id,
      date: f.date || today(),
      storage: f.storage,
      sale_type: f.sale_type,
      sales_person: f.sales_person || null,
      status: 'Unpaid',
      notes: f.notes?.trim() || null,
    }).select('id').single()
    if (e1) { setSaving(false); setSaveError(friendlyError(e1, { profile, module: 'Sales' })); return }

    const { error: e2 } = await supabase.from('invoice_lines').insert(lines.map((l) => ({
      invoice_id: inv.id,
      item_id: l.item_id,
      storage: f.storage,
      batch_number: IMPORT_BATCH,
      unit_price: isBN ? (num(l.unit_price) ?? 0) : num(l.unit_price),
      boxes: num(l.boxes),
      kilos: num(l.kilos),
    })))
    setSaving(false)
    if (e2) { setSaveError(friendlyError(e2, { profile, module: 'Sales' })); return }
    await recordDrive(cur, 'saved', inv.id)
    patchEntry(idx, { status: 'saved', savedId: inv.id })
    advance()
  }

  // ── Guards ──
  if (activeLocation !== QA_LOCATION) {
    return (
      <Shell>
        <Notice>
          Receipt import is in QA and only available on the <b>{QA_LOCATION}</b> branch.
          Switch branches to try it.
        </Notice>
      </Shell>
    )
  }
  if (!canEdit) {
    return <Shell><Notice>You need the <b>Sales</b> permission to import invoices.</Notice></Shell>
  }

  // ── Upload screen ──
  if (phase === 'upload') {
    return (
      <Shell>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Import from Photos</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Select one or more photos of handwritten sales invoices. Each is read by AI, then you
            confirm the details side-by-side with the photo before it's saved.
          </p>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => fileRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
              Select receipt photos
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
            <button onClick={handleDrive} disabled={driveBusy}
              className="border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50 text-sm font-medium px-5 py-2.5 rounded-lg">
              {driveBusy ? 'Checking Drive…' : 'Pull from Google Drive'}
            </button>
          </div>
          {driveMsg && <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{driveMsg}</p>}

          {qr && (
            <div className="mt-6">
              <button onClick={() => setShowQR((v) => !v)} className="text-sm text-blue-600 hover:underline">
                {showQR ? 'Hide phone QR' : '📱 Scan with phone to upload receipts'}
              </button>
              {showQR && (
                <div className="mt-3 mx-auto max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-5">
                  <div className="flex flex-col sm:flex-row items-center gap-5 text-left">
                    <img src={qr.dataUrl} alt="Drive folder QR" className="w-40 h-40 rounded-lg bg-white p-2 shrink-0" />
                    <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-decimal list-inside">
                      <li>Scan this with your phone's camera.</li>
                      <li>It opens the shared Drive folder — sign in with your work account if asked.</li>
                      <li>Tap <b>+</b> (or Upload) → pick the receipt photos → upload.</li>
                      <li>Back here, click <b>Pull from Google Drive</b> to bring them in for review.</li>
                    </ol>
                  </div>
                  <a href={qr.folderUrl} target="_blank" rel="noreferrer"
                    className="block mt-3 text-[11px] text-blue-600 hover:underline break-all text-center">
                    {qr.folderUrl}
                  </a>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4">
            Photos are read once and never stored — keep your paper copies.
          </p>
        </div>
      </Shell>
    )
  }

  // ── Review screen ──
  return (
    <Shell>
      {/* Progress strip */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {queue.map((e, j) => (
            <button key={e.id} onClick={() => { setIdx(j); setZoom(false); setSaveError('') }}
              title={e.fileName}
              className={`h-7 w-7 rounded-md text-xs font-medium flex items-center justify-center border
                ${j === idx ? 'ring-2 ring-blue-500 ' : ''}
                ${e.status === 'saved' ? 'bg-green-100 text-green-700 border-green-200'
                  : e.status === 'discarded' ? 'bg-rose-50 text-rose-400 border-rose-200 line-through'
                  : e.status === 'skipped' ? 'bg-gray-100 text-gray-400 border-gray-200'
                  : e.status === 'error' ? 'bg-red-100 text-red-600 border-red-200'
                  : e.status === 'parsing' ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-white text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'}`}>
              {e.status === 'parsing' ? '…' : j + 1}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {savedCount} saved · {skippedCount} skipped · {discardedCount} discarded · {queue.length} total
        </div>
      </div>

      {!cur ? (
        <Notice>Nothing selected.</Notice>
      ) : cur.status === 'parsing' ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Reading <b>{cur.fileName}</b>…
        </div>
      ) : cur.status === 'error' ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <p className="text-sm text-red-600 mb-3">Couldn't read {cur.fileName}: {cur.error}</p>
          <button onClick={skip} className="text-sm text-blue-600 hover:underline">Skip this one →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4 items-start">
          {/* LEFT — editable form */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 space-y-3">
            {cur.status === 'saved' && <Banner tone="green">Saved. Move to the next receipt.</Banner>}
            {cur.form.low_conf?.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Model was unsure about: {cur.form.low_conf.join(', ')}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice #" value={cur.form.invoice_number} onChange={(v) => updateForm({ invoice_number: v })} />
              <div>
                <Lbl>Date</Lbl>
                <input type="date" value={cur.form.date} onChange={(e) => updateForm({ date: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Lbl>Customer *</Lbl>
                  <button type="button" onClick={() => setManageCustomers(true)} className="text-[11px] text-blue-600 hover:underline">Manage</button>
                </div>
                <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  {['Customer', 'BN'].map((t) => (
                    <button key={t} type="button"
                      onClick={() => updateForm({ customer_type: t })}
                      className={`px-3 py-0.5 text-[11px] font-medium ${cur.form.customer_type === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <SearchSelect value={cur.form.customer_id} onChange={(v) => updateForm({ customer_id: v })}
                options={customers.filter((c) => (c.type === 'BN' ? 'BN' : 'Customer') === cur.form.customer_type || c.id === cur.form.customer_id).map((c) => ({ id: c.id, label: custLabel(c) }))}
                placeholder={`Type to search ${isBN ? 'BN' : 'customer'} names…`} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Lbl>Warehouse *</Lbl>
                <select value={cur.form.storage} onChange={(e) => updateForm({ storage: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {storageOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Sale Type *</Lbl>
                <select value={cur.form.sale_type} onChange={(e) => updateForm({ sale_type: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {saleTypeOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Sales Person</Lbl>
                <select value={cur.form.sales_person} onChange={(e) => updateForm({ sales_person: e.target.value })} className={inputCls}>
                  <option value="">— None —</option>
                  {salesPersonOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Lines */}
            <div className="flex items-center justify-between">
              <Lbl>Line items</Lbl>
              <button type="button" onClick={() => setManageItems(true)} className="text-[11px] text-blue-600 hover:underline">Manage items</button>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="grid grid-cols-[1fr_60px_70px_70px_84px_28px] gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-900 rounded-t-lg text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span>Item</span><span className="text-right">Boxes</span><span className="text-right">Kilos</span>
                <span className="text-right">Price</span><span className="text-right">Amount</span><span></span>
              </div>
              {cur.form.lines.map((l, li) => {
                const flag = lineFlag(l)
                const comp = lineComputed(l)
                const kb = num(l.boxes) > 0 && num(l.kilos) != null ? num(l.kilos) / num(l.boxes) : null
                return (
                  <div key={li} className={`px-2 py-1.5 border-t border-gray-100 dark:border-gray-700 ${flag ? 'bg-amber-50 dark:bg-amber-500/10' : ''}`}>
                    <div className="grid grid-cols-[1fr_60px_70px_70px_84px_28px] gap-1 items-center">
                      <SearchSelect value={l.item_id} onChange={(v) => updateLine(li, { item_id: v })}
                        options={items.map((i) => ({ id: i.id, label: i.name }))} placeholder="match item…" />
                      <input className={cellCls} type="number" value={l.boxes} onChange={(e) => updateLine(li, { boxes: e.target.value })} />
                      <input className={cellCls} type="number" value={l.kilos} onChange={(e) => updateLine(li, { kilos: e.target.value })} />
                      <input className={cellCls} type="number" value={l.unit_price} onChange={(e) => updateLine(li, { unit_price: e.target.value })} />
                      <span className="text-right text-xs text-gray-700 dark:text-gray-200 tabular-nums">{comp != null ? money(comp) : '—'}</span>
                      <button onClick={() => removeLine(li)} className="text-red-400 hover:text-red-600 text-sm leading-none">&times;</button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate" title={l.item_text}>read: “{l.item_text}”</span>
                      <span className="text-[10px] whitespace-nowrap flex items-center gap-2">
                        {kb != null && <span className="text-gray-500 dark:text-gray-400">{kb.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg/box</span>}
                        {flag && <span className="text-amber-600 dark:text-amber-400">⚠ receipt says {money(flag.parsed)} — verify</span>}
                      </span>
                    </div>
                  </div>
                )
              })}
              <button onClick={addLine} className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700/40 border-t border-gray-100 dark:border-gray-700 rounded-b-lg">
                + Add line
              </button>
            </div>

            {/* Totals */}
            <div className={`flex items-center justify-between text-sm px-1 ${totalFlag ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}`}>
              <span>Computed total: <b className="tabular-nums">{money(computedTotal)}</b></span>
              {cur.form.parsed_total != null && (
                <span>{totalFlag ? '⚠ ' : ''}receipt total: <b className="tabular-nums">{money(cur.form.parsed_total)}</b></span>
              )}
            </div>

            {saveError && <p className="text-red-500 text-xs">{saveError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={approve} disabled={saving || cur.status === 'saved'}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {saving ? 'Saving…' : cur.status === 'saved' ? 'Saved ✓' : 'Approve & Save'}
              </button>
              <button onClick={skip} title="Set aside — returns on the next Drive pull"
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800">Skip</button>
              <button onClick={discard} title="Not an invoice — mark processed so it won't return"
                className="px-4 py-2 text-sm text-rose-600 hover:text-rose-700">Discard</button>
              <button onClick={advance} className="ml-auto text-sm text-blue-600 hover:underline">Next →</button>
            </div>
          </div>

          {/* RIGHT — receipt image */}
          <div className="lg:sticky lg:top-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-2">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{cur.fileName}</span>
                <button onClick={() => setZoom((z) => !z)} className="text-xs text-blue-600 hover:underline">{zoom ? 'Fit' : 'Zoom'}</button>
              </div>
              <div className={`overflow-auto rounded-lg bg-gray-100 dark:bg-gray-900 ${zoom ? 'max-h-[80vh]' : ''}`}>
                {cur.dataUrl
                  ? <img src={cur.dataUrl} alt={cur.fileName} className={zoom ? 'max-w-none w-[150%]' : 'w-full object-contain max-h-[80vh] mx-auto'} />
                  : <div className="h-64 flex items-center justify-center text-sm text-gray-400">loading image…</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {manageCustomers && (
        <ManageCustomersModal
          defaultType={cur?.form?.customer_type || 'Customer'}
          onClose={() => setManageCustomers(false)}
          onChange={(newId) => loadCustomers(newId)}
        />
      )}
      {manageItems && (
        <ManageItemsModal
          onClose={() => setManageItems(false)}
          onChange={() => loadItems()}
        />
      )}
    </Shell>
  )
}

function Shell({ children }) {
  const navigate = useNavigate()
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button onClick={() => navigate('/invoices')} className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Back to Invoices</button>
      {children}
    </div>
  )
}

// ── small bits ──
const inputCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500'
const cellCls = 'w-full border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs text-right bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500'
function Lbl({ children }) { return <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{children}</label> }
function Field({ label, value, onChange }) {
  return <div><Lbl>{label}</Lbl><input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>
}
function Notice({ children }) {
  return <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-400">{children}</div>
}
function Banner({ tone, children }) {
  const t = tone === 'green' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300' : 'bg-blue-50 text-blue-700 border-blue-200'
  return <div className={`text-xs px-3 py-2 rounded-lg border ${t}`}>{children}</div>
}

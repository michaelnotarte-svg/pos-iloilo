import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { money, getThresholds, stockStatus } from '../lib/settings'
import { fetchMovements } from '../lib/inventory'

const num = (x) => Number(x) || 0
const kg = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
const COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ef4444']

function monthKey(d) { return (d || '').slice(0, 7) }
function lastMonths(n) {
  const out = []
  const base = new Date(); base.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base); m.setMonth(base.getMonth() - i)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function Executive() {
  const { isAdmin } = useAuth()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function load() {
    setLoading(true)
    const [{ data: locRows }, { data: invoices }, { data: expenses }, { data: stock }] = await Promise.all([
      supabase.from('locations').select('name').order('name'),
      supabase.from('invoices').select('date, location, invoice_lines(amount, kilos, items(name)), partial_payments(amount_paid), customers(display_name, business_name, type)'),
      supabase.from('expenses').select('date, location, amount'),
      supabase.from('stock_entries').select('kilos, purchase_orders!inner(date, location, from_storage)'),
    ])
    const locations = (locRows ?? []).map((l) => l.name)

    // Per-location current inventory flags (admin bypasses RLS so fetchMovements(loc) works)
    const flags = {}
    await Promise.all(locations.map(async (loc) => {
      const moves = await fetchMovements(loc)
      const byItem = {}
      for (const m of moves) byItem[m.item_id] = (byItem[m.item_id] ?? 0) + m.kilos
      const th = getThresholds(loc)
      const c = { Critical: 0, Low: 0, Sufficient: 0 }
      for (const id in byItem) c[stockStatus(byItem[id], th)]++
      flags[loc] = c
    }))

    setD({ locations, invoices: invoices ?? [], expenses: expenses ?? [], stock: stock ?? [], flags })
    setLoading(false)
  }

  if (!isAdmin) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-20">Executive Summary is available to admins only.</p>
  if (loading || !d) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-20">Loading…</p>

  const { locations, invoices, expenses, stock, flags } = d
  const months = lastMonths(6)
  const thisM = months[months.length - 1]
  const prevM = months[months.length - 2]

  // ── Invoice helpers ──
  const invTotal = (inv) => (inv.invoice_lines ?? []).reduce((s, l) => s + num(l.amount), 0)
  const invPaid = (inv) => (inv.partial_payments ?? []).reduce((s, p) => s + num(p.amount_paid), 0)

  // ── Sales by location / month ──
  const salesLM = {} // loc -> month -> total
  for (const inv of invoices) {
    const loc = inv.location || '—', m = monthKey(inv.date)
    salesLM[loc] = salesLM[loc] || {}
    salesLM[loc][m] = (salesLM[loc][m] ?? 0) + invTotal(inv)
  }
  const salesMonth = (m) => locations.reduce((s, loc) => s + (salesLM[loc]?.[m] ?? 0), 0)
  const totalSalesThis = salesMonth(thisM)
  const totalSalesPrev = salesMonth(prevM)
  const salesDelta = totalSalesPrev > 0 ? ((totalSalesThis - totalSalesPrev) / totalSalesPrev) * 100 : null

  // ── Expenses by loc this month ──
  const expLoc = (loc) => expenses.filter((e) => e.location === loc && monthKey(e.date) === thisM).reduce((s, e) => s + num(e.amount), 0)
  const totalExpThis = expenses.filter((e) => monthKey(e.date) === thisM).reduce((s, e) => s + num(e.amount), 0)

  // ── Stocks in / transferred (this month) by loc ──
  const stocksIn = {}, stocksXfer = {}
  for (const s of stock) {
    const po = s.purchase_orders
    if (!po || monthKey(po.date) !== thisM) continue
    const loc = po.location || '—'
    if (po.from_storage) stocksXfer[loc] = (stocksXfer[loc] ?? 0) + num(s.kilos)
    else stocksIn[loc] = (stocksIn[loc] ?? 0) + num(s.kilos)
  }

  // ── Unpaid by loc (all-time outstanding) ──
  const unpaid = {} // loc -> {count, amount}
  let unpaidCountAll = 0, unpaidAmtAll = 0
  for (const inv of invoices) {
    const bal = invTotal(inv) - invPaid(inv)
    if (bal <= 1e-9) continue
    const loc = inv.location || '—'
    unpaid[loc] = unpaid[loc] || { count: 0, amount: 0 }
    unpaid[loc].count++; unpaid[loc].amount += bal
    unpaidCountAll++; unpaidAmtAll += bal
  }

  // ── Top customers & items (by sales amount, all-time) ──
  const custMap = {}, itemMap = {}
  for (const inv of invoices) {
    const cname = inv.customers ? (inv.customers.display_name || inv.customers.business_name) : 'Walk-in'
    custMap[cname] = (custMap[cname] ?? 0) + invTotal(inv)
    for (const l of inv.invoice_lines ?? []) {
      const iname = l.items?.name ?? '—'
      itemMap[iname] = itemMap[iname] || { amount: 0, kilos: 0 }
      itemMap[iname].amount += num(l.amount); itemMap[iname].kilos += num(l.kilos)
    }
  }
  const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topItems = Object.entries(itemMap).sort((a, b) => b[1].amount - a[1].amount).slice(0, 5)

  const salesSeries = locations.map((loc, i) => ({ name: loc, color: COLORS[i % COLORS.length], values: months.map((m) => salesLM[loc]?.[m] ?? 0) }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Executive Summary</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500">All branches · current month ({thisM}) unless noted · admin only</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Total Sales (mo)" value={money(totalSalesThis)} accent="blue"
          sub={salesDelta == null ? 'no prior month' : `${salesDelta >= 0 ? '▲' : '▼'} ${Math.abs(salesDelta).toFixed(1)}% vs ${prevM}`}
          subColor={salesDelta == null ? '' : salesDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
        <Kpi label="Total Expenses (mo)" value={money(totalExpThis)} accent="amber" />
        <Kpi label="Unpaid Invoices" value={unpaidCountAll} accent="red" sub="Unpaid + Partial" />
        <Kpi label="Unpaid Amount" value={money(unpaidAmtAll)} accent="red" sub="outstanding balance" />
      </div>

      {/* Monthly sales trend */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Monthly Sales Trend</h2>
          <div className="flex gap-3 text-xs">
            {salesSeries.map((s) => (
              <span key={s.name} className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}
              </span>
            ))}
          </div>
        </div>
        <BarChart months={months} series={salesSeries} />
      </div>

      {/* Per-branch breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {locations.map((loc) => {
          const f = flags[loc] || { Critical: 0, Low: 0, Sufficient: 0 }
          const up = unpaid[loc] || { count: 0, amount: 0 }
          return (
            <div key={loc} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-800 dark:text-gray-100 text-sm">📍 {loc}</div>
              <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Stat label="Sales (mo)" value={money(salesLM[loc]?.[thisM] ?? 0)} />
                <Stat label="Expenses (mo)" value={money(expLoc(loc))} />
                <Stat label="Stocks in (mo)" value={`${kg(stocksIn[loc] ?? 0)} kg`} />
                <Stat label="Transferred (mo)" value={`${kg(stocksXfer[loc] ?? 0)} kg`} />
                <Stat label="Unpaid" value={`${up.count} · ${money(up.amount)}`} />
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Inventory flags</span>
                  <div className="flex gap-1.5 mt-1">
                    <Flag n={f.Critical} cls="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" label="Crit" />
                    <Flag n={f.Low} cls="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" label="Low" />
                    <Flag n={f.Sufficient} cls="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" label="OK" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Top customers & items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopTable title="Top Customers" rows={topCustomers.map(([n, v]) => [n, money(v)])} />
        <TopTable title="Top Items" rows={topItems.map(([n, v]) => [n, `${money(v.amount)} · ${kg(v.kilos)} kg`])} />
      </div>
    </div>
  )
}

// ── Inline grouped bar chart (no dependency) ──
function BarChart({ months, series }) {
  const W = 620, H = 200, padL = 44, padB = 22, padT = 8
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const groups = months.length
  const groupW = (W - padL - 8) / groups
  const barW = Math.max(4, (groupW - 6) / Math.max(1, series.length))
  const y = (v) => padT + (H - padT - padB) * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 4} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="1" />
          <text x={padL - 6} y={y(max * t) + 3} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" fontSize="9">{kg(max * t)}</text>
        </g>
      ))}
      {months.map((m, gi) => (
        <g key={m}>
          {series.map((s, si) => {
            const v = s.values[gi]
            const x = padL + gi * groupW + 3 + si * barW
            return <rect key={si} x={x} y={y(v)} width={barW - 1} height={Math.max(0, H - padB - y(v))} fill={s.color} rx="1" />
          })}
          <text x={padL + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize="9">{m.slice(2)}</text>
        </g>
      ))}
    </svg>
  )
}

const KPI_ACCENT = {
  blue: 'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10',
  amber: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10',
  red: 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10',
}
function Kpi({ label, value, sub, subColor, accent }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${KPI_ACCENT[accent] ?? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
      {sub && <p className={`text-[11px] ${subColor || 'text-gray-400 dark:text-gray-500'}`}>{sub}</p>}
    </div>
  )
}
function Stat({ label, value }) {
  return (
    <div>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <p className="font-semibold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  )
}
function Flag({ n, cls, label }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{n} {label}</span>
}
function TopTable({ title, rows }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.length === 0 ? (
            <tr><td className="px-4 py-3 text-gray-400 dark:text-gray-500">No data</td></tr>
          ) : rows.map(([name, val], i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 text-gray-800 dark:text-gray-100">{i + 1}. {name}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-700 dark:text-gray-200">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

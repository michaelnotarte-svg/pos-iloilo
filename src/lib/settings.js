// Browser-persisted app settings (theme, currency, business info).
// Per-device for now; can move to a Supabase table later if shared settings are needed.

const THEME_KEY = 'pos.theme'
const CURRENCY_KEY = 'pos.currency'
const BUSINESS_KEY = 'pos.business'
const ADMIN_KEY = 'pos.admin'
const THRESH_KEY = 'pos.box_thresholds' // box-based (old 'pos.thresholds' held kg values)

export const APP_VERSION = '0.2.0'

export const CURRENCY_OPTIONS = [
  { symbol: '₱', label: '₱  Philippine Peso (PHP)' },
  { symbol: '$', label: '$  US Dollar (USD)' },
  { symbol: '€', label: '€  Euro (EUR)' },
  { symbol: '£', label: '£  British Pound (GBP)' },
  { symbol: '¥', label: '¥  Japanese Yen (JPY)' },
]

// ── Theme ────────────────────────────────────────────────
export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light'
}

export function applyTheme(theme) {
  const t = theme || getTheme()
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

// ── Currency ─────────────────────────────────────────────
export function getCurrency() {
  return localStorage.getItem(CURRENCY_KEY) || '₱'
}

export function setCurrency(symbol) {
  localStorage.setItem(CURRENCY_KEY, symbol)
}

// Formats a number as currency using the active symbol (2 decimals).
export function money(n) {
  const sym = getCurrency()
  const amount = Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sym}${amount}`
}

// ── Business info (per branch) ───────────────────────────
const bizKey = (loc) => (loc ? `${BUSINESS_KEY}.${loc}` : BUSINESS_KEY)

export function getBusiness(location) {
  try {
    return (
      JSON.parse(localStorage.getItem(bizKey(location))) ||
      JSON.parse(localStorage.getItem(BUSINESS_KEY)) || // legacy/global fallback
      {}
    )
  } catch {
    return {}
  }
}

export function setBusiness(obj, location) {
  localStorage.setItem(bizKey(location), JSON.stringify(obj))
}

// ── Admin mode (placeholder for real role-based auth) ────
export function getAdminMode() {
  return localStorage.getItem(ADMIN_KEY) === '1'
}

export function setAdminMode(on) {
  localStorage.setItem(ADMIN_KEY, on ? '1' : '0')
}

// ── Inventory stock-level thresholds (item-level total #boxes, per branch) ──
const threshKey = (loc) => (loc ? `${THRESH_KEY}.${loc}` : THRESH_KEY)
const DEFAULT_THRESH = { critical: 10, low: 50 }

export function getThresholds(location) {
  try {
    return (
      JSON.parse(localStorage.getItem(threshKey(location))) ||
      JSON.parse(localStorage.getItem(THRESH_KEY)) || // global fallback
      DEFAULT_THRESH
    )
  } catch {
    return DEFAULT_THRESH
  }
}

export function setThresholds(obj, location) {
  localStorage.setItem(threshKey(location), JSON.stringify(obj))
}

// Returns 'Critical' | 'Low' | 'Sufficient' for a given #boxes value.
export function stockStatus(boxes, t) {
  const th = t || getThresholds()
  if (boxes <= th.critical) return 'Critical'
  if (boxes <= th.low) return 'Low'
  return 'Sufficient'
}

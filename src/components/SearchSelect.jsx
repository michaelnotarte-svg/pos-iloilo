import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Type-to-search dropdown for long lists (items, customers, …).
 *
 * Behaves like a normal select, except: focusing the field clears it so you can
 * immediately type, and the text you type filters options by matching ANYWHERE in
 * the name (not just the first letter). Blur without choosing restores the
 * current selection.
 *
 * Props:
 *   value      - selected id ('' when none)
 *   onChange   - (id) => void
 *   options    - [{ id, label }]
 *   placeholder, disabled, allowClear
 */
export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Type to search…',
  disabled = false,
  allowClear = true,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => String(o.id) === String(value)) || null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => (o.label ?? '').toLowerCase().includes(q)) : options
    return list.slice(0, 100) // keep the dropdown light on very long lists
  }, [query, options])

  // Close when clicking outside
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => { setActive(0) }, [query, open])

  function pick(o) {
    onChange(o.id)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]) }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
  }

  const base =
    'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'

  return (
    <div className="relative" ref={boxRef}>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        // While open the field is empty and shows what you type; closed it shows the pick.
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        onKeyDown={onKeyDown}
        placeholder={open && selected ? selected.label : placeholder}
        className={`${base} ${allowClear && selected ? 'pr-8' : ''}`}
        autoComplete="off"
      />

      {allowClear && selected && !open && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); inputRef.current?.focus() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none"
          aria-label="Clear"
        >
          &times;
        </button>
      )}

      {open && (
        <ul className="absolute z-[60] mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400 dark:text-gray-500">No matches</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.id}
                // onMouseDown fires before the input's blur, so the click always lands
                onMouseDown={(e) => { e.preventDefault(); pick(o) }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2 cursor-pointer ${
                  i === active ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'
                } ${String(o.id) === String(value) ? 'font-semibold' : ''}`}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

// Shown when a delete is blocked because other records depend on the row.
// Lists the dependents and the order to clear them — no "proceed" button, so
// destructive steps stay in the right sequence and attributable to the right role.
export default function DependencyBlockModal({ title, intro, rows, footer, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">{title}</h2>
        {intro && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{intro}</p>}
        {rows?.length > 0 && (
          <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 mb-3">
            {rows.map((r, i) => (
              <li key={i} className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">{r}</li>
            ))}
          </ul>
        )}
        {footer && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{footer}</p>}
        <div className="flex justify-end">
          <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Got it</button>
        </div>
      </div>
    </div>
  )
}

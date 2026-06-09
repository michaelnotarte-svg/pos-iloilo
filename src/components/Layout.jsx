import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/invoices',   label: 'Invoices',   icon: '🧾' },
  { to: '/stocks',     label: 'Stocks',     icon: '📦' },
  { to: '/inventory',  label: 'Inventory',  icon: '🏬' },
  { to: '/customers',  label: 'Customers',  icon: '👥' },
  { to: '/items',      label: 'Items',      icon: '🥩' },
  { to: '/expenses',   label: 'Expenses',   icon: '💸' },
  { to: '/settings',   label: 'Settings',   icon: '⚙️' },
]

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Meat Dist.</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight">POS System</p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400 dark:text-gray-500">Iloilo · v0.2</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

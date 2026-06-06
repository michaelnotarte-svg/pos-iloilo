import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/invoices',   label: 'Invoices',        icon: '🧾' },
  { to: '/inventory',  label: 'Purchase Orders',  icon: '📦' },
  { to: '/customers',  label: 'Customers',        icon: '👥' },
  { to: '/items',      label: 'Items',            icon: '🥩' },
  { to: '/expenses',         label: 'Expenses',   icon: '💸' },
  { to: '/inventory-current', label: 'Inventory',  icon: '🏬' },
]

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Meat Dist.</p>
          <p className="text-lg font-bold text-gray-800 leading-tight">POS System</p>
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
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">Iloilo · v0.1</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

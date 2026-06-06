import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Customers from './pages/Customers'
import Items from './pages/Items'
import PurchaseOrders from './pages/PurchaseOrders'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Expenses from './pages/Expenses'
import Inventory from './pages/Inventory'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/invoices" replace />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/inventory" element={<PurchaseOrders />} />
          <Route path="/inventory/:id" element={<PurchaseOrderDetail />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/items" element={<Items />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/inventory-current" element={<Inventory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

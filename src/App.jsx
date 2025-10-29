import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import MainLayout from './layouts/MainLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InvoiceList from './pages/InvoiceList'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Settings from './pages/Settings'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import BusinessCreate from './pages/BusinessCreate'
import CreateCreditNote from './pages/CreateCreditNote'
import CreateDebitNote from './pages/CreateDebitNote'
import Reports from './pages/Reports'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import CreatePurchase from './pages/CreatePurchase'
import CashRegister from './pages/CashRegister'

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />

            {/* Rutas protegidas con layout */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="nota-credito" element={<CreateCreditNote />} />
              <Route path="nota-debito" element={<CreateDebitNote />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="business/new" element={<BusinessCreate />} />
            </Route>

            {/* Ruta 404 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  )
}

export default App

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
import AccountSuspended from './pages/AccountSuspended'
import MySubscription from './pages/MySubscription'
import UserManagement from './pages/admin/UserManagement'
import GetMyUID from './pages/GetMyUID'
import Quotations from './pages/Quotations'
import CreateQuotation from './pages/CreateQuotation'
import Demo from './pages/Demo'
import DemoLayout from './layouts/DemoLayout'

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />

            {/* Rutas de demo (sin autenticación, con datos de ejemplo) */}
            <Route path="/demo" element={<Demo />} />
            <Route path="/demo" element={<DemoLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="nota-credito" element={<CreateCreditNote />} />
              <Route path="nota-debito" element={<CreateDebitNote />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="configuracion" element={<Settings />} />
            </Route>

            {/* Ruta de cuenta suspendida (sin layout) */}
            <Route path="/account-suspended" element={<AccountSuspended />} />

            {/* Ruta especial para obtener UID (sin layout) */}
            <Route path="/get-my-uid" element={<GetMyUID />} />

            {/* Rutas protegidas con layout */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="nota-credito" element={<CreateCreditNote />} />
              <Route path="nota-debito" element={<CreateDebitNote />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="mi-suscripcion" element={<MySubscription />} />
              <Route path="business/new" element={<BusinessCreate />} />

              {/* Rutas de administración */}
              <Route path="admin/users" element={<UserManagement />} />
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

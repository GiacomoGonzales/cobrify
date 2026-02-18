import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { BrandingProvider } from './contexts/BrandingContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import MainLayout from './layouts/MainLayout'
import LandingPage from './pages/LandingPage'
import LandingRouter from './components/LandingRouter'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import InvoiceList from './pages/InvoiceList'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Settings from './pages/Settings'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Warehouses from './pages/Warehouses'
import BusinessCreate from './pages/BusinessCreate'
import CreateCreditNote from './pages/CreateCreditNote'
import CreateDebitNote from './pages/CreateDebitNote'
import Reports from './pages/Reports'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import CreatePurchase from './pages/CreatePurchase'
import PurchaseOrders from './pages/PurchaseOrders'
import CashRegister from './pages/CashRegister'
import AccountSuspended from './pages/AccountSuspended'
import MySubscription from './pages/MySubscription'
import UserManagement from './pages/admin/UserManagement'
import AdminLayout from './layouts/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminPayments from './pages/admin/AdminPayments'
import AdminAnalytics from './pages/admin/AdminAnalytics'
import AdminSettings from './pages/admin/AdminSettings'
import AdminResellers from './pages/admin/AdminResellers'
import AdminExpirations from './pages/admin/AdminExpirations'
// Reseller pages
import ResellerLayout from './layouts/ResellerLayout'
import ResellerDashboard from './pages/reseller/ResellerDashboard'
import ResellerClients from './pages/reseller/ResellerClients'
import CreateResellerClient from './pages/reseller/CreateResellerClient'
import ResellerBalance from './pages/reseller/ResellerBalance'
import ResellerSettings from './pages/reseller/ResellerSettings'
import Users from './pages/Users'
import BusinessManagement from './pages/BusinessManagement'
import GetMyUID from './pages/GetMyUID'
import NotificationTest from './pages/NotificationTest'
import Quotations from './pages/Quotations'
import CreateQuotation from './pages/CreateQuotation'
import StockMovements from './pages/StockMovements'
import Demo from './pages/Demo'
import DemoLayout from './layouts/DemoLayout'
import DemoRestaurant from './pages/DemoRestaurant'
import DemoRestaurantLayout from './layouts/DemoRestaurantLayout'
import DemoPharmacy from './pages/DemoPharmacy'
import DemoPharmacyLayout from './layouts/DemoPharmacyLayout'
// Restaurant pages
import Tables from './pages/Tables'
import Waiters from './pages/Waiters'
import Sellers from './pages/Sellers'
import Orders from './pages/Orders'
import Kitchen from './pages/Kitchen'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RegisterPurchase from './pages/RegisterPurchase'
import PurchaseHistory from './pages/PurchaseHistory'
import MobileRedirect from './components/MobileRedirect'
import DispatchGuides from './pages/DispatchGuides'
import CarrierDispatchGuides from './pages/CarrierDispatchGuides'
import TermsAndConditions from './pages/TermsAndConditions'
import MigratePurchases from './pages/MigratePurchases'
import Expenses from './pages/Expenses'
import Loans from './pages/Loans'
import Certificates from './pages/Certificates'
import CashFlow from './pages/CashFlow'
// Pharmacy pages
import Laboratories from './pages/Laboratories'
import ExpiryAlerts from './pages/ExpiryAlerts'
import BatchControl from './pages/BatchControl'
// Real Estate pages
import Properties from './pages/Properties'
import Operations from './pages/Operations'
import Commissions from './pages/Commissions'
import Agents from './pages/Agents'
// Public catalog
import CatalogoPublico from './pages/CatalogoPublico'
// Public complaints book
import LibroReclamaciones from './pages/LibroReclamaciones'
// Admin complaints
import ComplaintsList from './pages/ComplaintsList'
// Student payment control
import StudentPaymentControl from './pages/StudentPaymentControl'
// Production
import Production from './pages/Production'

function App() {
  const isNative = Capacitor.isNativePlatform()

  // Configurar StatusBar globalmente al iniciar la app
  useEffect(() => {
    const configureStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // El contenido NO se superpone con el status bar
          await StatusBar.setOverlaysWebView({ overlay: false })
          // Texto blanco sobre fondo oscuro
          await StatusBar.setStyle({ style: Style.Dark })
          // Color de fondo azul primario
          await StatusBar.setBackgroundColor({ color: '#1e40af' })
        } catch (error) {
          console.warn('Error configurando StatusBar:', error)
        }
      }
    }
    configureStatusBar()
  }, [])

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <BrandingProvider>
          <ToastProvider>
          <ThemeProvider>
            <Routes>
            {/* Landing Page - En móvil redirige a dashboard, en web usa LandingRouter */}
            <Route path="/" element={isNative ? <Navigate to="/app/dashboard" replace /> : <LandingRouter />} />

            {/* Rutas públicas de autenticación */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Rutas públicas */}
            <Route path="/terminos-y-condiciones" element={<TermsAndConditions />} />

            {/* Catálogo público */}
            <Route path="/catalogo/:slug" element={<CatalogoPublico />} />
            <Route path="/app/catalogo/:slug" element={<CatalogoPublico />} />

            {/* Menú digital para restaurantes */}
            <Route path="/menu/:slug" element={<CatalogoPublico isRestaurantMenu />} />
            <Route path="/app/menu/:slug" element={<CatalogoPublico isRestaurantMenu />} />

            {/* Libro de Reclamaciones público */}
            <Route path="/reclamos/:slug" element={<LibroReclamaciones />} />
            <Route path="/app/reclamos/:slug" element={<LibroReclamaciones />} />

            {/* Catálogo Demo */}
            <Route path="/demo/catalogo" element={<CatalogoPublico isDemo />} />

            {/* Menú Digital Demo */}
            <Route path="/demo/menu" element={<CatalogoPublico isDemo isRestaurantMenu />} />

            {/* Página de prueba - Detector de notificaciones Yape (solo para testing) */}
            <Route path="/test-notifications" element={<NotificationTest />} />

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
              <Route path="cotizaciones/editar/:id" element={<CreateQuotation />} />
              <Route path="guias-remision" element={<DispatchGuides />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="compras/editar/:purchaseId" element={<CreatePurchase />} />
              <Route path="compras/migrar" element={<MigratePurchases />} />
              <Route path="ordenes-compra" element={<PurchaseOrders />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="configuracion" element={<Settings />} />
              {/* Rutas de modo restaurante en demo */}
              <Route path="mesas" element={<Tables />} />
              <Route path="mozos" element={<Waiters />} />
              <Route path="ordenes" element={<Orders />} />
              <Route path="cocina" element={<Kitchen />} />
              <Route path="ingredientes" element={<Ingredients />} />
              <Route path="ingredientes/compra" element={<RegisterPurchase />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />
            </Route>

            {/* Rutas de demo restaurante (sin autenticación, con datos de ejemplo de restaurante) */}
            <Route path="/demorestaurant" element={<DemoRestaurant />} />
            <Route path="/demorestaurant" element={<DemoRestaurantLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="mesas" element={<Tables />} />
              <Route path="mozos" element={<Waiters />} />
              <Route path="ordenes" element={<Orders />} />
              <Route path="cocina" element={<Kitchen />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="control-pagos-alumnos" element={<StudentPaymentControl />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="prestamos" element={<Loans />} />
              <Route path="certificados" element={<Certificates />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="ingredientes" element={<Ingredients />} />
              <Route path="ingredientes/compra" element={<RegisterPurchase />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />
            </Route>

            {/* Rutas de demo farmacia (sin autenticación, con datos de ejemplo de farmacia) */}
            <Route path="/demopharmacy" element={<DemoPharmacy />} />
            <Route path="/demopharmacy" element={<DemoPharmacyLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="cotizaciones/editar/:id" element={<CreateQuotation />} />
              <Route path="guias-remision" element={<DispatchGuides />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="control-lotes" element={<BatchControl />} />
              <Route path="alertas-vencimiento" element={<ExpiryAlerts />} />
              <Route path="laboratorios" element={<Laboratories />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="ordenes-compra" element={<PurchaseOrders />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="configuracion" element={<Settings />} />
            </Route>

            {/* Ruta de cuenta suspendida (sin layout) */}
            <Route path="/account-suspended" element={<AccountSuspended />} />

            {/* Ruta especial para obtener UID (sin layout) */}
            <Route path="/get-my-uid" element={<GetMyUID />} />

            {/* Rutas protegidas con layout */}
            <Route path="/app" element={<MainLayout />}>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="nota-credito" element={<CreateCreditNote />} />
              <Route path="nota-debito" element={<CreateDebitNote />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="cotizaciones/editar/:id" element={<CreateQuotation />} />
              <Route path="guias-remision" element={<DispatchGuides />} />
              <Route path="guias-transportista" element={<CarrierDispatchGuides />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="control-pagos-alumnos" element={<StudentPaymentControl />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="compras/editar/:purchaseId" element={<CreatePurchase />} />
              <Route path="compras/migrar" element={<MigratePurchases />} />
              <Route path="ordenes-compra" element={<PurchaseOrders />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="prestamos" element={<Loans />} />
              <Route path="certificados" element={<Certificates />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="usuarios" element={<Users />} />
              <Route path="mi-suscripcion" element={<MySubscription />} />
              <Route path="business/new" element={<BusinessCreate />} />

              {/* Rutas de modo restaurante */}
              <Route path="mesas" element={<Tables />} />
              <Route path="mozos" element={<Waiters />} />
              <Route path="ordenes" element={<Orders />} />
              <Route path="cocina" element={<Kitchen />} />
              <Route path="ingredientes" element={<Ingredients />} />
              <Route path="ingredientes/compra" element={<RegisterPurchase />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />

              {/* Rutas de modo farmacia */}
              <Route path="laboratorios" element={<Laboratories />} />
              <Route path="alertas-vencimiento" element={<ExpiryAlerts />} />
              <Route path="control-lotes" element={<BatchControl />} />

              {/* Rutas de modo inmobiliaria */}
              <Route path="propiedades" element={<Properties />} />
              <Route path="agentes" element={<Agents />} />
              <Route path="operaciones" element={<Operations />} />
              <Route path="comisiones" element={<Commissions />} />

              {/* Rutas de administración legacy eliminadas - usar /app/admin/dashboard */}
            </Route>

            {/* Panel de Administración (nuevo) */}
            <Route path="/app/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="resellers" element={<AdminResellers />} />
              <Route path="expirations" element={<AdminExpirations />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* Panel de Resellers */}
            <Route path="/reseller" element={<ResellerLayout />}>
              <Route index element={<ResellerDashboard />} />
              <Route path="dashboard" element={<ResellerDashboard />} />
              <Route path="clients" element={<ResellerClients />} />
              <Route path="clients/new" element={<CreateResellerClient />} />
              <Route path="balance" element={<ResellerBalance />} />
              <Route path="settings" element={<ResellerSettings />} />
            </Route>

            {/* Ruta 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ThemeProvider>
          </ToastProvider>
        </BrandingProvider>
      </AuthProvider>
    </Router>
  )
}

export default App

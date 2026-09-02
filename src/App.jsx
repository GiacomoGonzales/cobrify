import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { BrandingProvider } from './contexts/BrandingContext'
import { ToastProvider } from './contexts/ToastContext'
import AppLifecycleManager from './components/AppLifecycleManager'
import MainLayout from './layouts/MainLayout'
import LandingRouter from './components/LandingRouter'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
// ============================================================
// CARGA BAJO DEMANDA DE LAS PANTALLAS
//
// Cada pantalla se descarga recien cuando se entra a su ruta. Antes estaban
// todas en un solo archivo de ~9 MB: abrir el chat, o el login, bajaba tambien
// el punto de venta, el inventario, los reportes y todo el panel de
// administracion antes de mostrar nada.
//
// Los LAYOUTS quedan de carga normal: son chicos y envuelven a todas las
// rutas, asi que dividirlos solo agregaria una espera mas.
//
// El service worker igual precachea todo DESPUES de la primera carga, en
// segundo plano: el modo sin conexion (ventas del POS) se mantiene intacto.
// ============================================================
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const InvoiceList = lazy(() => import('./pages/InvoiceList'))
const Customers = lazy(() => import('./pages/Customers'))
const Promotions = lazy(() => import('./pages/Promotions'))
const Products = lazy(() => import('./pages/Products'))
const Settings = lazy(() => import('./pages/Settings'))
const POS = lazy(() => import('./pages/POS'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Warehouses = lazy(() => import('./pages/Warehouses'))
const BusinessCreate = lazy(() => import('./pages/BusinessCreate'))
const CreateCreditNote = lazy(() => import('./pages/CreateCreditNote'))
const CreateDebitNote = lazy(() => import('./pages/CreateDebitNote'))
const Reports = lazy(() => import('./pages/Reports'))
const MetaAdsExport = lazy(() => import('./pages/MetaAdsExport'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Purchases = lazy(() => import('./pages/Purchases'))
const CreatePurchase = lazy(() => import('./pages/CreatePurchase'))
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'))
const CashRegister = lazy(() => import('./pages/CashRegister'))
const AccountSuspended = lazy(() => import('./pages/AccountSuspended'))
const MySubscription = lazy(() => import('./pages/MySubscription'))
const Manual = lazy(() => import('./pages/Manual'))
const UserManagement = lazy(() => import('./pages/admin/UserManagement'))
import AdminLayout from './layouts/AdminLayout'
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'))
const AdminCpe = lazy(() => import('./pages/admin/AdminCpe'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminInvestorReport = lazy(() => import('./pages/admin/AdminInvestorReport'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminResellers = lazy(() => import('./pages/admin/AdminResellers'))
const AdminExpirations = lazy(() => import('./pages/admin/AdminExpirations'))
const AdminPlanDistribution = lazy(() => import('./pages/admin/AdminPlanDistribution'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))
// Reseller pages
import ResellerLayout from './layouts/ResellerLayout'
const ResellerDashboard = lazy(() => import('./pages/reseller/ResellerDashboard'))
const ResellerClients = lazy(() => import('./pages/reseller/ResellerClients'))
const CreateResellerClient = lazy(() => import('./pages/reseller/CreateResellerClient'))
const ResellerBalance = lazy(() => import('./pages/reseller/ResellerBalance'))
const ResellerSettings = lazy(() => import('./pages/reseller/ResellerSettings'))
const Users = lazy(() => import('./pages/Users'))
const GetMyUID = lazy(() => import('./pages/GetMyUID'))
const NotificationTest = lazy(() => import('./pages/NotificationTest'))
const Quotations = lazy(() => import('./pages/Quotations'))
const BulkEmission = lazy(() => import('./pages/BulkEmission'))
const CreateQuotation = lazy(() => import('./pages/CreateQuotation'))
const StockMovements = lazy(() => import('./pages/StockMovements'))
const Demo = lazy(() => import('./pages/Demo'))

import DemoLayout from './layouts/DemoLayout'
const DemoRestaurant = lazy(() => import('./pages/DemoRestaurant'))
import DemoRestaurantLayout from './layouts/DemoRestaurantLayout'
const DemoPharmacy = lazy(() => import('./pages/DemoPharmacy'))
import DemoPharmacyLayout from './layouts/DemoPharmacyLayout'
const DemoHotel = lazy(() => import('./pages/DemoHotel'))
import DemoHotelLayout from './layouts/DemoHotelLayout'
const DemoVeterinary = lazy(() => import('./pages/DemoVeterinary'))
import DemoVeterinaryLayout from './layouts/DemoVeterinaryLayout'
const DemoLogistics = lazy(() => import('./pages/DemoLogistics'))
import DemoLogisticsLayout from './layouts/DemoLogisticsLayout'
// Restaurant pages
const Tables = lazy(() => import('./pages/Tables'))
const Waiters = lazy(() => import('./pages/Waiters'))
const Sellers = lazy(() => import('./pages/Sellers'))
// Conductores y vehiculos guardados, para las guias de remision (y, mas
// adelante, el modulo de transporte de pasajeros).
const Fleet = lazy(() => import('./pages/Fleet'))
const Attendance = lazy(() => import('./pages/Attendance'))
const MySchedule = lazy(() => import('./pages/MySchedule'))
const Orders = lazy(() => import('./pages/Orders'))
const OnlineOrders = lazy(() => import('./pages/OnlineOrders'))
const RappiOrders = lazy(() => import('./pages/RappiOrders'))
const Kitchen = lazy(() => import('./pages/Kitchen'))
const Ingredients = lazy(() => import('./pages/Ingredients'))
const Recipes = lazy(() => import('./pages/Recipes'))
const RegisterPurchase = lazy(() => import('./pages/RegisterPurchase'))
const PurchaseHistory = lazy(() => import('./pages/PurchaseHistory'))
const Requirements = lazy(() => import('./pages/Requirements'))
const DispatchGuides = lazy(() => import('./pages/DispatchGuides'))
const CarrierDispatchGuides = lazy(() => import('./pages/CarrierDispatchGuides'))
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'))
const Chat = lazy(() => import('./pages/Chat'))
const Pricing = lazy(() => import('./pages/Pricing'))
const PublicManual = lazy(() => import('./pages/PublicManual'))
const MigratePurchases = lazy(() => import('./pages/MigratePurchases'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Loans = lazy(() => import('./pages/Loans'))
const LendingPortfolio = lazy(() => import('./pages/LendingPortfolio'))
const Certificates = lazy(() => import('./pages/Certificates'))
const CashFlow = lazy(() => import('./pages/CashFlow'))
const Accounting = lazy(() => import('./pages/Accounting'))
// Pharmacy pages
const Laboratories = lazy(() => import('./pages/Laboratories'))
const ExpiryAlerts = lazy(() => import('./pages/ExpiryAlerts'))
const BatchControl = lazy(() => import('./pages/BatchControl'))
// Hotel pages
const HotelRooms = lazy(() => import('./pages/HotelRooms'))
const HotelReservations = lazy(() => import('./pages/HotelReservations'))
const HotelServices = lazy(() => import('./pages/HotelServices'))
const HotelHousekeeping = lazy(() => import('./pages/HotelHousekeeping'))
const HotelNightAudit = lazy(() => import('./pages/HotelNightAudit'))
// Real Estate pages
const Properties = lazy(() => import('./pages/Properties'))
const Operations = lazy(() => import('./pages/Operations'))
const Commissions = lazy(() => import('./pages/Commissions'))
const Agents = lazy(() => import('./pages/Agents'))
// Veterinary pages
const VeterinaryAlerts = lazy(() => import('./pages/VeterinaryAlerts'))
const VeterinaryAgenda = lazy(() => import('./pages/VeterinaryAgenda'))
// Public catalog
const CatalogoPublico = lazy(() => import('./pages/CatalogoPublico'))
const MiReserva = lazy(() => import('./pages/MiReserva'))
// Public complaints book
const LibroReclamaciones = lazy(() => import('./pages/LibroReclamaciones'))
const RegistroFidelidad = lazy(() => import('./pages/RegistroFidelidad'))
// Admin complaints
const ComplaintsList = lazy(() => import('./pages/ComplaintsList'))
// Student payment control
const StudentPaymentControl = lazy(() => import('./pages/StudentPaymentControl'))
// Production
const Production = lazy(() => import('./pages/Production'))
// Envíos
const Envios = lazy(() => import('./pages/Envios'))
// Logística
const Projects = lazy(() => import('./pages/Projects'))
const WarehouseExits = lazy(() => import('./pages/WarehouseExits'))
const WarehouseReturns = lazy(() => import('./pages/WarehouseReturns'))
const LogisticsReports = lazy(() => import('./pages/LogisticsReports'))

// Páginas del demo. Se declaran una sola vez y se montan en dos lugares:
// /demo (genérico) y /demo/:rubro (con el catálogo del rubro). Antes cada
// demo nuevo obligaba a copiar estas 44 rutas.
const RUTAS_DEMO = (
  <>
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
              <Route path="promociones" element={<Promotions />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="flota" element={<Fleet />} />
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
              <Route path="requerimientos" element={<Requirements />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />
              <Route path="envios" element={<Envios />} />
              <Route path="pedidos-online" element={<OnlineOrders />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="contabilidad" element={<Accounting />} />
              {/* Páginas de otros modos de negocio. El menú de cada rubro
                  decide cuáles se muestran; acá solo se declaran para que la
                  URL exista (sin esto, /demo/farmacia/control-lotes caía en
                  la landing). */}
              <Route path="control-lotes" element={<BatchControl />} />
              <Route path="alertas-vencimiento" element={<ExpiryAlerts />} />
              <Route path="laboratorios" element={<Laboratories />} />
              <Route path="agenda-veterinaria" element={<VeterinaryAgenda />} />
              <Route path="certificados" element={<Certificates />} />
              <Route path="prestamos" element={<Loans />} />
              <Route path="prestamos-cartera" element={<LendingPortfolio />} />
              <Route path="control-pagos-alumnos" element={<StudentPaymentControl />} />
  </>
)

// Registro solo accesible para super admin
/**
 * Lo que se ve mientras baja el archivo de una pantalla. Es un instante en
 * conexiones normales, pero tiene que existir: sin fallback, React lanza un
 * error al suspender.
 */
function PantallaCargando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
}

function AdminOnlyRegister() {
  const { isAdmin, isLoading } = useAuth()
  if (isLoading) return null
  if (!isAdmin) return <Navigate to="/login" replace />
  return <Register />
}

function App() {
  const isNative = Capacitor.isNativePlatform()

  // Configurar StatusBar globalmente al iniciar la app
  useEffect(() => {
    const configureStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // El contenido se superpone con el status bar (para control total del fondo)
          await StatusBar.setOverlaysWebView({ overlay: true })
          // Texto blanco sobre fondo oscuro
          await StatusBar.setStyle({ style: Style.Dark })
          // Color de fondo transparente (el fondo lo maneja la app)
          await StatusBar.setBackgroundColor({ color: '#00000000' })
        } catch (error) {
          console.warn('Error configurando StatusBar:', error)
        }
      }
    }
    configureStatusBar()
  }, [])

  // Evita que la rueda del mouse modifique el valor de inputs numéricos enfocados
  // (bug reportado: en POS, al scrollear sobre "Descuento=5" se bajaba a 4.99).
  // Quita el foco del input en cuanto detecta el scroll; el scroll de la página
  // continúa normal porque el evento no se cancela.
  useEffect(() => {
    const handleWheel = (e) => {
      const el = document.activeElement
      if (el && el.tagName === 'INPUT' && el.type === 'number' && el === e.target) {
        el.blur()
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: true })
    return () => document.removeEventListener('wheel', handleWheel)
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
            <Suspense fallback={<PantallaCargando />}>
            <Routes>
            {/* Landing Page - En móvil redirige a dashboard, en web usa LandingRouter */}
            <Route path="/" element={isNative ? <Navigate to="/app/dashboard" replace /> : <LandingRouter />} />

            {/* Rutas públicas de autenticación */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<AdminOnlyRegister />} />

            {/* Rutas públicas */}
            <Route path="/terminos-y-condiciones" element={<TermsAndConditions />} />
            {/* Bandeja de WhatsApp: a pantalla completa y FUERA del panel, para que
                abrirla sea entrar al chat y nada mas. Es lo que va a servir el
                subdominio tal cual. El acceso lo controla la propia pagina. */}
            <Route path="/chat" element={<Chat />} />
            <Route path="/pricing" element={<Pricing />} />
            {/* Manual PUBLICO: se comparte por WhatsApp y abre sin sesion.
                Ver el porque en src/pages/PublicManual.jsx */}
            <Route path="/ayuda" element={<PublicManual />} />
            <Route path="/ayuda/:guideId" element={<PublicManual />} />
            <Route path="/precios" element={<Pricing />} />

            {/* Catálogo público */}
            <Route path="/catalogo/:slug" element={<CatalogoPublico />} />
            <Route path="/app/catalogo/:slug" element={<CatalogoPublico />} />

            {/* Menú digital para restaurantes */}
            <Route path="/menu/:slug" element={<CatalogoPublico isRestaurantMenu />} />
            <Route path="/app/menu/:slug" element={<CatalogoPublico isRestaurantMenu />} />

            {/* Libro de Reclamaciones público */}
            <Route path="/reclamos/:slug" element={<LibroReclamaciones />} />
            <Route path="/app/reclamos/:slug" element={<LibroReclamaciones />} />

            {/* Registro público de fidelización (el QR de mesa) */}
            <Route path="/registro/:negocio" element={<RegistroFidelidad />} />
            {/* Estado y cancelacion de reservas del catalogo (cita u hotel),
                por token. Publica: el enlace ES la credencial. */}
            <Route path="/mi-reserva/:businessId/:token" element={<MiReserva />} />

            {/* Catálogo Demo */}
            <Route path="/demo/catalogo" element={<CatalogoPublico isDemo />} />
            {/* Catálogo del demo POR RUBRO: /demo/ferreteria/catalogo */}
            <Route path="/demo/:rubro/catalogo" element={<CatalogoPublico isDemo />} />

            {/* Menú Digital Demo */}
            <Route path="/demo/menu" element={<CatalogoPublico isDemo isRestaurantMenu />} />

            {/* Página de prueba - Detector de notificaciones Yape (solo para testing) */}
            <Route path="/test-notifications" element={<NotificationTest />} />

            {/* Rutas de demo (sin autenticación, con datos de ejemplo) */}
            <Route path="/demo" element={<Demo />} />
            {/* /demo = demo genérico (el link de siempre, no se toca). */}
            <Route path="/demo" element={<DemoLayout />}>
              {RUTAS_DEMO}
            </Route>

            {/* /demo/:rubro = el MISMO demo con el catálogo de ese rubro
                (ferretería, ropa...). Las mismas páginas, otros datos: por eso
                las rutas hijas se declaran UNA vez y se reusan. Un slug que no
                existe cae al demo genérico, no a una pantalla en blanco. */}
            <Route path="/demo/:rubro" element={<Demo />} />
            <Route path="/demo/:rubro" element={<DemoLayout />}>
              {RUTAS_DEMO}
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
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="cotizaciones/editar/:id" element={<CreateQuotation />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="promociones" element={<Promotions />} />
              <Route path="control-pagos-alumnos" element={<StudentPaymentControl />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="flota" element={<Fleet />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="prestamos" element={<Loans />} />
              <Route path="prestamos-cartera" element={<LendingPortfolio />} />
              <Route path="certificados" element={<Certificates />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="ingredientes" element={<Ingredients />} />
              <Route path="ingredientes/compra" element={<RegisterPurchase />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="requerimientos" element={<Requirements />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />
              <Route path="envios" element={<Envios />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="contabilidad" element={<Accounting />} />
              <Route path="reclamos" element={<ComplaintsList />} />
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
              <Route path="promociones" element={<Promotions />} />
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
              <Route path="flota" element={<Fleet />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="pedidos-online" element={<OnlineOrders />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="contabilidad" element={<Accounting />} />
            </Route>

            {/* Rutas de demo hotel (sin autenticación, con datos de ejemplo de hotel) */}
            <Route path="/demohotel" element={<DemoHotel />} />
            <Route path="/demohotel" element={<DemoHotelLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="habitaciones" element={<HotelRooms />} />
              <Route path="reservas" element={<HotelReservations />} />
              <Route path="servicios-hotel" element={<HotelServices />} />
              <Route path="housekeeping" element={<HotelHousekeeping />} />
              <Route path="auditoria-hotel" element={<HotelNightAudit />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="promociones" element={<Promotions />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="usuarios" element={<UserManagement />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="contabilidad" element={<Accounting />} />
            </Route>

            {/* Rutas de demo veterinaria (sin autenticación, con datos de ejemplo de veterinaria) */}
            <Route path="/demoveterinary" element={<DemoVeterinary />} />
            <Route path="/demoveterinary" element={<DemoVeterinaryLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="promociones" element={<Promotions />} />
              <Route path="productos" element={<Products />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="control-lotes" element={<BatchControl />} />
              <Route path="alertas-vencimiento" element={<ExpiryAlerts />} />
              <Route path="agenda-veterinaria" element={<VeterinaryAgenda />} />
              <Route path="alertas-veterinaria" element={<VeterinaryAlerts />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="pedidos-online" element={<OnlineOrders />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="cotizaciones/editar/:id" element={<CreateQuotation />} />
              <Route path="ordenes-compra" element={<PurchaseOrders />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="flota" element={<Fleet />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="contabilidad" element={<Accounting />} />
              <Route path="reclamos" element={<ComplaintsList />} />
            </Route>

            {/* Rutas de demo logística (datos de ejemplo de obras/almacén) */}
            <Route path="/demologistics" element={<DemoLogistics />} />
            <Route path="/demologistics" element={<DemoLogisticsLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pos" element={<POS />} />
              <Route path="caja" element={<CashRegister />} />
              <Route path="facturas" element={<InvoiceList />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="promociones" element={<Promotions />} />
              <Route path="productos" element={<Products />} />
              <Route path="proyectos" element={<Projects />} />
              <Route path="salidas-almacen" element={<WarehouseExits />} />
              <Route path="retornos-almacen" element={<WarehouseReturns />} />
              <Route path="reportes-logisticos" element={<LogisticsReports />} />
              <Route path="inventario" element={<Inventory />} />
              <Route path="almacenes" element={<Warehouses />} />
              <Route path="movimientos" element={<StockMovements />} />
              <Route path="guias-remision" element={<DispatchGuides />} />
              <Route path="compras" element={<Purchases />} />
              <Route path="compras/nueva" element={<CreatePurchase />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="reportes" element={<Reports />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="contabilidad" element={<Accounting />} />
              <Route path="cotizaciones" element={<Quotations />} />
              <Route path="cotizaciones/nueva" element={<CreateQuotation />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="flota" element={<Fleet />} />
              <Route path="mi-horario" element={<MySchedule />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="reclamos" element={<ComplaintsList />} />
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
              <Route path="emision-masiva" element={<BulkEmission />} />
              <Route path="guias-remision" element={<DispatchGuides />} />
              <Route path="guias-transportista" element={<CarrierDispatchGuides />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="promociones" element={<Promotions />} />
              <Route path="control-pagos-alumnos" element={<StudentPaymentControl />} />
              <Route path="vendedores" element={<Sellers />} />
              <Route path="flota" element={<Fleet />} />
              <Route path="asistencia" element={<Attendance />} />
              <Route path="mi-horario" element={<MySchedule />} />
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
              <Route path="meta-ads" element={<MetaAdsExport />} />
              <Route path="gastos" element={<Expenses />} />
              <Route path="prestamos" element={<Loans />} />
              <Route path="prestamos-cartera" element={<LendingPortfolio />} />
              <Route path="certificados" element={<Certificates />} />
              <Route path="flujo-caja" element={<CashFlow />} />
              <Route path="contabilidad" element={<Accounting />} />
              <Route path="reclamos" element={<ComplaintsList />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="usuarios" element={<Users />} />
              <Route path="mi-suscripcion" element={<MySubscription />} />
              {/* Manual de uso: accesible para todos los usuarios (no requiere permiso de página) */}
              <Route path="manual" element={<Manual />} />
              <Route path="manual/:guideId" element={<Manual />} />
              <Route path="business/new" element={<BusinessCreate />} />

              {/* Rutas de modo restaurante */}
              <Route path="mesas" element={<Tables />} />
              <Route path="mozos" element={<Waiters />} />
              <Route path="ordenes" element={<Orders />} />
              <Route path="cocina" element={<Kitchen />} />
              <Route path="ingredientes" element={<Ingredients />} />
              <Route path="ingredientes/compra" element={<RegisterPurchase />} />
              <Route path="ingredientes/historial" element={<PurchaseHistory />} />
              <Route path="requerimientos" element={<Requirements />} />
              <Route path="recetas" element={<Recipes />} />
              <Route path="produccion" element={<Production />} />
              <Route path="envios" element={<Envios />} />

              {/* Pedidos online (modo retail — tienda virtual) */}
              <Route path="pedidos-online" element={<OnlineOrders />} />

              {/* Pedidos Rappi (modo restaurante — gated por businessSettings.rappiEnabled) */}
              <Route path="pedidos-rappi" element={<RappiOrders />} />

              {/* Rutas de modo farmacia */}
              <Route path="laboratorios" element={<Laboratories />} />
              <Route path="alertas-vencimiento" element={<ExpiryAlerts />} />
              <Route path="control-lotes" element={<BatchControl />} />

              {/* Rutas de modo hotel */}
              <Route path="habitaciones" element={<HotelRooms />} />
              <Route path="reservas" element={<HotelReservations />} />
              <Route path="servicios-hotel" element={<HotelServices />} />
              <Route path="housekeeping" element={<HotelHousekeeping />} />
              <Route path="auditoria-hotel" element={<HotelNightAudit />} />

              {/* Rutas de modo logística */}
              <Route path="proyectos" element={<Projects />} />
              <Route path="salidas-almacen" element={<WarehouseExits />} />
              <Route path="retornos-almacen" element={<WarehouseReturns />} />
              <Route path="reportes-logisticos" element={<LogisticsReports />} />

              {/* Rutas de modo inmobiliaria */}
              <Route path="propiedades" element={<Properties />} />
              <Route path="agentes" element={<Agents />} />
              <Route path="operaciones" element={<Operations />} />
              <Route path="comisiones" element={<Commissions />} />

              {/* Rutas de modo veterinaria */}
              <Route path="agenda-veterinaria" element={<VeterinaryAgenda />} />
              <Route path="alertas-veterinaria" element={<VeterinaryAlerts />} />

              {/* Rutas de administración legacy eliminadas - usar /app/admin/dashboard */}
            </Route>

            {/* Panel de Administración (nuevo) */}
            <Route path="/app/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="resellers" element={<AdminResellers />} />
              <Route path="expirations" element={<AdminExpirations />} />
              <Route path="plan-distribution" element={<AdminPlanDistribution />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="cpe" element={<AdminCpe />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="investor-report" element={<AdminInvestorReport />} />
              <Route path="notifications" element={<AdminNotifications />} />
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
            </Suspense>
          <AppLifecycleManager />
          </ToastProvider>
        </BrandingProvider>
      </AuthProvider>
    </Router>
  )
}

export default App

import { memo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Truck,
  ShoppingBag,
  Wallet,
  CreditCard,
  Shield,
  FileCheck,
  UserCog,
  ClipboardList,
  History,
  Building2,
  Landmark,
  Receipt,
  TrendingUp,
  GraduationCap,
  // Iconos para modo restaurante
  UtensilsCrossed,
  Grid3x3,
  ChefHat,
  ListOrdered,
  Carrot,
  CookingPot,
  // Iconos para modo farmacia
  Pill,
  FlaskConical,
  AlertTriangle,
  Calendar,
  // Iconos para modo inmobiliaria
  Home,
  Key,
  Handshake,
  MapPin,
  DollarSign,
  UserCheck,
  Award,
  BookOpen,
} from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { useAppContext } from '@/hooks/useAppContext'
import { useBranding } from '@/contexts/BrandingContext'

function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen } = useStore()
  const { isAdmin, isBusinessOwner, isReseller, isDemoMode, hasPageAccess, businessMode, businessSettings, hasFeature } = useAppContext()
  const { branding } = useBranding()
  const location = useLocation()

  // Si estamos en modo demo, añadir prefijo /demo, /demorestaurant o /demopharmacy a las rutas
  // Si no, añadir prefijo /app para rutas protegidas
  const getPath = (path) => {
    if (isDemoMode) {
      // Detectar qué tipo de demo estamos usando
      if (location.pathname.startsWith('/demorestaurant')) {
        return `/demorestaurant${path}`
      }
      if (location.pathname.startsWith('/demopharmacy')) {
        return `/demopharmacy${path}`
      }
      return `/demo${path}`
    }
    // Para rutas normales (no demo), agregar prefijo /app
    return `/app${path}`
  }

  // Menú para modo RETAIL (tiendas, comercios)
  // menuId: ID para personalización del menú (hiddenMenuItems)
  // pageId: ID para control de acceso de usuarios secundarios
  const retailMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
    {
      path: '/cotizaciones',
      icon: FileCheck,
      label: 'Cotizaciones',
      pageId: 'invoices', // Mismo permiso que facturas
      menuId: 'quotations',
    },
    {
      path: '/guias-remision',
      icon: Truck,
      label: 'GRE Remitente',
      pageId: 'dispatch-guides',
      menuId: 'dispatch-guides',
    },
    {
      path: '/guias-transportista',
      icon: Truck,
      label: 'GRE Transportista',
      pageId: 'dispatch-guides',
      menuId: 'carrier-dispatch-guides',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
    {
      path: '/control-pagos-alumnos',
      icon: GraduationCap,
      label: 'Control de Alumnos',
      pageId: 'customers',
      menuId: 'student-payments',
      requiresStudentField: true,
    },
    {
      path: '/vendedores',
      icon: UserCog,
      label: 'Vendedores',
      pageId: 'sellers',
      menuId: 'sellers',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
      pageId: 'products',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory', // Permiso propio de inventario
      menuId: 'inventory',
    },
    {
      path: '/almacenes',
      icon: Warehouse,
      label: 'Almacenes',
      pageId: 'products', // Mismo permiso que productos
      menuId: 'warehouses',
    },
    {
      path: '/movimientos',
      icon: History,
      label: 'Movimientos',
      pageId: 'products', // Mismo permiso que productos/inventario
      menuId: 'stock-movements',
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
      pageId: 'purchases', // Relacionado con compras
      menuId: 'suppliers',
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
      pageId: 'purchases',
      menuId: 'purchases',
    },
    {
      path: '/ordenes-compra',
      icon: ClipboardList,
      label: 'Órdenes de Compra',
      pageId: 'purchase-orders',
      menuId: 'purchase-orders',
    },
    {
      path: '/prestamos',
      icon: Landmark,
      label: 'Préstamos',
      pageId: 'loans',
      menuId: 'loans',
    },
    {
      path: '/certificados',
      icon: Award,
      label: 'Certificados',
      pageId: 'certificates',
      menuId: 'certificates',
      requiresFeature: 'certificates',
    },
    {
      path: '/ingredientes',
      icon: Package,
      label: 'Insumos',
      pageId: 'ingredients',
      menuId: 'ingredients',
    },
    {
      path: '/recetas',
      icon: ClipboardList,
      label: 'Composición',
      pageId: 'recipes',
      menuId: 'recipes',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
      menuId: 'reports',
    },
    {
      path: '/gastos',
      icon: Receipt,
      label: 'Gastos',
      pageId: 'expenses',
      menuId: 'expenses',
      // Ahora controlado por el usuario en Preferencias (no requiresFeature)
    },
    {
      path: '/flujo-caja',
      icon: TrendingUp,
      label: 'Flujo de Caja',
      pageId: 'reports',
      menuId: 'cash-flow',
    },
    {
      path: '/reclamos',
      icon: BookOpen,
      label: 'Libro de Reclamos',
      pageId: 'complaints',
      menuId: 'complaints',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
      // No tiene menuId = módulo principal que no se puede ocultar
    },
  ]

  // Menú para modo RESTAURANT (restaurantes, cafeterías, bares)
  const restaurantMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/ordenes',
      icon: ListOrdered,
      label: 'Órdenes',
      pageId: 'orders',
      menuId: 'orders',
    },
    {
      path: '/mesas',
      icon: Grid3x3,
      label: 'Mesas',
      pageId: 'tables',
      menuId: 'tables',
    },
    {
      path: '/cocina',
      icon: ChefHat,
      label: 'Cocina',
      pageId: 'kitchen',
      menuId: 'kitchen',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/productos',
      icon: UtensilsCrossed,
      label: 'Menú',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory', // Permiso propio de inventario
      menuId: 'inventory',
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
      pageId: 'purchases',
      menuId: 'purchases',
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
      pageId: 'purchases', // Relacionado con compras
      menuId: 'suppliers',
    },
    {
      path: '/ingredientes',
      icon: Carrot,
      label: 'Ingredientes',
      pageId: 'ingredients',
      menuId: 'ingredients',
    },
    {
      path: '/recetas',
      icon: CookingPot,
      label: 'Recetas',
      pageId: 'recipes',
      menuId: 'recipes',
    },
    {
      path: '/ingredientes/historial',
      icon: History,
      label: 'Historial de Compras',
      pageId: 'purchase-history',
      menuId: 'purchase-history',
    },
    {
      path: '/mozos',
      icon: Users,
      label: 'Mozos',
      pageId: 'waiters',
      menuId: 'waiters',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
      menuId: 'reports',
    },
    {
      path: '/gastos',
      icon: Receipt,
      label: 'Gastos',
      pageId: 'expenses',
      menuId: 'expenses',
    },
    {
      path: '/flujo-caja',
      icon: TrendingUp,
      label: 'Flujo de Caja',
      pageId: 'reports',
      menuId: 'cash-flow',
    },
    {
      path: '/reclamos',
      icon: BookOpen,
      label: 'Libro de Reclamos',
      pageId: 'complaints',
      menuId: 'complaints',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo FARMACIA (farmacias, boticas, droguerías)
  const pharmacyMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
      pageId: 'pos',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
      pageId: 'cash-register',
      menuId: 'cash-register',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Ventas',
      pageId: 'invoices',
    },
    {
      path: '/cotizaciones',
      icon: FileCheck,
      label: 'Cotizaciones',
      pageId: 'invoices',
      menuId: 'quotations',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Pill,
      label: 'Medicamentos',
      pageId: 'products',
    },
    {
      path: '/laboratorios',
      icon: FlaskConical,
      label: 'Laboratorios',
      pageId: 'laboratories',
      menuId: 'laboratories',
    },
    {
      path: '/inventario',
      icon: ClipboardList,
      label: 'Inventario',
      pageId: 'inventory',
      menuId: 'inventory',
    },
    {
      path: '/control-lotes',
      icon: Package,
      label: 'Control de Lotes',
      pageId: 'batch-control',
      menuId: 'batch-control',
    },
    {
      path: '/alertas-vencimiento',
      icon: AlertTriangle,
      label: 'Alertas Vencimiento',
      pageId: 'expiry-alerts',
      menuId: 'expiry-alerts',
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
      pageId: 'suppliers',
      menuId: 'suppliers',
    },
    {
      path: '/guias-remision',
      icon: Truck,
      label: 'GRE Remitente',
      pageId: 'dispatch-guides',
      menuId: 'dispatch-guides',
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
      pageId: 'purchases',
      menuId: 'purchases',
    },
    {
      path: '/ordenes-compra',
      icon: ClipboardList,
      label: 'Órdenes de Compra',
      pageId: 'purchase-orders',
      menuId: 'purchase-orders',
    },
    {
      path: '/prestamos',
      icon: Landmark,
      label: 'Préstamos',
      pageId: 'loans',
      menuId: 'loans',
    },
    {
      path: '/certificados',
      icon: Award,
      label: 'Certificados',
      pageId: 'certificates',
      menuId: 'certificates',
      requiresFeature: 'certificates',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
      menuId: 'reports',
    },
    {
      path: '/gastos',
      icon: Receipt,
      label: 'Gastos',
      pageId: 'expenses',
      menuId: 'expenses',
    },
    {
      path: '/flujo-caja',
      icon: TrendingUp,
      label: 'Flujo de Caja',
      pageId: 'reports',
      menuId: 'cash-flow',
    },
    {
      path: '/reclamos',
      icon: BookOpen,
      label: 'Libro de Reclamos',
      pageId: 'complaints',
      menuId: 'complaints',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Menú para modo INMOBILIARIA (agencias, corredores)
  const realEstateMenuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      pageId: 'dashboard',
    },
    {
      path: '/propiedades',
      icon: Home,
      label: 'Propiedades',
      pageId: 'properties',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/agentes',
      icon: UserCheck,
      label: 'Agentes',
      pageId: 'agents',
    },
    {
      path: '/operaciones',
      icon: Handshake,
      label: 'Operaciones',
      pageId: 'operations',
    },
    {
      path: '/comisiones',
      icon: DollarSign,
      label: 'Comisiones',
      pageId: 'commissions',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
    },
    {
      path: '/usuarios',
      icon: UserCog,
      label: 'Gestión de Usuarios',
      pageId: 'users',
    },
    {
      path: '/reclamos',
      icon: BookOpen,
      label: 'Libro de Reclamos',
      pageId: 'complaints',
      menuId: 'complaints',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Seleccionar menú según el modo de negocio
  // Si businessMode es null (cargando), no mostrar nada aún
  const menuItems = businessMode === 'restaurant'
    ? restaurantMenuItems
    : businessMode === 'pharmacy'
      ? pharmacyMenuItems
      : businessMode === 'real_estate'
        ? realEstateMenuItems
        : (businessMode === 'retail' || businessMode === 'transport')
          ? retailMenuItems
          : [] // Si es null, array vacío mientras carga

  // Agregar opciones adicionales según el rol
  const additionalItems = [
    {
      path: '/mi-suscripcion',
      icon: CreditCard,
      label: 'Mi Suscripción',
      adminOnly: false,
      businessOwnerOnly: true, // Solo visible para el usuario principal/owner
      pageId: null,
      hideOnIOS: true, // Ocultar en iOS por política de Apple (Guideline 3.1.1)
    },
    {
      path: '/usuarios',
      icon: UserCog,
      label: 'Gestión de Usuarios',
      businessOwnerOnly: true, // Solo para business owners, NO para super admins
      pageId: 'users',
    },
    {
      path: '/reseller/dashboard',
      icon: Building2,
      label: 'Panel Reseller',
      resellerOnly: true, // Solo para resellers
      isExternalPath: true, // No usar getPath, es ruta absoluta
      pageId: null,
    },
    {
      path: '/admin/dashboard',
      icon: Shield,
      label: 'Panel Admin',
      adminOnly: true, // Solo para super admins
      pageId: null,
    },
  ]

  // Obtener lista de items ocultos por el usuario
  const hiddenMenuItems = businessSettings?.hiddenMenuItems || []

  // Filtrar items del menú según permisos
  const filteredMenuItems = menuItems.filter((item) => {
    // Si el item tiene menuId y está en la lista de ocultos, no mostrar
    // (Solo aplica a usuarios no-demo, y solo a items con menuId definido)
    if (item.menuId && hiddenMenuItems.includes(item.menuId) && !isDemoMode) {
      return false
    }

    // Si requiere un feature específico, verificar que lo tenga
    if (item.requiresFeature) {
      const featureEnabled = hasFeature && hasFeature(item.requiresFeature)
      if (!featureEnabled && !isDemoMode) return false
    }

    // Si requiere el campo de alumno habilitado, verificar
    if (item.requiresStudentField) {
      const studentFieldEnabled = businessSettings?.posCustomFields?.showStudentField
      if (!studentFieldEnabled && !isDemoMode) return false
    }

    // Si es solo para business owner y el usuario no lo es, no mostrar
    if (item.businessOwnerOnly && !isBusinessOwner) return false

    // Si estamos en modo demo, mostrar todo
    if (isDemoMode) return true

    // Si es admin o business owner, mostrar todo (excepto features, ya se validó arriba)
    if (isAdmin || isBusinessOwner) {
      // Para features, ya se validó arriba, así que si llegó aquí es que lo tiene
      return true
    }

    // Si no tiene pageId, permitir acceso (sin restricción)
    if (!item.pageId) return true

    // Verificar si tiene permiso para esta página
    const hasAccess = hasPageAccess && hasPageAccess(item.pageId)
    console.log(`🔍 Verificando acceso a "${item.label}" (${item.pageId}):`, hasAccess)
    return hasAccess
  })

  console.log('✅ Items filtrados:', filteredMenuItems.length, 'de', menuItems.length)

  // Detectar si estamos en iOS nativo
  const isIOSNative = Capacitor.getPlatform() === 'ios'

  const filteredAdditionalItems = additionalItems.filter((item) => {
    // Ocultar en iOS si tiene la bandera hideOnIOS (política Apple Guideline 3.1.1)
    if (item.hideOnIOS && isIOSNative) return false

    // Si es solo para admin y el usuario no es admin, no mostrar
    if (item.adminOnly && !isAdmin) return false

    // Si es solo para business owner y el usuario no lo es (o es super admin), no mostrar
    if (item.businessOwnerOnly && (!isBusinessOwner || isAdmin)) return false

    // Si es solo para reseller y el usuario no es reseller, no mostrar
    if (item.resellerOnly && !isReseller) return false

    // Si estamos en modo demo, mostrar todo excepto reseller
    if (isDemoMode && !item.resellerOnly) return true

    // Si no tiene pageId, permitir acceso
    if (!item.pageId) return true

    // Verificar si tiene permiso
    return hasPageAccess && hasPageAccess(item.pageId)
  })

  return (
    <>
      {/* Overlay para móvil */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-[100dvh] bg-white border-r border-gray-200 transition-all duration-300 z-50 w-64 sidebar-ios
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
      {/* Logo - Dinámico según branding del reseller */}
      <div className="h-16 flex items-center justify-center px-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.companyName} - Sistema de facturación electrónica`}
              className="w-10 h-10 object-contain"
              width="40"
              height="40"
              loading="eager"
            />
          ) : (
            <img
              src="/logo.png"
              alt={`${branding.companyName} - Sistema de facturación electrónica`}
              className="w-10 h-10 object-contain"
              width="40"
              height="40"
              loading="eager"
            />
          )}
          <span
            className="text-xl font-bold"
            style={{ color: branding.primaryColor || '#111827' }}
          >
            {branding.companyName}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1 overflow-y-auto" style={{ height: 'calc(100dvh - 4rem - env(safe-area-inset-bottom, 0px))' }}>
        {/* Skeleton loader mientras carga businessMode */}
        {!businessMode && (
          <div className="space-y-2 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3 px-3 py-2">
                <div className="w-5 h-5 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-24" />
              </div>
            ))}
          </div>
        )}
        {filteredMenuItems.map(item => (
          <NavLink
            key={item.path}
            to={getPath(item.path)}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${
                isActive
                  ? ''
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
            style={({ isActive }) => isActive ? {
              backgroundColor: `${branding.primaryColor}15`,
              color: branding.primaryColor
            } : {}}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="w-5 h-5 flex-shrink-0"
                  style={isActive ? { color: branding.primaryColor } : { color: '#6B7280' }}
                />
                <span className="font-medium text-sm">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Separador */}
        <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
          {filteredAdditionalItems.map(item => {
            const itemPath = item.isExternalPath ? item.path : getPath(item.path)
            return (
              <NavLink
                key={item.path}
                to={itemPath}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${
                    isActive
                      ? ''
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  backgroundColor: `${branding.primaryColor}15`,
                  color: branding.primaryColor
                } : {}}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className="w-5 h-5 flex-shrink-0"
                      style={isActive ? { color: branding.primaryColor } : { color: '#6B7280' }}
                    />
                    <span className="font-medium text-sm">{item.label}</span>
                    {item.adminOnly && (
                      <span className="ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                    {item.resellerOnly && (
                      <span className="ml-auto text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Reseller
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>

        {/* Espaciador inferior para iOS - permite que el scroll muestre la última opción */}
        <div style={{ height: '34px', flexShrink: 0 }} />
      </nav>
    </aside>
    </>
  )
}

export default memo(Sidebar)

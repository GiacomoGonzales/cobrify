import { NavLink, useLocation } from 'react-router-dom'
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
} from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { useAppContext } from '@/hooks/useAppContext'

export default function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen } = useStore()
  const { isAdmin, isDemoMode, hasPageAccess } = useAppContext()
  const location = useLocation()

  // Si estamos en modo demo, añadir prefijo /demo a las rutas
  const getPath = (path) => {
    if (isDemoMode) {
      return `/demo${path}`
    }
    return path
  }

  const menuItems = [
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
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Facturas',
      pageId: 'invoices',
    },
    {
      path: '/cotizaciones',
      icon: FileCheck,
      label: 'Cotizaciones',
      pageId: 'invoices', // Mismo permiso que facturas
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
      pageId: 'customers',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
      pageId: 'products',
    },
    {
      path: '/inventario',
      icon: Warehouse,
      label: 'Inventario',
      pageId: 'products', // Mismo permiso que productos
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
      pageId: 'purchases', // Relacionado con compras
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
      pageId: 'purchases',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
      pageId: 'reports',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
      pageId: 'settings',
    },
  ]

  // Agregar opciones adicionales según el rol
  const additionalItems = [
    {
      path: '/mi-suscripcion',
      icon: CreditCard,
      label: 'Mi Suscripción',
      adminOnly: false,
      pageId: null, // Todos tienen acceso
    },
    {
      path: '/usuarios',
      icon: UserCog,
      label: 'Gestión de Usuarios',
      adminOnly: true,
      pageId: 'users',
    },
  ]

  // Filtrar items del menú según permisos
  const filteredMenuItems = menuItems.filter((item) => {
    // Si estamos en modo demo, mostrar todo
    if (isDemoMode) return true

    // Si es admin, mostrar todo
    if (isAdmin) return true

    // Si no tiene pageId, permitir acceso (sin restricción)
    if (!item.pageId) return true

    // Verificar si tiene permiso para esta página
    return hasPageAccess && hasPageAccess(item.pageId)
  })

  const filteredAdditionalItems = additionalItems.filter((item) => {
    // Si es solo para admin y el usuario no es admin, no mostrar
    if (item.adminOnly && !isAdmin) return false

    // Si estamos en modo demo, mostrar todo
    if (isDemoMode) return true

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
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-50 w-64
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center px-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <img
            src="/logo.png"
            alt="Cobrify - Sistema de facturación electrónica"
            className="w-8 h-8 object-contain"
            width="32"
            height="32"
            loading="eager"
          />
          <span className="text-xl font-bold text-gray-900">Cobrify</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
        {filteredMenuItems.map(item => (
          <NavLink
            key={item.path}
            to={getPath(item.path)}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${
                isActive
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 ${
                    isActive ? 'text-primary-600' : 'text-gray-500 group-hover:text-gray-700'
                  }`}
                />
                <span className="font-medium text-sm">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Separador */}
        <div className="pt-2 border-t border-gray-200 mt-2 space-y-1">
          {filteredAdditionalItems.map(item => {
            return (
              <NavLink
                key={item.path}
                to={getPath(item.path)}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={`w-5 h-5 flex-shrink-0 ${
                        isActive ? 'text-primary-600' : 'text-gray-500 group-hover:text-gray-700'
                      }`}
                    />
                    <span className="font-medium text-sm">{item.label}</span>
                    {item.adminOnly && (
                      <span className="ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </aside>
    </>
  )
}

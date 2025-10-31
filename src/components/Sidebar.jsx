import { NavLink } from 'react-router-dom'
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
} from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { useAuth } from '@/contexts/AuthContext'

export default function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen } = useStore()
  const { isAdmin } = useAuth()

  const menuItems = [
    {
      path: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
    },
    {
      path: '/pos',
      icon: ShoppingCart,
      label: 'Punto de Venta',
      badge: 'POS',
    },
    {
      path: '/caja',
      icon: Wallet,
      label: 'Control de Caja',
    },
    {
      path: '/facturas',
      icon: FileText,
      label: 'Facturas',
    },
    {
      path: '/cotizaciones',
      icon: FileCheck,
      label: 'Cotizaciones',
    },
    {
      path: '/clientes',
      icon: Users,
      label: 'Clientes',
    },
    {
      path: '/productos',
      icon: Package,
      label: 'Productos',
    },
    {
      path: '/inventario',
      icon: Warehouse,
      label: 'Inventario',
    },
    {
      path: '/proveedores',
      icon: Truck,
      label: 'Proveedores',
    },
    {
      path: '/compras',
      icon: ShoppingBag,
      label: 'Compras',
    },
    {
      path: '/reportes',
      icon: BarChart3,
      label: 'Reportes',
    },
    {
      path: '/configuracion',
      icon: Settings,
      label: 'Configuración',
    },
  ]

  // Agregar opciones adicionales según el rol
  const additionalItems = [
    {
      path: '/mi-suscripcion',
      icon: CreditCard,
      label: 'Mi Suscripción',
      adminOnly: false,
    },
    {
      path: '/admin/users',
      icon: Shield,
      label: 'Gestión de Usuarios',
      adminOnly: true,
    },
  ]

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
        {menuItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
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
          {additionalItems.map(item => {
            // Si es solo para admin y el usuario no es admin, no mostrar
            if (item.adminOnly && !isAdmin) return null

            return (
              <NavLink
                key={item.path}
                to={item.path}
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

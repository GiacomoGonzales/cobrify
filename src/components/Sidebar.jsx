import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
} from 'lucide-react'
import { useStore } from '@/stores/useStore'

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
    path: '/facturas',
    icon: FileText,
    label: 'Facturas',
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
    path: '/configuracion',
    icon: Settings,
    label: 'Configuración',
  },
]

export default function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen } = useStore()

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
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">Cobrify</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {menuItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors group ${
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
      </nav>
    </aside>
    </>
  )
}

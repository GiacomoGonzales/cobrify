import React, { useState } from 'react'
import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  Menu,
  X,
  Bell,
  Search,
  Building2
} from 'lucide-react'

const navItems = [
  {
    path: '/app/admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    description: 'Métricas y KPIs'
  },
  {
    path: '/app/admin/users',
    icon: Users,
    label: 'Usuarios',
    description: 'Gestión de cuentas'
  },
  {
    path: '/app/admin/resellers',
    icon: Building2,
    label: 'Resellers',
    description: 'Red de revendedores'
  },
  {
    path: '/app/admin/payments',
    icon: CreditCard,
    label: 'Pagos',
    description: 'Historial de pagos'
  },
  {
    path: '/app/admin/analytics',
    icon: BarChart3,
    label: 'Analytics',
    description: 'Reportes y gráficos'
  },
  {
    path: '/app/admin/settings',
    icon: Settings,
    label: 'Configuración',
    description: 'Ajustes del sistema'
  }
]

export default function AdminLayout() {
  const { isAdmin, isLoading, user, logout } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando panel de administración...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />
  }

  const currentPage = navItems.find(item => location.pathname.startsWith(item.path))

  return (
    <div className="min-h-screen bg-gray-100 pt-safe overflow-x-hidden max-w-full">
      {/* Mobile Header */}
      <div className="lg:hidden bg-indigo-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-indigo-800 rounded-lg -ml-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <Shield className="w-7 h-7" />
          <span className="font-bold text-lg">Admin Panel</span>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50 pt-safe" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-indigo-900 w-72 h-full pt-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-indigo-800">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-white" />
                <span className="font-bold text-lg text-white">Admin Panel</span>
              </div>
            </div>
            <nav className="p-4 space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="flex w-full">
        {/* Sidebar - Desktop */}
        <aside
          className={`hidden lg:flex flex-col bg-indigo-900 text-white min-h-screen transition-all duration-300 ${
            sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          {/* Logo */}
          <div className="p-4 border-b border-indigo-800">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 flex-shrink-0" />
              {!sidebarCollapsed && (
                <div>
                  <span className="font-bold text-lg">Admin Panel</span>
                  <p className="text-xs text-indigo-300">Cobrify</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                title={sidebarCollapsed ? item.label : ''}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-indigo-700 text-white shadow-lg'
                      : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <div>
                    <span className="font-medium">{item.label}</span>
                    <p className="text-xs text-indigo-300">{item.description}</p>
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User Info & Collapse Button */}
          <div className="p-4 border-t border-indigo-800">
            {!sidebarCollapsed && (
              <div className="mb-4 p-3 bg-indigo-800 rounded-lg">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-indigo-300">Super Administrador</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 hover:bg-indigo-800 rounded-lg transition-colors"
                title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="w-5 h-5" />
                ) : (
                  <ChevronLeft className="w-5 h-5" />
                )}
              </button>

              {!sidebarCollapsed && (
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-200 hover:text-white hover:bg-indigo-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Salir
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-screen min-w-0 overflow-x-hidden">
          {/* Top Bar */}
          <header className="bg-white shadow-sm border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg lg:text-xl font-bold text-gray-900 truncate">
                  {currentPage?.label || 'Admin'}
                </h1>
                <p className="text-xs lg:text-sm text-gray-500 hidden sm:block">
                  {currentPage?.description || 'Panel de administración'}
                </p>
              </div>

              <div className="flex items-center gap-2 lg:gap-4">
                {/* Search - solo desktop */}
                <div className="hidden lg:flex items-center bg-gray-100 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="bg-transparent border-none outline-none text-sm w-48"
                  />
                </div>

                {/* Notifications */}
                <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>

                {/* Back to App */}
                <NavLink
                  to="/app/dashboard"
                  className="flex items-center gap-1 lg:gap-2 px-2 lg:px-4 py-2 text-xs lg:text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Volver a la App</span>
                  <span className="sm:hidden">App</span>
                </NavLink>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-3 sm:p-4 lg:p-6 w-full max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

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
  Search,
  Building2
} from 'lucide-react'

const navItems = [
  {
    path: '/app/admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    description: 'Métricas y KPIs',
    color: 'from-violet-500 to-purple-600'
  },
  {
    path: '/app/admin/users',
    icon: Users,
    label: 'Usuarios',
    description: 'Gestión de cuentas',
    color: 'from-blue-500 to-cyan-600'
  },
  {
    path: '/app/admin/resellers',
    icon: Building2,
    label: 'Resellers',
    description: 'Red de revendedores',
    color: 'from-emerald-500 to-teal-600'
  },
  {
    path: '/app/admin/payments',
    icon: CreditCard,
    label: 'Pagos',
    description: 'Historial de pagos',
    color: 'from-amber-500 to-orange-600'
  },
  {
    path: '/app/admin/analytics',
    icon: BarChart3,
    label: 'Analytics',
    description: 'Reportes y gráficos',
    color: 'from-pink-500 to-rose-600'
  },
  {
    path: '/app/admin/settings',
    icon: Settings,
    label: 'Configuración',
    description: 'Ajustes del sistema',
    color: 'from-slate-500 to-gray-600'
  }
]

export default function AdminLayout() {
  const { isAdmin, isLoading, user, logout } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white/70">Cargando panel de administración...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />
  }

  const currentPage = navItems.find(item => location.pathname.startsWith(item.path))

  return (
    <div className="min-h-screen bg-gray-50 pt-safe overflow-x-hidden max-w-full">
      {/* Mobile Header */}
      <div className="lg:hidden bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors -ml-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <span className="font-bold">Admin</span>
          </div>
        </div>
        <NavLink
          to="/app/dashboard"
          className="p-2 hover:bg-white/10 rounded-xl transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </NavLink>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pt-safe" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 w-80 h-full pt-safe shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile Menu Header */}
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="font-bold text-lg text-white">Admin Panel</span>
                  <p className="text-xs text-white/50">Sistema de gestión</p>
                </div>
              </div>
            </div>

            {/* Mobile Nav Items */}
            <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-white/15 shadow-lg'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${item.color} shadow-md`}>
                      <item.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className={`font-medium ${isActive ? 'text-white' : 'text-white/80'}`}>
                        {item.label}
                      </span>
                      <p className="text-xs text-white/40">{item.description}</p>
                    </div>
                  </NavLink>
                )
              })}
            </nav>

            {/* Mobile User Info */}
            <div className="p-4 border-t border-white/10">
              <div className="p-3 bg-white/5 rounded-xl mb-3">
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                <p className="text-xs text-white/50">Super Administrador</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full">
        {/* Sidebar - Desktop */}
        <aside
          className={`hidden lg:flex flex-col bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 text-white min-h-screen transition-all duration-300 relative ${
            sidebarCollapsed ? 'w-20' : 'w-72'
          }`}
        >
          {/* Decorative blur */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>

          {/* Logo */}
          <div className="relative z-10 p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/30 flex-shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <span className="font-bold text-lg">Admin Panel</span>
                  <p className="text-xs text-white/50 mt-0.5">Cobrify Pro</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="relative z-10 flex-1 p-4 space-y-1.5">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : ''}
                  className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-white/15 shadow-lg backdrop-blur-sm'
                      : 'hover:bg-white/10'
                  }`}
                >
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${item.color} shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all flex-shrink-0`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <span className={`font-medium block ${isActive ? 'text-white' : 'text-white/80 group-hover:text-white'}`}>
                        {item.label}
                      </span>
                      <p className="text-xs text-white/40 truncate">{item.description}</p>
                    </div>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* User Info & Collapse Button */}
          <div className="relative z-10 p-4 border-t border-white/10">
            {!sidebarCollapsed && (
              <div className="mb-4 p-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-white/50 mt-0.5">Super Administrador</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2.5 hover:bg-white/10 rounded-xl transition-all hover:scale-105"
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
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
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
          <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-200/50 px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  {currentPage && (
                    <div className={`hidden sm:flex p-2 rounded-lg bg-gradient-to-br ${currentPage.color} shadow-md`}>
                      <currentPage.icon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-lg lg:text-xl font-bold text-gray-900 truncate">
                      {currentPage?.label || 'Admin'}
                    </h1>
                    <p className="text-xs lg:text-sm text-gray-500 hidden sm:block">
                      {currentPage?.description || 'Panel de administración'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 lg:gap-3">
                {/* Search - solo desktop */}
                <div className="hidden lg:flex items-center bg-gray-100/80 hover:bg-gray-100 rounded-xl px-4 py-2.5 transition-colors group">
                  <Search className="w-4 h-4 text-gray-400 mr-2 group-focus-within:text-indigo-500" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="bg-transparent border-none outline-none text-sm w-48 placeholder-gray-400"
                  />
                </div>

                {/* Back to App */}
                <NavLink
                  to="/app/dashboard"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 rounded-xl transition-all shadow-md hover:shadow-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Volver</span>
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

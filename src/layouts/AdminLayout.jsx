import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  Menu,
  X,
  Building2,
  CalendarClock,
  Bell,
  Sparkles,
  Package
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
    path: '/app/admin/expirations',
    icon: CalendarClock,
    label: 'Vencimientos',
    description: 'Gestión de vencimientos'
  },
  {
    path: '/app/admin/plan-distribution',
    icon: Package,
    label: 'Distribución de planes',
    description: 'Clientes por plan (ordenar catálogo)'
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
    path: '/app/admin/investor-report',
    icon: Sparkles,
    label: 'Reporte Inversores',
    description: 'Métricas consolidadas (bajo demanda)'
  },
  {
    path: '/app/admin/notifications',
    icon: Bell,
    label: 'Notificaciones',
    description: 'Campañas push'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Cambiar color del StatusBar para admin (navy de marca)
  useEffect(() => {
    const configureAdminStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setStyle({ style: Style.Dark })
          if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setBackgroundColor({ color: '#0A2540' })
          }
        } catch (error) {
          console.warn('Error configurando StatusBar admin:', error)
        }
      }
    }

    const restoreDefaultStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setStyle({ style: Style.Dark })
          if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setBackgroundColor({ color: '#1e40af' }) // primary-800
          }
        } catch (error) {
          console.warn('Error restaurando StatusBar:', error)
        }
      }
    }

    configureAdminStatusBar()

    return () => {
      restoreDefaultStatusBar()
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando panel de administración...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />
  }

  const currentPage = navItems.find(item => location.pathname.startsWith(item.path))

  return (
    <div className="bg-gray-50 overflow-x-hidden max-w-full" style={{ zoom: 0.8, minHeight: '125vh' }}>
      {/* iOS Status Bar */}
      <div className="ios-status-bar bg-gray-900 lg:hidden flex-shrink-0" />

      {/* Mobile Header */}
      <div className="lg:hidden bg-gray-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors -ml-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-300" />
            <span className="font-semibold">Admin</span>
          </div>
        </div>
        <NavLink
          to="/app/dashboard"
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          title="Ir al Dashboard"
        >
          <LayoutDashboard className="w-5 h-5" />
        </NavLink>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 pt-safe" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="bg-gray-900 w-80 h-full pt-safe shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile Menu Header */}
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-300 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-lg text-white">Admin Panel</span>
                  <p className="text-xs text-white/50">Cobrify</p>
                </div>
              </div>
            </div>

            {/* Mobile Nav Items */}
            <nav className="p-4 space-y-1 flex-1 overflow-y-auto sidebar-scrollbar">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path)
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Mobile User Info */}
            <div className="p-4 border-t border-white/10">
              <div className="px-3 py-2.5 mb-3">
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                <p className="text-xs text-white/50">Super Administrador</p>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full">
        {/* Sidebar - Desktop (fixed) */}
        <aside
          className="hidden lg:flex flex-col bg-gray-900 text-white fixed top-0 left-0 z-30 w-72"
          style={{ height: '125vh' }}
        >
          {/* Logo */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Shield className="w-7 h-7 text-blue-300 flex-shrink-0" />
              <div>
                <span className="font-semibold text-lg">Admin Panel</span>
                <p className="text-xs text-white/50 mt-0.5">Cobrify</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto sidebar-scrollbar">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium text-sm">{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-white/10">
            <div className="mb-3 px-3 py-2.5">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-white/50 mt-0.5">Super Administrador</p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => navigate('/app')}
                className="p-2.5 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title="Ir al Dashboard"
              >
                <LayoutDashboard className="w-5 h-5" />
              </button>

              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-h-screen min-w-0 overflow-x-hidden lg:ml-72">
          {/* Top Bar */}
          <header className="bg-white sticky top-0 z-40 border-b border-gray-200 px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg lg:text-xl font-semibold text-gray-900 truncate">
                  {currentPage?.label || 'Admin'}
                </h1>
                <p className="text-xs lg:text-sm text-gray-500 hidden sm:block">
                  {currentPage?.description || 'Panel de administración'}
                </p>
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

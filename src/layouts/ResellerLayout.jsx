import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Wallet,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2
} from 'lucide-react'

const navItems = [
  { path: '/reseller/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/reseller/clients', icon: Users, label: 'Mis Clientes' },
  { path: '/reseller/clients/new', icon: UserPlus, label: 'Crear Cliente' },
  { path: '/reseller/balance', icon: Wallet, label: 'Saldo' },
  { path: '/reseller/settings', icon: Settings, label: 'Configuración' },
]

export default function ResellerLayout() {
  const { user, logout, resellerData } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-emerald-800 to-emerald-900 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-emerald-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Cobrify</h1>
              <p className="text-emerald-300 text-xs">Panel Reseller</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white hover:bg-emerald-700 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reseller Info */}
        <div className="p-4 border-b border-emerald-700">
          <p className="text-emerald-200 text-xs uppercase tracking-wider mb-1">Reseller</p>
          <p className="text-white font-medium truncate">{resellerData?.companyName || user?.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-300" />
            <span className="text-emerald-100 text-sm">
              Saldo: <span className="font-bold text-white">S/ {(resellerData?.balance || 0).toFixed(2)}</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-lg'
                    : 'text-emerald-100 hover:bg-emerald-700'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
              <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-emerald-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-emerald-100 hover:bg-emerald-700 rounded-lg transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-6 h-6 text-gray-600" />
            </button>

            <div className="flex-1 lg:flex-none">
              <h2 className="text-lg font-semibold text-gray-800 lg:hidden text-center">
                Panel Reseller
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-gray-700">{resellerData?.companyName || 'Reseller'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

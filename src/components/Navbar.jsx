import { Bell, Search, User, LogOut, Menu } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useStore } from '@/stores/useStore'
import Button from './ui/Button'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { toggleMobileMenu } = useStore()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      {/* Left Side - Mobile Menu Button */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>

        {/* Search Bar - Hidden on small mobile */}
        <div className="hidden sm:block flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar facturas, clientes..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Search Button for Mobile */}
        <button className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Search className="w-5 h-5 text-gray-600" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-4 border-l border-gray-200">
          {/* User info - Hidden on mobile */}
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-gray-900">{user?.displayName || user?.email?.split('@')[0] || 'Usuario'}</p>
            <p className="text-xs text-gray-500">{user?.email || 'usuario@ejemplo.com'}</p>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            <button className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <User className="w-5 h-5" />
            </button>

            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

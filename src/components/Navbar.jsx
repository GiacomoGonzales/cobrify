import { useState, useEffect, useRef, memo } from 'react'
import { Bell, User, LogOut, Menu, Download } from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useBranding } from '@/contexts/BrandingContext'
import { useStore } from '@/stores/useStore'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { getUnreadNotifications, checkAndCreateSubscriptionNotifications } from '@/services/notificationService'
import NotificationPanel from './NotificationPanel'

function Navbar() {
  const { user, logout, subscription, isDemoMode, businessSettings } = useAppContext()
  const { branding } = useBranding()
  const { toggleMobileMenu } = useStore()
  const { isInstallable, promptInstall } = usePWAInstall()

  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const notificationRef = useRef(null)

  // Cargar notificaciones no leídas
  useEffect(() => {
    // En modo demo, no cargar notificaciones
    if (isDemoMode) {
      setUnreadCount(0);
      return;
    }

    const loadUnreadCount = async () => {
      if (!user?.uid) return;

      try {
        const unreadNotifications = await getUnreadNotifications(user.uid);
        setUnreadCount(unreadNotifications.length);
      } catch (error) {
        console.error('Error al cargar notificaciones:', error);
      }
    };

    loadUnreadCount();

    // Verificar y crear notificaciones de suscripción
    if (user?.uid && subscription) {
      checkAndCreateSubscriptionNotifications(user.uid, subscription);
    }

    // Actualizar cada 5 minutos
    const interval = setInterval(loadUnreadCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.uid, subscription, isDemoMode]);

  return (
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      {/* Left Side - Mobile Menu Button */}
      <div className="flex items-center space-x-3 flex-1">
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Install PWA Button - Solo visible cuando se puede instalar */}
        {isInstallable && (
          <button
            onClick={promptInstall}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
            title="Instalar aplicación"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Instalar App</span>
          </button>
        )}

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>

          {/* Panel de notificaciones */}
          <NotificationPanel
            userId={user?.uid}
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        {/* User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-4 border-l border-gray-200">
          {/* User info - Hidden on mobile */}
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-gray-900">{user?.displayName || user?.email?.split('@')[0] || 'Usuario'}</p>
            <p className="text-xs text-gray-500">{user?.email || 'usuario@ejemplo.com'}</p>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            {(businessSettings?.logoUrl || branding?.logoUrl) ? (
              <div className="h-9 max-w-[120px] flex-shrink-0">
                <img
                  src={businessSettings?.logoUrl || branding?.logoUrl}
                  alt="Logo"
                  className="h-full w-auto object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary-600" />
              </div>
            )}

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

export default memo(Navbar)

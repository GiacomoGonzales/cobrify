import { useState, useEffect, useRef, memo } from 'react'
import { Bell, User, LogOut, Menu, Download, ChevronDown, Check, Store, UtensilsCrossed, Pill, BedDouble, PawPrint, Truck, HardHat, Home, LayoutGrid } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useBranding } from '@/contexts/BrandingContext'
import { useStore } from '@/stores/useStore'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { getUnreadNotifications, checkAndCreateSubscriptionNotifications } from '@/services/notificationService'
import NotificationPanel from './NotificationPanel'

// Modo de negocio → etiqueta + ícono (para el selector de local del Navbar)
const MODE_META = {
  retail: { label: 'Comercio', icon: Store },
  restaurant: { label: 'Restaurante', icon: UtensilsCrossed },
  pharmacy: { label: 'Farmacia', icon: Pill },
  hotel: { label: 'Hotel', icon: BedDouble },
  veterinary: { label: 'Veterinaria', icon: PawPrint },
  transport: { label: 'Transporte', icon: Truck },
  logistics: { label: 'Logística', icon: HardHat },
  real_estate: { label: 'Inmobiliaria', icon: Home },
}

function Navbar() {
  const { user, logout, subscription, isDemoMode, businessMode, businessSettings, branches, filterBranchesByAccess, hasMainBranchAccess, branchScope, setBranchScope, baseBusinessMode } = useAppContext()
  const { branding } = useBranding()
  const { toggleMobileMenu } = useStore()
  const { isInstallable, promptInstall } = usePWAInstall()
  const navigate = useNavigate()

  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showBranchMenu, setShowBranchMenu] = useState(false)

  const notificationRef = useRef(null)
  const branchMenuRef = useRef(null)

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

  // Cerrar el menú de locales al hacer click fuera
  useEffect(() => {
    if (!showBranchMenu) return
    const handler = (e) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target)) setShowBranchMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBranchMenu])

  // Locales accesibles (Principal + sucursales según permisos). Cada uno con su modo:
  // Principal usa el modo del doc; cada sucursal el suyo (o hereda el del doc).
  const accessibleBranches = filterBranchesByAccess ? filterBranchesByAccess(branches || []) : (branches || [])
  const localOptions = [
    ...(hasMainBranchAccess ? [{ scope: 'main', name: businessSettings?.mainBranchName || 'Sucursal Principal', mode: baseBusinessMode }] : []),
    ...accessibleBranches.map(b => ({ scope: b.id, name: b.name, mode: b.businessMode || baseBusinessMode })),
  ]
  // El selector es el ÚNICO selector global de sucursal: se muestra siempre que haya ≥2
  // locales accesibles (aunque compartan el mismo modo), para alternar cómodamente.
  const showBranchSwitcher = !isDemoMode && !!baseBusinessMode && localOptions.length >= 2
  // Opción "Todas las sucursales" (vista consolidada) al tope. Su modo = el del doc.
  const allOption = { scope: 'all', name: 'Todas las sucursales', mode: baseBusinessMode, isAll: true }
  const branchOptions = [allOption, ...localOptions]
  const activeOption = branchOptions.find(o => o.scope === (branchScope || 'all')) || branchOptions[0] || null

  const handleSelectBranch = (opt) => {
    setShowBranchMenu(false)
    if (opt.scope === (branchScope || 'all')) return
    setBranchScope(opt.scope)
    // Solo navegar al Dashboard si CAMBIA el modo/plantilla (evita sacar al usuario de la
    // página actual cuando solo alterna entre locales del mismo modo).
    if (opt.mode !== businessMode) navigate('/app/dashboard')
  }

  // Etiqueta sutil del modo demo (el badge vive DENTRO del header, no como
  // una cinta aparte que descuadra el layout). El modo se anexa en pantallas sm+.
  const demoModeLabel = {
    restaurant: 'Restaurante',
    pharmacy: 'Farmacia',
    hotel: 'Hotel',
    veterinary: 'Veterinaria',
  }[businessMode]

  return (
    <header className="sticky top-0 z-40 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      {/* Left Side - Mobile Menu Button */}
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-6 h-6 text-gray-600" />
        </button>

        {/* Badge de modo demo - sutil, dentro del header */}
        {isDemoMode && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap"
            title={`Estás explorando una versión de demostración${demoModeLabel ? ` (${demoModeLabel})` : ''}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
            DEMO
            {demoModeLabel && <span className="hidden sm:inline font-normal text-gray-400">· {demoModeLabel}</span>}
          </span>
        )}

        {/* Selector global de sucursal (único): visible siempre que haya ≥2 locales accesibles */}
        {showBranchSwitcher && activeOption && (() => {
          const ActiveIcon = activeOption.isAll ? LayoutGrid : (MODE_META[activeOption.mode] || MODE_META.retail).icon
          const activeLabel = activeOption.isAll ? 'Vista consolidada' : (MODE_META[activeOption.mode] || MODE_META.retail).label
          return (
            <div className="relative" ref={branchMenuRef}>
              <button
                onClick={() => setShowBranchMenu(v => !v)}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                title="Cambiar de sucursal"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: `${branding.primaryColor}15`, color: branding.primaryColor }}>
                  <ActiveIcon className="w-4 h-4" />
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight min-w-0">
                  <span className="text-sm font-medium text-gray-900 max-w-[140px] truncate">{activeOption.name}</span>
                  <span className="text-xs text-gray-500">{activeLabel}</span>
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>

              {showBranchMenu && (
                <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-50">
                  <p className="text-xs text-gray-400 px-2.5 pt-1.5 pb-1">Cambiar de sucursal</p>
                  {branchOptions.map((opt, idx) => {
                    const Icon = opt.isAll ? LayoutGrid : (MODE_META[opt.mode] || MODE_META.retail).icon
                    const subLabel = opt.isAll ? 'Vista consolidada' : (MODE_META[opt.mode] || MODE_META.retail).label
                    const isActive = opt.scope === (branchScope || 'all')
                    return (
                      <div key={opt.scope}>
                        {/* Separador entre "Todas" y los locales concretos */}
                        {idx === 1 && <div className="my-1 border-t border-gray-100" />}
                        <button
                          onClick={() => handleSelectBranch(opt)}
                          className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors ${isActive ? '' : 'hover:bg-gray-50'}`}
                          style={isActive ? { backgroundColor: `${branding.primaryColor}12` } : {}}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? branding.primaryColor : '#6B7280' }} />
                          <span className="flex-1 flex flex-col leading-tight min-w-0">
                            <span className="text-sm font-medium text-gray-900 truncate">{opt.name}</span>
                            <span className="text-xs text-gray-500">{subLabel}</span>
                          </span>
                          {isActive && <Check className="w-4 h-4 flex-shrink-0" style={{ color: branding.primaryColor }} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
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

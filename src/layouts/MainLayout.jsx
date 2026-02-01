import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import OfflineIndicator from '@/components/OfflineIndicator'
import { useYapeListener } from '@/hooks/useYapeListener'

// Mapeo de rutas a pageIds para verificación de permisos
const routeToPageId = {
  '/app/dashboard': 'dashboard',
  '/app/pos': 'pos',
  '/app/facturas': 'invoices',
  '/app/clientes': 'customers',
  '/app/productos': 'products',
  '/app/caja': 'cash-register',
  '/app/reportes': 'reports',
  '/app/gastos': 'expenses',
  '/app/flujo-caja': 'cash-flow',
  '/app/configuracion': 'settings',
  '/app/vendedores': 'sellers',
  '/app/cotizaciones': 'quotations',
  '/app/guias-remision': 'dispatch-guides',
  '/app/guias-transportista': 'carrier-dispatch-guides',
  '/app/inventario': 'inventory',
  '/app/almacenes': 'warehouses',
  '/app/movimientos': 'stock-movements',
  '/app/compras': 'purchases',
  '/app/ordenes-compra': 'purchase-orders',
  '/app/proveedores': 'suppliers',
  '/app/reclamos': 'complaints',
  '/app/mesas': 'tables',
  '/app/ordenes': 'orders',
  '/app/cocina': 'kitchen',
  '/app/mozos': 'waiters',
  '/app/prestamos': 'loans',
  '/app/certificados': 'certificates',
  '/app/ingredientes': 'ingredients',
  '/app/recetas': 'recipes',
  '/app/laboratorios': 'laboratories',
  '/app/alertas-vencimiento': 'expiry-alerts',
  '/app/control-lotes': 'batch-control',
  '/app/propiedades': 'properties',
  '/app/agentes': 'agents',
  '/app/operaciones': 'operations',
  '/app/comisiones': 'commissions',
  '/app/control-pagos-alumnos': 'student-payment-control',
  '/app/nota-credito': 'invoices',
  '/app/nota-debito': 'invoices',
}

export default function MainLayout() {
  const { user, isAuthenticated, isLoading, hasAccess, isAdmin, subscription, isBusinessOwner, hasPageAccess, allowedPages } = useAuth()
  const [hasBusiness, setHasBusiness] = useState(null)
  const [checkingBusiness, setCheckingBusiness] = useState(false)
  const location = useLocation()

  // Iniciar listener de Yape automáticamente (solo en APK Android)
  useYapeListener()

  // Forzar reflow cuando el layout se monta para evitar conflictos de estilos después de Login
  useEffect(() => {
    // Forzar recálculo de layout
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    // Asegurar que #root también tenga overflow hidden
    const root = document.getElementById('root')
    if (root) {
      root.style.overflow = 'hidden'
    }

    // Cleanup: restaurar cuando se desmonte (ej. al volver a Login)
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      if (root) {
        root.style.overflow = ''
      }
    }
  }, [])

  // Verificar si el usuario tiene un negocio creado
  useEffect(() => {
    let isMounted = true
    let timeoutId

    const checkBusiness = async () => {
      if (!user?.uid) {
        if (isMounted) {
          setCheckingBusiness(false)
          setHasBusiness(null)
        }
        return
      }

      if (isMounted) setCheckingBusiness(true)

      // Timeout de seguridad
      timeoutId = setTimeout(() => {
        if (isMounted) {
          console.warn('⚠️ Business check timeout - continuando sin datos')
          setCheckingBusiness(false)
          setHasBusiness(true) // Asumir que existe para no bloquear
        }
      }, 5000)

      try {
        const businessRef = doc(db, 'businesses', user.uid)
        const businessDoc = await getDoc(businessRef)

        if (isMounted) {
          clearTimeout(timeoutId)
          setHasBusiness(businessDoc.exists())
        }
      } catch (error) {
        console.error('Error al verificar negocio:', error)
        if (isMounted) {
          clearTimeout(timeoutId)
          setHasBusiness(true) // Asumir que existe en caso de error
        }
      } finally {
        if (isMounted) {
          setCheckingBusiness(false)
        }
      }
    }

    if (isAuthenticated && user) {
      checkBusiness()
    } else {
      setCheckingBusiness(false)
      setHasBusiness(null)
    }

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [user?.uid, isAuthenticated])

  // Mostrar splash mientras carga autenticación (solo en móvil)
  if (isLoading && Capacitor.isNativePlatform()) {
    return (
      <div className="fixed inset-0 bg-[#2563EB] flex items-center justify-center">
        <img src="/logo.png" alt="Cobrify" className="w-[140px] h-[140px] object-contain" />
      </div>
    )
  }

  // En web, mostrar loading simple mientras carga
  if (isLoading) {
    return null
  }

  // Redirigir a login si no está autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Verificar acceso a suscripción
  // IMPORTANTE: Los administradores SIEMPRE tienen acceso completo, sin importar su suscripción
  // TEMPORALMENTE DESHABILITADO: No redirigir a account-suspended
  // const isAdminRoute = location.pathname.startsWith('/admin')
  // const isSubscriptionRoute = location.pathname === '/mi-suscripcion'
  // const isBusinessNewRoute = location.pathname === '/business/new'

  // Solo bloquear si NO es admin Y NO tiene acceso Y NO está en rutas especiales
  // const shouldBlockAccess = !isAdmin && !hasAccess && !isAdminRoute && !isSubscriptionRoute && !isBusinessNewRoute

  // if (shouldBlockAccess) {
  //   return <Navigate to="/account-suspended" replace />
  // }

  // No redirigir a crear negocio - permitir acceso directo al dashboard
  // Los usuarios pueden configurar su negocio más tarde desde Configuración
  // if (hasBusiness === false && location.pathname !== '/business/new' && !isAdmin) {
  //   return <Navigate to="/business/new" replace />
  // }

  // Verificar permisos de página para sub-usuarios
  if (!isAdmin && !isBusinessOwner && hasPageAccess) {
    // Obtener el pageId de la ruta actual
    const basePath = location.pathname.replace(/\/[^/]+$/, '') // Para sub-rutas como /cotizaciones/nueva
    const pageId = routeToPageId[location.pathname] || routeToPageId[basePath]

    if (pageId && !hasPageAccess(pageId)) {
      // Redirigir a la primera página permitida
      const pageRouteMap = {
        'pos': '/app/pos',
        'dashboard': '/app/dashboard',
        'invoices': '/app/facturas',
        'customers': '/app/clientes',
        'products': '/app/productos',
        'cash-register': '/app/caja',
        'reports': '/app/reportes',
        'sellers': '/app/vendedores',
      }
      let redirectTo = '/app/pos'
      if (allowedPages && allowedPages.length > 0) {
        redirectTo = pageRouteMap[allowedPages[0]] || '/app/pos'
      }
      return <Navigate to={redirectTo} replace />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* iOS Status Bar - Gradiente moderno */}
      <div className="ios-status-bar bg-gradient-to-r from-primary-800 via-primary-700 to-blue-800 md:hidden flex-shrink-0" />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-64">
          {/* Navbar - Siempre fijo */}
          <Navbar />

          {/* Page Content - Solo esta área hace scroll */}
          <main className="flex-1 overflow-y-auto overscroll-none p-2 sm:p-4 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <Outlet />
          </main>
        </div>
      </div>

      {/* Indicador de estado offline */}
      <OfflineIndicator />
    </div>
  )
}

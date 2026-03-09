import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVendedor } from '@/services/vendedorService'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import OfflineIndicator from '@/components/OfflineIndicator'
import { useYapeListener } from '@/hooks/useYapeListener'
import { AlertTriangle, MessageCircle, Bell, Smartphone, Plus, Printer, CheckCircle, X, Volume2 } from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { getAudioContext } from '@/lib/globalAudio'

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
  '/app/envios': 'envios',
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
  const { user, isAuthenticated, isLoading, hasAccess, isAdmin, subscription, isBusinessOwner, hasPageAccess, allowedPages, getBusinessId, isInGracePeriod, businessMode } = useAuth()
  const [hasBusiness, setHasBusiness] = useState(null)
  const [checkingBusiness, setCheckingBusiness] = useState(false)
  const [vendedorWhatsApp, setVendedorWhatsApp] = useState(null)
  const location = useLocation()
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)
  const setOrderAlertCount = useStore(state => state.setOrderAlertCount)

  // ====== NOTIFICACIONES GLOBALES DE ÓRDENES DEL MENÚ DIGITAL ======
  const [globalOrderAlerts, setGlobalOrderAlerts] = useState([])
  const prevOrdersRef = useRef(null)
  const firstLoadRef = useRef(true)
  const activeOscillatorsRef = useRef([]) // Para poder detener el sonido

  // Sincronizar alert count al store (para el sidebar badge)
  useEffect(() => {
    setOrderAlertCount(globalOrderAlerts.length)
  }, [globalOrderAlerts.length, setOrderAlertCount])

  // Sonido: 10 repeticiones de campanita (cancelable)
  // Usa AudioContext global que se desbloqueó con el click del login
  const playNotificationSound = useCallback(async () => {
    try {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') await ctx.resume()

      // Detener sonidos anteriores
      stopNotificationSound()

      const oscillators = []
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, startTime)
        gain.gain.setValueAtTime(0.5, startTime)
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)
        osc.start(startTime)
        osc.stop(startTime + duration)
        oscillators.push(osc)
      }

      const now = ctx.currentTime
      for (let i = 0; i < 10; i++) {
        const offset = i * 2.0
        playTone(880, now + offset, 0.15)
        playTone(1108, now + offset + 0.15, 0.15)
        playTone(1320, now + offset + 0.3, 0.3)
        playTone(880, now + offset + 0.7, 0.15)
        playTone(1108, now + offset + 0.85, 0.15)
        playTone(1320, now + offset + 1.0, 0.3)
      }
      activeOscillatorsRef.current = oscillators
    } catch (e) {
      console.warn('No se pudo reproducir sonido:', e)
    }
  }, [])

  // Detener sonido inmediatamente
  const stopNotificationSound = useCallback(() => {
    activeOscillatorsRef.current.forEach(osc => {
      try { osc.stop() } catch (e) { /* ya terminó */ }
    })
    activeOscillatorsRef.current = []
  }, [])

  // Listener global de órdenes - solo para restaurantes
  useEffect(() => {
    if (!user?.uid || businessMode !== 'restaurant') return

    const businessId = getBusinessId()
    if (!businessId) return

    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    const q = query(ordersRef, where('status', 'in', ['pending', 'preparing', 'ready', 'dispatched']))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = []
      snapshot.forEach((d) => {
        ordersData.push({ id: d.id, ...d.data() })
      })

      if (firstLoadRef.current) {
        firstLoadRef.current = false
        prevOrdersRef.current = new Map(ordersData.map(o => [o.id, { itemCount: o.items?.length || 0 }]))
        return
      }

      if (!prevOrdersRef.current) return

      const prevMap = prevOrdersRef.current
      const newAlerts = []

      for (const order of ordersData) {
        const prev = prevMap.get(order.id)
        if (!prev && order.source === 'menu_digital') {
          newAlerts.push({
            id: `new-${order.id}-${Date.now()}`,
            type: 'new_order',
            orderId: order.id,
            orderNumber: order.orderNumber || '?',
            tableNumber: order.tableNumber || null,
            orderType: order.orderType,
            customerName: order.customerName || '',
            itemCount: order.items?.length || 0,
            items: (order.items || []).slice(0, 5).map(i => `${i.quantity}x ${i.name}`),
            newItems: order.items || [],
            timestamp: Date.now(),
          })
        } else if (prev && order.source === 'menu_digital') {
          const currentItemCount = order.items?.length || 0
          if (currentItemCount > prev.itemCount) {
            const addedItems = (order.items || []).slice(prev.itemCount)
            newAlerts.push({
              id: `update-${order.id}-${Date.now()}`,
              type: 'items_added',
              orderId: order.id,
              orderNumber: order.orderNumber || '?',
              tableNumber: order.tableNumber || null,
              orderType: order.orderType,
              customerName: order.customerName || '',
              itemCount: currentItemCount - prev.itemCount,
              items: addedItems.slice(0, 5).map(i => `${i.quantity}x ${i.name}`),
              newItems: addedItems,
              timestamp: Date.now(),
            })
          }
        }
      }

      if (newAlerts.length > 0) {
        playNotificationSound()
        setGlobalOrderAlerts(prev => [...newAlerts, ...prev].slice(0, 10))
      }

      prevOrdersRef.current = new Map(ordersData.map(o => [o.id, { itemCount: o.items?.length || 0 }]))
    })

    return () => unsubscribe()
  }, [user?.uid, businessMode, getBusinessId, playNotificationSound])

  const dismissGlobalAlert = (alertId) => {
    const newAlerts = globalOrderAlerts.filter(a => a.id !== alertId)
    setGlobalOrderAlerts(newAlerts)
    if (newAlerts.length === 0) stopNotificationSound()
  }

  const dismissAllGlobalAlerts = () => {
    setGlobalOrderAlerts([])
    stopNotificationSound()
  }

  // Iniciar listener de Yape automáticamente (solo en APK Android)
  useYapeListener()

  // Cargar WhatsApp del vendedor si tiene uno asignado
  useEffect(() => {
    if (subscription?.vendedorId && isInGracePeriod) {
      getVendedor(subscription.vendedorId).then(result => {
        if (result.success && result.data?.phone) {
          setVendedorWhatsApp(result.data.phone)
        }
      })
    } else {
      setVendedorWhatsApp(null)
    }
  }, [subscription?.vendedorId, isInGracePeriod])

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
        const businessId = getBusinessId() || user.uid
        const businessRef = doc(db, 'businesses', businessId)
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
  if (!isAdmin && !isBusinessOwner && hasPageAccess && allowedPages && allowedPages.length > 0) {
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
        'expenses': '/app/gastos',
        'cash-flow': '/app/flujo-caja',
        'settings': '/app/configuracion',
        'quotations': '/app/cotizaciones',
        'dispatch-guides': '/app/guias-remision',
        'carrier-dispatch-guides': '/app/guias-transportista',
        'inventory': '/app/inventario',
        'warehouses': '/app/almacenes',
        'stock-movements': '/app/movimientos',
        'purchases': '/app/compras',
        'purchase-orders': '/app/ordenes-compra',
        'suppliers': '/app/proveedores',
        'complaints': '/app/reclamos',
        'tables': '/app/mesas',
        'orders': '/app/ordenes',
        'kitchen': '/app/cocina',
        'waiters': '/app/mozos',
        'envios': '/app/envios',
        'loans': '/app/prestamos',
        'certificates': '/app/certificados',
        'ingredients': '/app/ingredientes',
        'recipes': '/app/recetas',
        'laboratories': '/app/laboratorios',
        'expiry-alerts': '/app/alertas-vencimiento',
        'batch-control': '/app/control-lotes',
        'properties': '/app/propiedades',
        'agents': '/app/agentes',
        'operations': '/app/operaciones',
        'commissions': '/app/comisiones',
        'student-payment-control': '/app/control-pagos-alumnos',
      }
      const firstAllowedRoute = pageRouteMap[allowedPages[0]] || '/app/pos'
      return <Navigate to={firstAllowedRoute} replace />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* iOS Status Bar - Gradiente moderno (solo iOS) */}
      {Capacitor.getPlatform() === 'ios' && (
        <div className="ios-status-bar bg-gradient-to-r from-primary-800 via-primary-700 to-blue-800 md:hidden flex-shrink-0" />
      )}

      {/* Banner de período de gracia */}
      {isInGracePeriod && (
        <div className={`bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 flex-shrink-0 text-sm ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Tu suscripción venció. Tienes hasta mañana para renovar.</span>
          </div>
          <a
            href={`https://wa.me/${vendedorWhatsApp || '51900434988'}?text=${encodeURIComponent(`Hola, quiero renovar mi suscripción de Cobrify. Mi email es ${user?.email || ''}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white whitespace-nowrap transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Renovar
          </a>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className={`flex-1 flex flex-col h-full overflow-hidden ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
          {/* Navbar - Siempre fijo */}
          <Navbar />

          {/* Banner global de alertas de órdenes del menú digital */}
          {globalOrderAlerts.length > 0 && (
            <div className="bg-orange-50 border-b-2 border-orange-400 px-3 py-2 flex-shrink-0 space-y-2 max-h-[40vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-700">
                  <Volume2 className="w-5 h-5 animate-bounce" />
                  <span className="font-bold text-sm">{globalOrderAlerts.length} pedido{globalOrderAlerts.length > 1 ? 's' : ''} del menú digital</span>
                </div>
                <button
                  onClick={dismissAllGlobalAlerts}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Recibir todos
                </button>
              </div>
              {globalOrderAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="bg-white border-l-4 border-orange-500 rounded-lg p-3 shadow-sm flex items-start gap-3"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {alert.type === 'new_order' ? (
                      <Smartphone className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Plus className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900">
                      {alert.type === 'new_order'
                        ? `Nueva orden ${alert.orderNumber}`
                        : `+${alert.itemCount} item${alert.itemCount > 1 ? 's' : ''} en orden ${alert.orderNumber}`
                      }
                      {alert.tableNumber ? ` - Mesa ${alert.tableNumber}` : ''}
                      {alert.orderType === 'delivery' ? ' - Delivery' : ''}
                      {alert.orderType === 'takeaway' ? ' - Para llevar' : ''}
                    </p>
                    {alert.customerName && (
                      <p className="text-xs text-gray-600">{alert.customerName}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {alert.items.join(' | ')}
                    </p>
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => dismissGlobalAlert(alert.id)}
                        className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Recibido
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

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

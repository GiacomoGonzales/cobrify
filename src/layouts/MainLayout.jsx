import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import DemoAccountBanner from '@/components/DemoAccountBanner'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import SplashMarca from '@/components/SplashMarca'
import { useAuth } from '@/contexts/AuthContext'
import { useBranding } from '@/contexts/BrandingContext'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVendedor } from '@/services/vendedorService'
import { getCompanySettings } from '@/services/firestoreService'
import { createDeliveryRecord } from '@/services/motoristaService'
import { resumirItemsParaEnvio } from '@/utils/deliveryShare'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import UpdateBanner from '@/components/UpdateBanner'
import OfflineIndicator from '@/components/OfflineIndicator'
import ReviewPrompt from '@/components/ReviewPrompt'
import KitchenTicket from '@/components/KitchenTicket'
import { useYapeListener } from '@/hooks/useYapeListener'
import Mantenimiento from '@/pages/Mantenimiento'
import { escucharMantenimiento, MANTENIMIENTO_APAGADO } from '@/services/mantenimientoService'
import { useReactToPrint } from 'react-to-print'
import { AlertTriangle, MessageCircle, Bell, Smartphone, Plus, Printer, CheckCircle, X } from 'lucide-react'
import { useStore } from '@/stores/useStore'
import { getAudioContext } from '@/lib/globalAudio'
import { useToast } from '@/contexts/ToastContext'

// Mapeo de rutas a pageIds para verificación de permisos
// Mapa ruta→pageId de permisos: vive en src/utils/pageRoutes.js (única fuente de
// verdad, compartida con la redirección post-login de AuthContext). Registrar
// páginas nuevas AHÍ, no en mapas locales.
import { routeToPageId, getFirstAllowedRoute } from '@/utils/pageRoutes'
import { getSubscriptionWarning, ESTILO_AVISO } from '@/utils/subscriptionWarning'

export default function MainLayout() {
  const { user, isAuthenticated, isLoading, hasAccess, isAdmin, subscription, isBusinessOwner, isReseller, userPermissions, rolesResolved, hasPageAccess, allowedPages, getBusinessId, businessMode, businessSettings } = useAuth()
  const toast = useToast()
  const [mantenimiento, setMantenimiento] = useState(MANTENIMIENTO_APAGADO)
  const [hasBusiness, setHasBusiness] = useState(null)
  const [checkingBusiness, setCheckingBusiness] = useState(false)
  const { branding } = useBranding()
  const [vendedorWhatsApp, setVendedorWhatsApp] = useState(null)
  const location = useLocation()
  const sidebarCollapsed = useStore(state => state.sidebarCollapsed)
  const setOrderAlertCount = useStore(state => state.setOrderAlertCount)

  // ====== NOTIFICACIONES GLOBALES DE ÓRDENES DEL MENÚ DIGITAL ======
  const [globalOrderAlerts, setGlobalOrderAlerts] = useState([])
  const prevOrdersRef = useRef(null)
  const firstLoadRef = useRef(true)
  const activeOscillatorsRef = useRef([]) // Para poder detener el sonido
  const [alertOrderToPrint, setAlertOrderToPrint] = useState(null) // Orden para imprimir en web
  const [alertCompanySettings, setAlertCompanySettings] = useState(null)
  const alertKitchenTicketRef = useRef()

  /**
   * ¿Hay que escuchar los pedidos del catálogo digital?
   *
   * Antes esto dependía del MODO ACTIVO (`['restaurant','retail']`), y con modo
   * por sucursal eso rompe: un negocio con la Principal en hotel y otra sede en
   * restaurante dejaba de recibir el aviso mientras miraba el hotel. El pedido
   * entraba igual, pero nadie se enteraba hasta cambiar de sucursal.
   *
   * Un pedido del catálogo es del NEGOCIO, no de la sucursal que uno esté
   * mirando. Así que la condición es tener catálogo con pedidos: si el negocio
   * los recibe, el aviso suena siempre, se esté donde se esté. Los negocios sin
   * catálogo no abren la suscripción, igual que antes.
   */
  const isOnlineOrdersMode = businessSettings?.catalogEnabled === true ||
    ['restaurant', 'retail'].includes(businessMode)

  // Cargar company settings para el KitchenTicket (web print)
  useEffect(() => {
    if (!user?.uid || !isOnlineOrdersMode) return
    getCompanySettings(getBusinessId()).then(result => {
      if (result.success) setAlertCompanySettings(result.data)
    })
  }, [user?.uid, isOnlineOrdersMode, getBusinessId])

  // Cargar la Impresora de Caja COMPARTIDA por negocio (Firestore) hacia el servicio de
  // impresión, para que cualquier dispositivo imprima los comprobantes en la misma caja.
  // Si el negocio no la configuró, queda null → se usa la impresora local (como antes).
  useEffect(() => {
    if (!user?.uid) return
    getCompanySettings(getBusinessId()).then(result => {
      if (result?.success && result.data) {
        import('@/services/thermalPrinterService')
          .then(m => m.setBusinessCajaPrinter(result.data.cajaPrinter || null))
          .catch(() => {})
      }
    }).catch(() => {})
  }, [user?.uid, getBusinessId])

  // react-to-print para impresión web
  const handleAlertWebPrint = useReactToPrint({
    contentRef: alertKitchenTicketRef,
    onAfterPrint: () => {
      setAlertOrderToPrint(null)
    },
  })

  // Sincronizar alert count al store (para el sidebar badge)
  useEffect(() => {
    setOrderAlertCount(globalOrderAlerts.length)
  }, [globalOrderAlerts.length, setOrderAlertCount])

  /**
   * Aviso de pedido nuevo.
   *
   * Antes eran DIEZ repeticiones de una campanita de tres notas a volumen 0.5
   * — veinte segundos de pitidos que en un local lleno terminaban con alguien
   * bajándole el volumen a la computadora, y con eso se perdían los avisos
   * siguientes. Un aviso tiene que hacerse notar una vez, no ganar por
   * insistencia.
   *
   * Ahora son dos notas ascendentes (Sol-Do), tres veces cada cuatro segundos,
   * a volumen moderado y con ataque y caída suaves. Onda triangular en vez de
   * seno puro: suena más de "notificación" y menos de alarma de reloj.
   */
  const playNotificationSound = useCallback(async () => {
    try {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') await ctx.resume()

      stopNotificationSound()

      const oscillators = []
      const nota = (freq, inicio, dur, volumen) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, inicio)
        // Rampa de entrada: un corte seco en el arranque se oye como un "clic".
        gain.gain.setValueAtTime(0.0001, inicio)
        gain.gain.exponentialRampToValueAtTime(volumen, inicio + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, inicio + dur)
        osc.start(inicio)
        osc.stop(inicio + dur + 0.02)
        oscillators.push(osc)
      }

      const now = ctx.currentTime
      const REPETICIONES = 3
      const CADA = 4.0
      for (let i = 0; i < REPETICIONES; i++) {
        const t = now + i * CADA
        // Cada repetición suena un poco más suave: si alguien ya lo escuchó,
        // no hace falta insistir al mismo volumen.
        const vol = 0.28 - i * 0.05
        nota(784, t, 0.18, vol)          // Sol5
        nota(1046, t + 0.14, 0.42, vol)  // Do6
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

  // Listener global de órdenes - restaurantes y retail (tienda virtual)
  useEffect(() => {
    if (!user?.uid || !isOnlineOrdersMode) return

    const businessId = getBusinessId()
    if (!businessId) return

    const ordersRef = collection(db, 'businesses', businessId, 'orders')
    // Retail: solo alerta cuando llega un pedido nuevo (pending)
    //         avanzar a accepted/ready/completed no debe disparar el sonido otra vez.
    // Restaurante: se mantiene el comportamiento original (items agregados a pedidos en curso).
    const watchedStatuses = businessMode === 'retail'
      ? ['pending']
      : ['pending', 'preparing', 'ready', 'dispatched']
    const q = query(ordersRef, where('status', 'in', watchedStatuses))

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
            customerPhone: order.customerPhone || '',
            customerAddress: order.customerAddress || '',
            itemCount: order.items?.length || 0,
            items: (order.items || []).slice(0, 5).map(i => `${i.quantity}x ${i.name}`),
            newItems: order.items || [],
            orderTotal: (order.items || []).reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0),
            timestamp: Date.now(),
          })

          // Auto-crear registro de envío para órdenes delivery (solo restaurante)
          if (order.orderType === 'delivery' && businessMode === 'restaurant') {
            createDeliveryRecord(businessId, {
              motoristaId: '',
              motoristaName: '',
              orderId: order.id,
              orderNumber: order.orderNumber || '',
              customerName: order.customerName || '',
              customerAddress: order.customerAddress || '',
              customerPhone: order.customerPhone || '',
              items: resumirItemsParaEnvio(order.items),
              amount: (order.items || []).reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0),
              deliveryFee: order.deliveryFee || 0,
              paymentMethod: order.paymentMethod || 'cash',
              cashCollected: 0,
              status: 'pending',
            }).then(result => {
              if (result.success) {
                console.log('Delivery record creado automáticamente:', result.id)
              }
            })
          }
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
              customerPhone: order.customerPhone || '',
              customerAddress: order.customerAddress || '',
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

    return () => {
      unsubscribe()
      // La próxima suscripción arranca de cero: su primer snapshot es el estado
      // actual, no novedades. Sin esto, al cambiar de sucursal o de negocio el
      // efecto se volvía a montar con `firstLoadRef` ya gastado y comparaba el
      // primer snapshot contra la lista ANTERIOR — una ráfaga de alertas de
      // pedidos que ya estaban ahí.
      firstLoadRef.current = true
      prevOrdersRef.current = null
    }
  }, [user?.uid, businessMode, isOnlineOrdersMode, getBusinessId, playNotificationSound])

  const dismissGlobalAlert = (alertId) => {
    const newAlerts = globalOrderAlerts.filter(a => a.id !== alertId)
    setGlobalOrderAlerts(newAlerts)
    if (newAlerts.length === 0) stopNotificationSound()
  }

  const dismissAllGlobalAlerts = () => {
    setGlobalOrderAlerts([])
    stopNotificationSound()
  }

  // Imprimir comanda desde la alerta global (solo items nuevos)
  const handlePrintFromAlert = async (alert) => {
    try {
      const businessId = getBusinessId()
      if (!businessId) return

      // Construir objeto orden con solo los items nuevos
      const printOrder = {
        orderNumber: alert.orderNumber,
        tableNumber: alert.tableNumber,
        orderType: alert.orderType,
        customerName: alert.customerName,
        customerPhone: alert.customerPhone || '',
        customerAddress: alert.customerAddress || '',
        items: alert.newItems || [],
        _printNote: alert.type === 'items_added' ? 'ITEMS AGREGADOS' : null,
        // Respeta el ajuste "mostrar datos y cobro en comandas" (Configuración > Preferencias)
        _showCustomerData: alertCompanySettings?.showCustomerDataOnKitchenTicket === true,
        source: 'menu_digital',
      }

      const isNative = Capacitor.isNativePlatform()

      if (isNative) {
        // Android/iOS: Impresión térmica Bluetooth
        try {
          const { getPrinterConfig, connectPrinter, printKitchenOrder } = await import('@/services/thermalPrinterService')
          const printerConfigResult = await getPrinterConfig(businessId)

          if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
            const connectResult = await connectPrinter(printerConfigResult.config.address)
            if (connectResult.success) {
              const result = await printKitchenOrder(printOrder, null, printerConfigResult.config.paperWidth || 58)
              if (result.success) {
                toast.success('Comanda impresa en ticketera')
              } else {
                toast.error('Error al imprimir: ' + result.error)
                // Fallback a impresión estándar
                setAlertOrderToPrint(printOrder)
                setTimeout(() => handleAlertWebPrint(), 300)
              }
            } else {
              toast.error('No se pudo conectar a la impresora')
              // Fallback a impresión estándar
              setAlertOrderToPrint(printOrder)
              setTimeout(() => handleAlertWebPrint(), 300)
            }
          } else {
            // No hay impresora configurada, usar impresión estándar
            setAlertOrderToPrint(printOrder)
            setTimeout(() => handleAlertWebPrint(), 300)
          }
        } catch (error) {
          console.error('Error impresión térmica:', error)
          // Fallback a impresión estándar
          setAlertOrderToPrint(printOrder)
          setTimeout(() => handleAlertWebPrint(), 300)
        }
      } else {
        // Web/Escritorio: Impresión estándar del navegador
        setAlertOrderToPrint(printOrder)
        setTimeout(() => handleAlertWebPrint(), 300)
      }
    } catch (error) {
      console.error('Error al imprimir desde alerta:', error)
      toast.error('Error al imprimir')
    }

    // Marcar como recibido después de imprimir
    dismissGlobalAlert(alert.id)
  }

  // Iniciar listener de Yape automáticamente (solo en APK Android)
  useYapeListener()

  // ¿El usuario superó su límite mensual de comprobantes? (incluye el bono; admins excluidos)
  const _invMonthlyLimit = subscription?.limits?.maxInvoicesPerMonth
  const overInvoiceLimit = !isAdmin && typeof _invMonthlyLimit === 'number' && _invMonthlyLimit !== -1 &&
    (subscription?.usage?.invoicesThisMonth || 0) >= (_invMonthlyLimit + (subscription?.bonusInvoices || 0))

  // Aviso de vencimiento (4 días antes, escalando). Solo al DUEÑO: el cajero
  // no tiene por qué recibir avisos de cobranza.
  const avisoVencimiento = useMemo(
    () => (isBusinessOwner && !isAdmin ? getSubscriptionWarning(subscription) : null),
    [subscription, isBusinessOwner, isAdmin]
  )

  /**
   * El banner de vencimiento se puede cerrar POR EL DÍA.
   *
   * Antes era permanente y estaba en todas las pantallas: cuatro días seguidos
   * sin poder sacarlo de encima. Un aviso que no se puede cerrar deja de ser un
   * aviso y pasa a ser presión — el reclamo textual de un cliente fue "les pido
   * un poquito de prudencia".
   *
   * Vuelve solo al día siguiente, así que nadie se entera tarde. Lo único que
   * NO se puede cerrar es el aviso de "ya venció": ahí el servicio está por
   * cortarse y esconderlo sería hacerle un flaco favor al usuario.
   */
  const claveAvisoCerrado = avisoVencimiento
    ? `avisoVenc_${user?.uid || ''}_${new Date().toISOString().slice(0, 10)}`
    : null
  const [avisoCerrado, setAvisoCerrado] = useState(false)
  useEffect(() => {
    if (!claveAvisoCerrado) return
    try {
      setAvisoCerrado(localStorage.getItem(claveAvisoCerrado) === '1')
    } catch { /* sin localStorage: se muestra, que es el lado seguro */ }
  }, [claveAvisoCerrado])

  const cerrarAviso = () => {
    setAvisoCerrado(true)
    try { localStorage.setItem(claveAvisoCerrado, '1') } catch { /* no pasa nada */ }
  }

  const mostrarAviso = !!avisoVencimiento
    && (avisoVencimiento.nivel === 'vencido' || !avisoCerrado)

  // A quién escribe el cliente desde los banners de vencimiento y de límite.
  //
  // Orden: su RESELLER primero (si lo tiene, es su proveedor y quien le cobra),
  // luego el vendedor asignado de Cobrify, y recién al final el número de
  // Cobrify. Antes solo se miraba `vendedorId`, así que TODO cliente de
  // reseller terminaba escribiéndole a Cobrify — que no puede ampliarle nada
  // porque no es su proveedor.
  //
  // El número del reseller se guarda como lo escribió él (p. ej. "924014716"),
  // pero wa.me exige el código de país: un celular peruano de 9 dígitos se
  // completa con 51.
  const conCodigoPais = (tel) => {
    const digitos = String(tel || '').replace(/\D/g, '')
    if (!digitos) return null
    return /^9\d{8}$/.test(digitos) ? `51${digitos}` : digitos
  }
  const contactoWhatsApp = conCodigoPais(branding?.whatsapp)
    || conCodigoPais(vendedorWhatsApp)
    || '51900434988'

  // Cargar WhatsApp del vendedor si tiene uno asignado (para banners de gracia / límite)
  useEffect(() => {
    if (subscription?.vendedorId && (avisoVencimiento || overInvoiceLimit)) {
      getVendedor(subscription.vendedorId).then(result => {
        if (result.success && result.data?.phone) {
          setVendedorWhatsApp(result.data.phone)
        }
      })
    } else {
      setVendedorWhatsApp(null)
    }
  }, [subscription?.vendedorId, avisoVencimiento, overInvoiceLimit])

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

  // Mantenimiento, en vivo: al apagarlo las pantallas vuelven solas. Solo se
  // escucha con sesión iniciada: sin ella las reglas rechazan la lectura y
  // llenaría la consola de errores de permisos en cada visita anónima.
  useEffect(() => {
    if (!isAuthenticated) return undefined
    return escucharMantenimiento(setMantenimiento)
  }, [isAuthenticated])

  // Splash mientras carga la sesión (solo en móvil) — pieza única SplashMarca:
  // marca del reseller en su dominio, Cobrify solo en los propios.
  if (isLoading && Capacitor.isNativePlatform()) {
    return <SplashMarca />
  }

  // En web, mostrar loading simple mientras carga
  if (isLoading) {
    return null
  }

  // Redirigir a login si no está autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Bloquear a quien NO pertenece a ningún negocio.
  // Desde que el catálogo público tiene cuentas de comprador, existen usuarios
  // en el mismo pozo de Firebase Auth que NO son usuarios del sistema. Sin esto
  // podrían iniciar sesión en /login y entrar al panel (sin ver datos: las
  // reglas de Firestore los bloquean, pero es una pantalla que no les toca).
  // Se exige `rolesResolved` para no echar a un usuario legítimo si el timeout
  // de seguridad de AuthContext apagó isLoading antes de resolver los roles.
  const isBusinessUser = isAdmin || isBusinessOwner || isReseller || !!userPermissions
  if (rolesResolved && !isBusinessUser) {
    return <Navigate to="/login?cuenta=comprador" replace />
  }

  // Mantenimiento: cierra la app a los clientes. A los admins no, o el que
  // prendió el modo no podría apagarlo. Se espera a `rolesResolved` para no
  // mostrarle la pantalla de cierre a un admin durante el parpadeo inicial.
  if (mantenimiento.activo && rolesResolved && !isAdmin) {
    return <Mantenimiento mensaje={mantenimiento.mensaje} />
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
      // Redirigir a la PRIMERA página permitida con ruta conocida (mapa compartido
      // en pageRoutes.js). Antes se usaba un mapa local desactualizado: para páginas
      // nuevas (p.ej. logística) devolvía undefined, caía al fallback /app/pos y, si
      // el sub-usuario no tenía POS, este guard redirigía en bucle a la misma ruta →
      // página en blanco al ingresar.
      const firstAllowedRoute = getFirstAllowedRoute(allowedPages)
      // Anti-bucle: solo navegar si el destino es distinto a la ruta actual.
      if (firstAllowedRoute !== location.pathname) {
        return <Navigate to={firstAllowedRoute} replace />
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden" style={{ height: '100dvh' }}>
      {/* Status Bar spacer - Fondo azul detrás del status bar nativo (iOS y Android) */}
      {Capacitor.isNativePlatform() && (
        <div className="bg-primary-800 flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} />
      )}

      {/* Banner de vencimiento: desde 4 dias antes, escalando.
          Antes solo aparecia DESPUES de vencer (isInGracePeriod), asi que
          nadie tenia aviso previo — y los clientes de reseller, que no tienen
          periodo de gracia, no veian NADA nunca. Ver subscriptionWarning.js. */}
      {mostrarAviso && (
        <div className={`${ESTILO_AVISO[avisoVencimiento.nivel]} text-white px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 flex-shrink-0 text-sm relative ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className={avisoVencimiento.nivel === 'info' ? 'font-medium' : 'font-semibold'}>
              {avisoVencimiento.mensaje}
            </span>
          </div>
          <a
            href={`https://wa.me/${contactoWhatsApp}?text=${encodeURIComponent(`Hola, quiero renovar mi suscripción de ${branding?.companyName || 'Cobrify'}. Mi email es ${user?.email || ''}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white whitespace-nowrap transition-colors font-medium"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Renovar ahora
          </a>
          {avisoVencimiento.nivel !== 'vencido' && (
            <button
              type="button"
              onClick={cerrarAviso}
              title="Ocultar por hoy"
              aria-label="Ocultar por hoy"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Banner de límite de comprobantes superado (NO bloquea el envío a SUNAT) */}
      {overInvoiceLimit && (
        <div className={`bg-red-500 text-white px-4 py-2 flex items-center justify-center gap-2 flex-shrink-0 text-sm ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Has superado tu límite de envíos a SUNAT este mes. Comunícate con nosotros para ampliarlo.</span>
          </div>
          <a
            href={`https://wa.me/${contactoWhatsApp}?text=${encodeURIComponent(`Hola, superé mi límite de comprobantes en ${branding?.companyName || 'Cobrify'} y quiero ampliarlo. Mi email es ${user?.email || ''}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white whitespace-nowrap transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Contactar
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
          {/* Aviso si la sesion abierta es la cuenta demo (compartida) */}
          <DemoAccountBanner />

          {/* Banner de actualización integrado (web/PWA: reiniciar; app: tienda) */}
          <UpdateBanner />

          {/* Aviso de pedidos del catálogo digital.
              Antes era una franja naranja con borde de 2px, íconos rebotando y
              cuatro colores de botón compitiendo (verde, azul, naranja,
              primario). Con todo gritando, nada destacaba. Ahora es blanco con
              un borde fino, como el resto del sistema: el único color queda
              para el punto que marca que hay algo sin atender. */}
          {globalOrderAlerts.length > 0 && (
            <div className="bg-white border-b border-gray-200 flex-shrink-0 max-h-[40vh] overflow-y-auto">
              <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-600" />
                  </span>
                  <span className="font-semibold text-sm text-gray-900 truncate">
                    {globalOrderAlerts.length} pedido{globalOrderAlerts.length > 1 ? 's' : ''} sin atender
                  </span>
                  <span className="hidden sm:inline text-xs text-gray-500 truncate">
                    · desde {businessMode === 'restaurant' ? 'la carta digital' : 'el catálogo online'}
                  </span>
                </div>
                <button
                  onClick={dismissAllGlobalAlerts}
                  className="flex-shrink-0 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  Marcar todo como visto
                </button>
              </div>

              {globalOrderAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="px-3 sm:px-4 py-3 flex items-start gap-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-gray-100">
                    {alert.type === 'new_order'
                      ? <Smartphone className="w-4 h-4 text-gray-500" />
                      : <Plus className="w-4 h-4 text-gray-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">
                        {alert.type === 'new_order'
                          ? `Pedido #${alert.orderNumber}`
                          : `+${alert.itemCount} ítem${alert.itemCount > 1 ? 's' : ''} en el #${alert.orderNumber}`}
                      </span>
                      {[
                        alert.tableNumber ? `Mesa ${alert.tableNumber}` : null,
                        businessMode === 'restaurant' && alert.orderType === 'delivery' ? 'Delivery' : null,
                        businessMode === 'restaurant' && alert.orderType === 'takeaway' ? 'Para llevar' : null,
                        businessMode === 'restaurant' && alert.orderType === 'counter' ? 'En local' : null,
                      ].filter(Boolean).map(etiqueta => (
                        <span key={etiqueta} className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                          {etiqueta}
                        </span>
                      ))}
                    </div>

                    {(alert.customerName || alert.customerAddress) && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate">
                        {alert.customerName}
                        {alert.customerName && alert.customerAddress ? ' · ' : ''}
                        {alert.customerAddress}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{alert.items.join(' · ')}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        onClick={() => dismissGlobalAlert(alert.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Recibido
                      </button>
                      {businessMode === 'restaurant' && (
                        <>
                          <button
                            onClick={() => handlePrintFromAlert(alert)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Imprimir comanda
                          </button>
                          {alert.orderType === 'delivery' && alert.customerPhone && (
                            <a
                              href={`https://wa.me/${alert.customerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${alert.customerName || ''}, su pedido #${alert.orderNumber} está siendo preparado.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Page Content - Solo esta área hace scroll.
              Para /app/pos eliminamos la padding inner del <main> porque el
              POS llena el área completa con su propio layout flex y la
              padding se veía como un marco gris alrededor que "tapaba" el
              contenido al hacer scroll en las columnas. */}
          {location.pathname === '/app/pos' ? (
            <main className="flex-1 overflow-y-auto overscroll-none custom-scrollbar">
              <Outlet />
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto overscroll-none p-2 sm:p-4 custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', scrollbarGutter: 'stable' }}>
              <Outlet />
            </main>
          )}
        </div>
      </div>

      {/* Indicador de estado offline */}
      <OfflineIndicator />

      {/* Prompt para calificar en Play Store */}
      <ReviewPrompt />

      {/* Comanda oculta para impresión web (react-to-print) */}
      {alertOrderToPrint && alertCompanySettings && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={alertKitchenTicketRef}>
            <KitchenTicket
              order={alertOrderToPrint}
              companySettings={alertCompanySettings}
            />
          </div>
        </div>
      )}
    </div>
  )
}

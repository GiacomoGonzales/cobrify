import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, Users, DollarSign, Loader2, ChevronRight, Plus, Receipt, Bike, ShoppingBag, Smartphone, User, Printer, X, ShoppingCart, Truck, PackageCheck } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { getActiveOrders, getOrdersStats, updateOrderStatus, createOrder, completeOrder, markOrderAsPaid, updateOrder } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getCompanySettings, getProductCategories } from '@/services/firestoreService'
import CreateOrderModal from '@/components/restaurant/CreateOrderModal'
import OrderItemsModal from '@/components/restaurant/OrderItemsModal'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'
import { Capacitor } from '@capacitor/core'
import { printKitchenOrder, connectPrinter, getPrinterConfig, printToAllStations } from '@/services/thermalPrinterService'

export default function Orders() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [itemStatusTracking, setItemStatusTracking] = useState(false) // Config para modo de seguimiento
  const [requirePaymentBeforeKitchen, setRequirePaymentBeforeKitchen] = useState(false) // Config para pago obligatorio
  const [deliveryPersons, setDeliveryPersons] = useState([]) // Lista de repartidores
  const [brands, setBrands] = useState([]) // Lista de marcas
  const [kitchenStations, setKitchenStations] = useState([]) // Estaciones de cocina
  const [enableKitchenStations, setEnableKitchenStations] = useState(false) // Multi-estación habilitada
  const [categoryMap, setCategoryMap] = useState({}) // Mapeo ID → nombre de categoría
  const [autoPrintByStation, setAutoPrintByStation] = useState(false) // Impresión automática

  // Modales para nueva orden
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false)
  const [showOrderItemsModal, setShowOrderItemsModal] = useState(false)
  const [newOrderData, setNewOrderData] = useState(null)

  // Estado para impresión de comanda
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const kitchenTicketRef = useRef()

  // Estado para configuración de impresión web legible y compacta
  const [webPrintLegible, setWebPrintLegible] = useState(false)
  const [compactPrint, setCompactPrint] = useState(false)

  // Estado para modal de cierre de orden
  const [showCloseOrderModal, setShowCloseOrderModal] = useState(false)
  const [orderToClose, setOrderToClose] = useState(null)
  const [isClosingOrder, setIsClosingOrder] = useState(false)

  // Cargar configuración de impresora para webPrintLegible y compactPrint
  useEffect(() => {
    const loadPrinterConfig = async () => {
      if (!user?.uid) return
      try {
        const printerConfigResult = await getPrinterConfig(getBusinessId())
        if (printerConfigResult.success && printerConfigResult.config) {
          setWebPrintLegible(printerConfigResult.config.webPrintLegible || false)
          setCompactPrint(printerConfigResult.config.compactPrint || false)
        }
      } catch (error) {
        console.error('Error loading printer config:', error)
      }
    }
    loadPrinterConfig()
  }, [user])

  // Listener para la configuración del negocio
  useEffect(() => {
    if (!user?.uid || isDemoMode) return

    const businessRef = doc(db, 'businesses', getBusinessId())
    const unsubscribe = onSnapshot(
      businessRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const businessData = docSnap.data()
          const config = businessData.restaurantConfig || {}
          setItemStatusTracking(config.itemStatusTracking || false)
          setRequirePaymentBeforeKitchen(config.requirePaymentBeforeKitchen || false)
          setDeliveryPersons((config.deliveryPersons || []).filter(p => p.active !== false))
          setBrands((config.brands || []).filter(b => b.active !== false))
          setKitchenStations(config.kitchenStations || [])
          setEnableKitchenStations(config.enableKitchenStations || false)
          setAutoPrintByStation(config.autoPrintByStation || false)
        }
      },
      (error) => {
        console.error('Error al cargar configuración del negocio:', error)
      }
    )

    return () => unsubscribe()
  }, [user, isDemoMode, getBusinessId])

  // Cargar categorías para mapeo ID → nombre (necesario para matching de estaciones)
  useEffect(() => {
    if (!user?.uid || isDemoMode) return
    const loadCategories = async () => {
      try {
        const result = await getProductCategories(getBusinessId())
        if (result.success && result.data) {
          const catMap = {}
          result.data.forEach(cat => { catMap[cat.id] = cat.name })
          setCategoryMap(catMap)
        }
      } catch (error) {
        console.error('Error al cargar categorías:', error)
      }
    }
    loadCategories()
  }, [user, isDemoMode, getBusinessId])

  // Cargar configuración de la empresa
  useEffect(() => {
    const loadCompanySettings = async () => {
      if (!user?.uid) return

      try {
        const result = await getCompanySettings(getBusinessId())
        if (result.success) {
          setCompanySettings(result.data)
        }
      } catch (error) {
        console.error('Error al cargar configuración:', error)
      }
    }

    loadCompanySettings()
  }, [user, getBusinessId])

  // Configurar react-to-print con la nueva API
  const handlePrint = useReactToPrint({
    contentRef: kitchenTicketRef,
    onAfterPrint: () => {
      toast.success('Comanda enviada a impresora')
      setOrderToPrint(null)
    },
  })

  // Función para imprimir comanda
  const handlePrintKitchenTicket = async (order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const isNative = Capacitor.isNativePlatform()

    // Si es móvil, intentar imprimir en impresora térmica
    if (isNative) {
      try {
        // Obtener configuración de impresora
        const printerConfigResult = await getPrinterConfig(getBusinessId())

        if (printerConfigResult.success && printerConfigResult.config?.enabled && printerConfigResult.config?.address) {
          // Si hay estaciones con impresoras, imprimir separado por estación
          const stationsWithPrinter = enableKitchenStations && kitchenStations.filter(s => s.printerIp)
          if (stationsWithPrinter && stationsWithPrinter.length > 0) {
            const results = await printToAllStations(order, kitchenStations, printerConfigResult.config.paperWidth || 58)
            const allOk = results.every(r => r.success)
            if (allOk) {
              toast.success('Comandas impresas por estación')
            } else {
              const failed = results.filter(r => !r.success).map(r => r.station).join(', ')
              toast.error('Error en estaciones: ' + failed)
            }
            return
          }

          // Reconectar a la impresora
          const connectResult = await connectPrinter(printerConfigResult.config.address)

          if (!connectResult.success) {
            toast.error('No se pudo conectar a la impresora: ' + connectResult.error)
            toast.info('Usando impresión estándar...')
          } else {
            const pw = printerConfigResult.config.paperWidth || 58

            // Si hay estaciones habilitadas, imprimir separado en la misma ticketera
            if (enableKitchenStations && kitchenStations.length > 0) {
              const itemMatchesStation = (itemCategory, stationCategories) => {
                if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
                if (stationCategories.includes(itemCategory)) return true
                const itemCatName = categoryMap[itemCategory]
                if (itemCatName && stationCategories.includes(itemCatName)) return true
                for (const sc of stationCategories) {
                  if (categoryMap[sc] === itemCategory) return true
                }
                return false
              }

              let anyPrinted = false
              for (const station of kitchenStations) {
                let stationItems
                if (station.isPase) {
                  stationItems = order.items || []
                } else if (station.categories?.length > 0) {
                  stationItems = (order.items || []).filter(item =>
                    itemMatchesStation(item.category || item.categoryId || '', station.categories)
                  )
                } else {
                  continue
                }
                if (stationItems.length > 0) {
                  const stationOrder = { ...order, items: stationItems }
                  await printKitchenOrder(stationOrder, null, pw, station.name)
                  anyPrinted = true
                }
              }
              if (anyPrinted) {
                toast.success('Comandas impresas por estación')
                return
              }
            }

            // Sin estaciones: imprimir todo junto
            const result = await printKitchenOrder(order, null, pw)

            if (result.success) {
              toast.success('Comanda impresa en ticketera')
              return
            } else {
              toast.error('Error al imprimir en ticketera: ' + result.error)
              toast.info('Usando impresión estándar...')
            }
          }
        }
      } catch (error) {
        console.error('Error al imprimir en ticketera:', error)
        toast.info('Usando impresión estándar...')
      }
    }

    // Fallback: impresión estándar (web o si falla la térmica)
    setOrderToPrint(order)
    // Esperar a que se renderice el ticket antes de imprimir
    setTimeout(() => {
      handlePrint()
    }, 300)
  }

  // Listener en tiempo real para órdenes activas
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    // Si estamos en modo demo, usar datos de demo
    if (isDemoMode && demoData?.orders) {
      // Solo mostrar órdenes activas (excluir delivered y cancelled)
      const ordersData = demoData.orders.filter(o =>
        ['pending', 'preparing', 'ready', 'dispatched'].includes(o.status)
      )

      // Ordenar por fecha de creación (más recientes primero)
      ordersData.sort((a, b) => {
        const dateA = a.createdAt || new Date(0)
        const dateB = b.createdAt || new Date(0)
        return dateB - dateA
      })

      setOrders(ordersData)

      // Calcular estadísticas
      const newStats = {
        total: ordersData.length,
        pending: ordersData.filter(o => o.status === 'pending').length,
        preparing: ordersData.filter(o => o.status === 'preparing').length,
        ready: ordersData.filter(o => o.status === 'ready').length,
        dispatched: ordersData.filter(o => o.status === 'dispatched').length,
        totalRevenue: ordersData.reduce((sum, o) => sum + (o.total || 0), 0),
      }
      setStats(newStats)
      setIsLoading(false)
      return
    }

    // Modo normal - usar Firestore
    const businessId = getBusinessId()
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    // Solo consultar órdenes activas (excluir delivered y cancelled)
    // Ordenaremos los datos en el cliente después de recibirlos
    const q = query(
      ordersRef,
      where('status', 'in', ['pending', 'preparing', 'ready', 'dispatched'])
    )

    // Listener en tiempo real - se ejecuta cada vez que hay cambios
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = []
        snapshot.forEach((doc) => {
          ordersData.push({ id: doc.id, ...doc.data() })
        })

        // Ordenar por fecha de creación en el cliente (más recientes primero)
        ordersData.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
          return dateB - dateA // Descendente
        })

        setOrders(ordersData)

        // Calcular estadísticas en tiempo real
        const newStats = {
          total: ordersData.length,
          pending: ordersData.filter(o => o.status === 'pending').length,
          preparing: ordersData.filter(o => o.status === 'preparing').length,
          ready: ordersData.filter(o => o.status === 'ready').length,
          dispatched: ordersData.filter(o => o.status === 'dispatched').length,
          totalRevenue: ordersData.reduce((sum, o) => sum + (o.total || 0), 0),
        }
        setStats(newStats)

        setIsLoading(false)
      },
      (error) => {
        console.error('Error en listener de órdenes:', error)
        toast.error('Error al cargar órdenes en tiempo real')
        setIsLoading(false)
      }
    )

    // Cleanup: desuscribirse cuando el componente se desmonte
    return () => unsubscribe()
  }, [user, isDemoMode, demoData])

  const loadOrders = async () => {
    // Esta función ya no es necesaria con listeners en tiempo real
    // Los datos se actualizan automáticamente vía onSnapshot
  }

  const handleCreateOrderClick = () => {
    setShowCreateOrderModal(true)
  }

  const handleOrderTypeSelected = (orderData) => {
    // Guardar datos de la orden (tipo, fuente, cliente)
    setNewOrderData(orderData)
    setShowCreateOrderModal(false)
    // Abrir modal de items
    setShowOrderItemsModal(true)
  }

  const handleOrderItemsAdded = async (items) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      // Calcular total
      const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

      // Crear la orden
      const orderPayload = {
        ...newOrderData,
        items: items.map(item => ({
          ...item,
          total: item.price * item.quantity
        })),
        total,
        status: 'pending',
        tableId: null,
        tableNumber: null,
      }

      const result = await createOrder(getBusinessId(), orderPayload)

      if (result.success) {
        toast.success('Orden creada exitosamente')
        setShowOrderItemsModal(false)
        setNewOrderData(null)
      } else {
        toast.error('Error al crear orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al crear orden:', error)
      toast.error('Error al crear la orden')
    }
  }

  const handleCloseOrder = (order) => {
    // Abrir modal para elegir: con comprobante o sin comprobante
    setOrderToClose(order)
    setShowCloseOrderModal(true)
  }

  const handleCloseWithReceipt = () => {
    if (!orderToClose) return

    // Navegar al POS con los items de la orden precargados
    navigate('/app/pos', {
      state: {
        fromOrder: true,
        orderId: orderToClose.id,
        orderNumber: orderToClose.orderNumber,
        items: orderToClose.items,
        orderType: orderToClose.orderType,
        markAsPaidOnComplete: true,
      }
    })
    setShowCloseOrderModal(false)
    setOrderToClose(null)
  }

  const handleCloseWithoutReceipt = async () => {
    if (!orderToClose) return

    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      setShowCloseOrderModal(false)
      setOrderToClose(null)
      return
    }

    setIsClosingOrder(true)
    try {
      const result = await completeOrder(getBusinessId(), orderToClose.id)
      if (result.success) {
        toast.success(`Orden #${orderToClose.orderNumber} cerrada exitosamente`)
      } else {
        toast.error('Error al cerrar la orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al cerrar orden sin comprobante:', error)
      toast.error('Error al cerrar la orden')
    } finally {
      setIsClosingOrder(false)
      setShowCloseOrderModal(false)
      setOrderToClose(null)
    }
  }

  const handleStatusChange = async (orderId, currentStatus, order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Definir el siguiente estado
    const statusFlow = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'dispatched',
      dispatched: 'delivered',
    }

    const nextStatus = statusFlow[currentStatus]
    if (!nextStatus) return

    // Validar pago antes de enviar a cocina si está configurado
    if (currentStatus === 'pending' && nextStatus === 'preparing' && requirePaymentBeforeKitchen) {
      if (!order?.paid) {
        toast.error('Esta orden debe estar pagada antes de enviarla a cocina')
        return
      }
    }

    setUpdatingOrderId(orderId)
    try {
      const result = await updateOrderStatus(getBusinessId(), orderId, nextStatus)
      if (result.success) {
        toast.success(`Orden actualizada a ${getStatusConfig(nextStatus).label}`)

        // Auto-imprimir a estaciones cuando se envía a cocina
        if (currentStatus === 'pending' && nextStatus === 'preparing' && autoPrintByStation && kitchenStations.length > 0) {
          const stationsWithPrinter = kitchenStations.filter(s => s.printerIp)
          if (stationsWithPrinter.length > 0) {
            toast.info('Imprimiendo comandas en estaciones...')
            try {
              const printResults = await printToAllStations(order, kitchenStations)
              const successCount = printResults.filter(r => r.success).length
              if (successCount > 0) {
                toast.success(`Comandas impresas en ${successCount} estación(es)`)
              }
              const failedStations = printResults.filter(r => !r.success)
              if (failedStations.length > 0) {
                console.warn('Estaciones con error de impresión:', failedStations)
              }
            } catch (printError) {
              console.error('Error al imprimir a estaciones:', printError)
              // No mostrar error al usuario ya que la orden se actualizó correctamente
            }
          }
        }
      } else {
        toast.error('Error al actualizar orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al actualizar orden:', error)
      toast.error('Error al actualizar orden')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const handleMarkAsPaid = async (orderId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await markOrderAsPaid(getBusinessId(), orderId)
      if (result.success) {
        toast.success('Orden marcada como pagada')
      } else {
        toast.error('Error al marcar orden como pagada: ' + result.error)
      }
    } catch (error) {
      console.error('Error al marcar orden como pagada:', error)
      toast.error('Error al marcar orden como pagada')
    }
  }

  const handleAssignDeliveryPerson = async (orderId, deliveryPersonId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    const deliveryPerson = deliveryPersons.find(p => p.id === deliveryPersonId)

    try {
      const result = await updateOrder(getBusinessId(), orderId, {
        deliveryPersonId: deliveryPersonId || null,
        deliveryPersonName: deliveryPerson?.name || null,
        deliveryPersonPhone: deliveryPerson?.phone || null,
      })
      if (result.success) {
        toast.success(deliveryPerson ? `Repartidor ${deliveryPerson.name} asignado` : 'Repartidor removido')
      } else {
        toast.error('Error al asignar repartidor: ' + result.error)
      }
    } catch (error) {
      console.error('Error al asignar repartidor:', error)
      toast.error('Error al asignar repartidor')
    }
  }

  // Ir al POS para cobrar una orden
  const handleGoToPayment = (order) => {
    navigate('/app/pos', {
      state: {
        fromOrder: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: order.items,
        orderType: order.orderType,
        markAsPaidOnComplete: true, // Flag para marcar como pagada al completar
      }
    })
  }

  // Marcar orden como entregada (quita de la lista activa)
  const handleMarkAsDelivered = async (orderId) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await updateOrderStatus(getBusinessId(), orderId, 'delivered')
      if (result.success) {
        toast.success('Orden marcada como entregada')
      } else {
        toast.error('Error al actualizar orden: ' + result.error)
      }
    } catch (error) {
      console.error('Error al marcar orden como entregada:', error)
      toast.error('Error al actualizar orden')
    }
  }

  const calculateElapsedTime = (createdAt) => {
    if (!createdAt) return '0 min'

    const orderDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
    const now = new Date()
    const diffMs = now - orderDate
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins} min`
    } else {
      const hours = Math.floor(diffMins / 60)
      const mins = diffMins % 60
      return `${hours}h ${mins}min`
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pendiente',
          variant: 'warning',
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 border-yellow-200',
        }
      case 'preparing':
        return {
          label: 'En Preparación',
          variant: 'default',
          icon: AlertCircle,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 border-blue-200',
        }
      case 'ready':
        return {
          label: 'Lista',
          variant: 'success',
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200',
        }
      case 'dispatched':
        return {
          label: 'Despachada',
          variant: 'info',
          icon: Truck,
          color: 'text-purple-600',
          bgColor: 'bg-purple-50 border-purple-200',
        }
      case 'delivered':
        return {
          label: 'Entregada',
          variant: 'secondary',
          icon: CheckCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
        }
      default:
        return {
          label: status,
          variant: 'default',
          icon: AlertCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
        }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando órdenes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListOrdered className="w-7 h-7" />
            Órdenes Activas
          </h1>
          <p className="text-gray-600 mt-1">Monitorea las órdenes en tiempo real</p>
        </div>
        <Button onClick={handleCreateOrderClick} size="lg" className="w-full md:w-auto">
          <Plus className="w-5 h-5 mr-2" />
          Nueva Orden
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Órdenes Activas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{orders.length}</p>
              </div>
              <ListOrdered className="w-10 h-10 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">
                  {stats?.pending || 0}
                </p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Preparación</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">
                  {stats?.preparing || 0}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas Hoy</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  S/ {(stats?.totalSalesToday || 0).toFixed(2)}
                </p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Órdenes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="py-12 text-center">
                <ListOrdered className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay órdenes activas</h3>
                <p className="text-gray-600">
                  Las órdenes aparecerán aquí cuando se ocupen las mesas
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          orders.map((order) => {
            const statusConfig = getStatusConfig(order.status)
            const StatusIcon = statusConfig.icon
            const elapsed = calculateElapsedTime(order.createdAt)
            const isUpdating = updatingOrderId === order.id
            const isUrgent = order.priority === 'urgent'

            return (
              <Card key={order.id} className={`border-2 ${isUrgent ? 'border-red-500 bg-red-50' : statusConfig.bgColor}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg">{order.orderNumber || '#' + order.id.slice(-6)}</span>
                      {isUrgent && (
                        <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                          URGENTE
                        </span>
                      )}
                      {requirePaymentBeforeKitchen && (
                        order.paid ? (
                          <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            PAGADO
                          </span>
                        ) : order.status === 'pending' ? (
                          <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            PAGO PENDIENTE
                          </span>
                        ) : null
                      )}
                      {order.brandName && (
                        <span
                          className="px-2 py-0.5 text-white text-xs font-bold rounded-full"
                          style={{ backgroundColor: order.brandColor || '#8B5CF6' }}
                        >
                          {order.brandName}
                        </span>
                      )}
                      <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${statusConfig.color}`}>
                        {elapsed}
                      </span>
                      <Button
                        onClick={() => handlePrintKitchenTicket(order)}
                        variant="outline"
                        size="sm"
                        className="p-1.5"
                        title="Imprimir Comanda"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Info de Mesa/Tipo y Mozo/Fuente */}
                  <div className="flex items-center justify-between text-sm pb-3 border-b border-gray-200">
                    {order.tableNumber ? (
                      <div className="flex items-center gap-2">
                        <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-700">
                          {order.tableNumber}
                        </div>
                        <span className="text-gray-600">Mesa {order.tableNumber}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {order.orderType === 'delivery' ? (
                          <Bike className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ShoppingBag className="w-4 h-4 text-green-600" />
                        )}
                        <span className="text-gray-600">
                          {order.orderType === 'delivery' ? 'Delivery' : 'Para Llevar'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-gray-600">
                      {order.waiterName ? (
                        <>
                          <Users className="w-4 h-4" />
                          <span>{order.waiterName}</span>
                        </>
                      ) : order.source ? (
                        <>
                          <Smartphone className="w-4 h-4" />
                          <span>{order.source}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Nombre del cliente si existe */}
                  {order.customerName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 pb-2">
                      <User className="w-4 h-4" />
                      <span>{order.customerName}</span>
                      {order.customerPhone && (
                        <span className="text-gray-400">• {order.customerPhone}</span>
                      )}
                    </div>
                  )}

                  {/* Selector de repartidor para delivery */}
                  {order.orderType === 'delivery' && deliveryPersons.length > 0 && (
                    <div className="flex items-center gap-2 text-sm pb-2 border-b border-gray-200 mb-2">
                      <Bike className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-600">Repartidor:</span>
                      <select
                        value={order.deliveryPersonId || ''}
                        onChange={(e) => handleAssignDeliveryPerson(order.id, e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {deliveryPersons.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mostrar repartidor asignado cuando hay pocos repartidores */}
                  {order.orderType === 'delivery' && order.deliveryPersonName && deliveryPersons.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 pb-2">
                      <Bike className="w-4 h-4" />
                      <span>Repartidor: {order.deliveryPersonName}</span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="space-y-2">
                    {(order.items || []).map((item, idx) => {
                      const itemStatus = item.status || 'pending'
                      return (
                        <div key={item.itemId || idx} className="space-y-1">
                          <div className="flex justify-between text-sm items-start">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-gray-700">
                                {item.quantity}x {item.name}
                              </span>
                              {/* Badge de estado del item - Solo si itemStatusTracking está habilitado */}
                              {itemStatusTracking && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${
                                  itemStatus === 'delivered' ? 'bg-gray-600' :
                                  itemStatus === 'ready' ? 'bg-green-600' :
                                  itemStatus === 'preparing' ? 'bg-blue-600' :
                                  'bg-yellow-600'
                                }`}>
                                  {itemStatus === 'delivered' ? '✓ Entregado' :
                                   itemStatus === 'ready' ? '● Listo' :
                                   itemStatus === 'preparing' ? '⚡ Preparando' :
                                   '○ Pendiente'}
                                </span>
                              )}
                            </div>
                            <span className="font-medium text-gray-900">
                              S/ {(item.total || 0).toFixed(2)}
                            </span>
                          </div>

                        {/* Mostrar modificadores si existen */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="ml-6 bg-primary-50 border border-primary-200 rounded px-2 py-1.5 space-y-1">
                            <div className="text-xs font-semibold text-primary-900 uppercase">
                              Modificadores:
                            </div>
                            {item.modifiers.map((modifier, modIdx) => (
                              <div key={modIdx} className="text-xs text-primary-800">
                                <span className="font-medium">• {modifier.modifierName}:</span>
                                <span className="ml-1">
                                  {modifier.options.map((opt, optIdx) => (
                                    <span key={optIdx}>
                                      {opt.optionName}
                                      {opt.priceAdjustment > 0 && ` (+S/ ${opt.priceAdjustment.toFixed(2)})`}
                                      {optIdx < modifier.options.length - 1 && ', '}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.notes && (
                          <div className="flex items-start gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded ml-6">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>{item.notes}</span>
                          </div>
                        )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Total */}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">TOTAL</span>
                    <span className="text-lg font-bold text-gray-900">
                      S/ {(order.total || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Hora de inicio */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>Iniciada a las {formatTime(order.createdAt)}</span>
                  </div>

                  {/* Mostrar hora de despacho si existe */}
                  {order.dispatchedAt && (
                    <div className="flex items-center gap-2 text-xs text-purple-600 mt-2">
                      <Truck className="w-3 h-3" />
                      <span>Despachada a las {formatTime(order.dispatchedAt)}</span>
                    </div>
                  )}

                  {/* Botones de acción */}
                  <div className="flex gap-2 mt-3">
                    {/* Botón de cerrar cuenta (solo para órdenes listas) */}
                    {order.status === 'ready' && (
                      <Button
                        onClick={() => handleCloseOrder(order)}
                        variant="success"
                        className="flex-1"
                        size="sm"
                      >
                        <Receipt className="w-4 h-4 mr-2" />
                        Cerrar Cuenta
                      </Button>
                    )}

                    {/* Botón de despachar (para órdenes listas - delivery/para llevar) */}
                    {order.status === 'ready' && !order.tableNumber && (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'ready', order)}
                        disabled={isUpdating}
                        variant="outline"
                        className="flex-1 border-purple-500 text-purple-600 hover:bg-purple-50"
                        size="sm"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <PackageCheck className="w-4 h-4 mr-2" />
                            Despachar
                          </>
                        )}
                      </Button>
                    )}

                    {/* Botón de Cobrar (para órdenes no pagadas en cualquier estado activo) */}
                    {!order.paid && order.status !== 'delivered' && (
                      <Button
                        onClick={() => handleGoToPayment(order)}
                        variant="outline"
                        className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                        size="sm"
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Cobrar
                      </Button>
                    )}

                    {/* Botón de Marcar Entregada (para órdenes despachadas) */}
                    {order.status === 'dispatched' && (
                      <Button
                        onClick={() => handleMarkAsDelivered(order.id)}
                        variant="success"
                        className="flex-1"
                        size="sm"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Marcar Entregada
                      </Button>
                    )}

                    {/* Botón de avanzar estado (para pending y preparing) */}
                    {order.status !== 'delivered' && order.status !== 'ready' && order.status !== 'dispatched' && (
                      <Button
                        onClick={() => handleStatusChange(order.id, order.status, order)}
                        disabled={isUpdating || (order.status === 'pending' && requirePaymentBeforeKitchen && !order.paid)}
                        className="flex-1"
                        size="sm"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Actualizando...
                          </>
                        ) : (
                          <>
                            Marcar como {getStatusConfig(
                              order.status === 'pending' ? 'preparing' : 'ready'
                            ).label}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal para crear nueva orden */}
      <CreateOrderModal
        isOpen={showCreateOrderModal}
        onClose={() => setShowCreateOrderModal(false)}
        onConfirm={handleOrderTypeSelected}
        brands={brands}
      />

      {/* Modal para agregar items a la orden */}
      {showOrderItemsModal && newOrderData && (
        <OrderItemsModal
          isOpen={showOrderItemsModal}
          onClose={() => {
            setShowOrderItemsModal(false)
            setNewOrderData(null)
          }}
          table={{ number: newOrderData.orderType === 'delivery' ? 'Delivery' : 'Para Llevar' }}
          order={{ id: 'temp', items: [] }}
          onSuccess={() => {
            // Este callback se ejecutará después de que OrderItemsModal llame a addOrderItems
            // Pero nosotros lo interceptaremos
          }}
          isNewOrder={true}
          newOrderData={newOrderData}
          onSaveNewOrder={handleOrderItemsAdded}
        />
      )}

      {/* Comanda para imprimir (oculta, fuera de pantalla para react-to-print) */}
      {orderToPrint && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={kitchenTicketRef} className={enableKitchenStations && kitchenStations.length > 0 ? 'kitchen-multi-ticket' : undefined}>
            {enableKitchenStations && kitchenStations.length > 0 ? (() => {
              // Helper: matchear categoría de item con categorías de estación
              // Soporta nombres e IDs en ambos lados (igual que Kitchen.jsx)
              const itemMatchesStation = (itemCategory, stationCategories) => {
                if (!itemCategory || !stationCategories || stationCategories.length === 0) return false
                if (stationCategories.includes(itemCategory)) return true
                // item.category es un ID → buscar su nombre y comparar
                const itemCatName = categoryMap[itemCategory]
                if (itemCatName && stationCategories.includes(itemCatName)) return true
                // station.categories tiene IDs → buscar sus nombres y comparar
                for (const stationCat of stationCategories) {
                  if (categoryMap[stationCat] === itemCategory) return true
                }
                return false
              }

              const allItems = orderToPrint.items || []
              const assignedCategories = new Set()
              const stationTickets = []

              kitchenStations.forEach(station => {
                let stationItems
                if (station.isPase) {
                  stationItems = allItems
                } else if (station.categories && station.categories.length > 0) {
                  stationItems = allItems.filter(item =>
                    itemMatchesStation(item.category || item.categoryId || '', station.categories)
                  )
                  station.categories.forEach(cat => {
                    assignedCategories.add(cat)
                    if (categoryMap[cat]) assignedCategories.add(categoryMap[cat])
                  })
                } else {
                  stationItems = []
                }
                if (stationItems.length > 0) {
                  stationTickets.push({ name: station.name, items: stationItems })
                }
              })

              // Items huérfanos (categoría no asignada a ninguna estación)
              const hasPase = kitchenStations.some(s => s.isPase)
              if (!hasPase) {
                const orphanItems = allItems.filter(item => {
                  const itemCat = item.category || item.categoryId || ''
                  const itemCatName = categoryMap[itemCat] || itemCat
                  return !assignedCategories.has(itemCat) && !assignedCategories.has(itemCatName)
                })
                if (orphanItems.length > 0) {
                  stationTickets.push({ name: 'General', items: orphanItems })
                }
              }

              return stationTickets.map((ticket, idx) => (
                <div key={idx} style={{ pageBreakAfter: idx < stationTickets.length - 1 ? 'always' : 'auto' }}>
                  <KitchenTicket
                    order={{ ...orderToPrint, items: ticket.items }}
                    companySettings={companySettings}
                    webPrintLegible={webPrintLegible}
                    compactPrint={compactPrint}
                    stationName={ticket.name}
                  />
                </div>
              ))
            })() : (
              <KitchenTicket
                order={orderToPrint}
                companySettings={companySettings}
                webPrintLegible={webPrintLegible}
                compactPrint={compactPrint}
              />
            )}
          </div>
        </div>
      )}

      {/* Modal para cerrar orden */}
      <Modal
        isOpen={showCloseOrderModal}
        onClose={() => {
          setShowCloseOrderModal(false)
          setOrderToClose(null)
        }}
        title={`Cerrar Cuenta - Orden #${orderToClose?.orderNumber || ''}`}
        size="md"
      >
        {orderToClose && (
          <div className="space-y-6">
            {/* Resumen de la cuenta */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-700 font-medium">Total a Cobrar:</span>
                <span className="text-3xl font-bold text-primary-600">
                  S/ {(orderToClose.total || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Tipo de orden:</span>
                  <span className="capitalize">{orderToClose.orderType === 'delivery' ? 'Delivery' : orderToClose.orderType === 'takeout' ? 'Para llevar' : orderToClose.orderType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Items:</span>
                  <span>{orderToClose.items?.length || 0} producto(s)</span>
                </div>
              </div>
            </div>

            {/* Opciones de cierre */}
            {orderToClose.paid ? (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">Esta orden ya fue cobrada</p>
                      <p className="text-sm text-green-700">El comprobante ya fue generado desde la opción Cobrar.</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCloseOrderModal(false)
                      setOrderToClose(null)
                    }}
                    className="flex-1"
                    disabled={isClosingOrder}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCloseWithoutReceipt}
                    disabled={isClosingOrder}
                    className="flex-1"
                    variant="success"
                  >
                    {isClosingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cerrando...
                      </>
                    ) : (
                      'Cerrar Orden'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    ¿Cómo desea cerrar la cuenta?
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={handleCloseWithReceipt}
                      className="p-6 border-2 border-primary-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-center"
                    >
                      <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-primary-600" />
                      <div className="font-semibold text-gray-900 mb-1">Crear Comprobante</div>
                      <div className="text-xs text-gray-600">
                        Ir al POS para generar Boleta, Factura o Nota de Venta
                      </div>
                    </button>
                    <button
                      onClick={handleCloseWithoutReceipt}
                      disabled={isClosingOrder}
                      className="p-6 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isClosingOrder ? (
                        <Loader2 className="w-10 h-10 mx-auto mb-3 text-gray-600 animate-spin" />
                      ) : (
                        <X className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                      )}
                      <div className="font-semibold text-gray-900 mb-1">
                        {isClosingOrder ? 'Cerrando...' : 'Cerrar sin Comprobante'}
                      </div>
                      <div className="text-xs text-gray-600">
                        Marcar la orden como completada sin generar comprobante
                      </div>
                    </button>
                  </div>
                </div>

                {/* Botón cancelar */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCloseOrderModal(false)
                      setOrderToClose(null)
                    }}
                    className="w-full"
                    disabled={isClosingOrder}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

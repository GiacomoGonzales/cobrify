import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, Users, DollarSign, Loader2, ChevronRight, Plus, Receipt, Bike, ShoppingBag, Smartphone, User, Printer } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getActiveOrders, getOrdersStats, updateOrderStatus, createOrder } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getCompanySettings } from '@/services/firestoreService'
import CreateOrderModal from '@/components/restaurant/CreateOrderModal'
import OrderItemsModal from '@/components/restaurant/OrderItemsModal'
import KitchenTicket from '@/components/KitchenTicket'
import { useReactToPrint } from 'react-to-print'

export default function Orders() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

  // Modales para nueva orden
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false)
  const [showOrderItemsModal, setShowOrderItemsModal] = useState(false)
  const [newOrderData, setNewOrderData] = useState(null)

  // Estado para impresión de comanda
  const [companySettings, setCompanySettings] = useState(null)
  const [orderToPrint, setOrderToPrint] = useState(null)
  const kitchenTicketRef = useRef()

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
  const handlePrintKitchenTicket = (order) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

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
        ['pending', 'preparing', 'ready'].includes(o.status)
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
      where('status', 'in', ['pending', 'preparing', 'ready'])
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
    // Navegar al POS con los items de la orden precargados
    navigate('/app/pos', {
      state: {
        fromOrder: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        items: order.items,
        orderType: order.orderType,
      }
    })
  }

  const handleStatusChange = async (orderId, currentStatus) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    // Definir el siguiente estado
    const statusFlow = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'delivered',
    }

    const nextStatus = statusFlow[currentStatus]
    if (!nextStatus) return

    setUpdatingOrderId(orderId)
    try {
      const result = await updateOrderStatus(getBusinessId(), orderId, nextStatus)
      if (result.success) {
        toast.success(`Orden actualizada a ${getStatusConfig(nextStatus).label}`)
        // No es necesario llamar a loadOrders() - el listener actualiza automáticamente
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListOrdered className="w-7 h-7" />
            Órdenes Activas
          </h1>
          <p className="text-gray-600 mt-1">Monitorea las órdenes en tiempo real</p>
        </div>
        <Button onClick={handleCreateOrderClick} size="lg">
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

            return (
              <Card key={order.id} className={`border-2 ${statusConfig.bgColor}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg">{order.orderNumber || '#' + order.id.slice(-6)}</span>
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

                  {/* Items */}
                  <div className="space-y-2">
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">
                            {item.quantity}x {item.name}
                          </span>
                          <span className="font-medium text-gray-900">
                            S/ {(item.total || 0).toFixed(2)}
                          </span>
                        </div>
                        {item.notes && (
                          <div className="flex items-start gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded ml-6">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>{item.notes}</span>
                          </div>
                        )}
                      </div>
                    ))}
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

                    {/* Botón de avanzar estado (para pending y preparing) */}
                    {order.status !== 'delivered' && order.status !== 'ready' && (
                      <Button
                        onClick={() => handleStatusChange(order.id, order.status)}
                        disabled={isUpdating}
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

      {/* Comanda para imprimir (oculta) */}
      {orderToPrint && (
        <div style={{ display: 'none' }}>
          <KitchenTicket
            ref={kitchenTicketRef}
            order={orderToPrint}
            companySettings={companySettings}
          />
        </div>
      )}
    </div>
  )
}

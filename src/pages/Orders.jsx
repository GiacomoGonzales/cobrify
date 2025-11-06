import { useState, useEffect } from 'react'
import { ListOrdered, Clock, CheckCircle, XCircle, AlertCircle, Users, DollarSign, Loader2, ChevronRight } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getActiveOrders, getOrdersStats, updateOrderStatus } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function Orders() {
  const { user, getBusinessId } = useAppContext()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

  // Listener en tiempo real para órdenes activas
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    const businessId = getBusinessId()
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    // Query para órdenes activas (pending, preparing, ready, delivered)
    const q = query(
      ordersRef,
      where('status', 'in', ['pending', 'preparing', 'ready', 'delivered']),
      firestoreOrderBy('createdAt', 'desc')
    )

    // Listener en tiempo real - se ejecuta cada vez que hay cambios
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = []
        snapshot.forEach((doc) => {
          ordersData.push({ id: doc.id, ...doc.data() })
        })

        setOrders(ordersData)

        // Calcular estadísticas en tiempo real
        const newStats = {
          total: ordersData.length,
          pending: ordersData.filter(o => o.status === 'pending').length,
          preparing: ordersData.filter(o => o.status === 'preparing').length,
          ready: ordersData.filter(o => o.status === 'ready').length,
          delivered: ordersData.filter(o => o.status === 'delivered').length,
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
  }, [user])

  const loadOrders = async () => {
    // Esta función ya no es necesaria con listeners en tiempo real
    // Los datos se actualizan automáticamente vía onSnapshot
  }

  const handleStatusChange = async (orderId, currentStatus) => {
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
                      <span className="font-mono font-bold text-lg">#{order.id.slice(-6)}</span>
                      <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <span className={`text-sm font-semibold ${statusConfig.color}`}>
                      {elapsed}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Info de Mesa y Mozo */}
                  <div className="flex items-center justify-between text-sm pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-700">
                        {order.tableNumber}
                      </div>
                      <span className="text-gray-600">Mesa {order.tableNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>{order.waiterName}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">
                          {item.quantity}x {item.name}
                        </span>
                        <span className="font-medium text-gray-900">
                          S/ {(item.total || 0).toFixed(2)}
                        </span>
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

                  {/* Botón de avanzar estado */}
                  {order.status !== 'delivered' && (
                    <Button
                      onClick={() => handleStatusChange(order.id, order.status)}
                      disabled={isUpdating}
                      className="w-full mt-3"
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
                            order.status === 'pending' ? 'preparing' :
                            order.status === 'preparing' ? 'ready' : 'delivered'
                          ).label}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

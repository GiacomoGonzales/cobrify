import { useState, useEffect } from 'react'
import { ChefHat, Clock, CheckCircle, AlertTriangle, Flame, Loader2 } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getActiveOrders, updateOrderStatus } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function Kitchen() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

  // Listener en tiempo real para órdenes activas de cocina
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    // Si estamos en modo demo, usar datos de demo
    if (isDemoMode && demoData?.orders) {
      const ordersData = demoData.orders.filter(o =>
        ['pending', 'preparing', 'ready', 'active'].includes(o.status)
      )

      // Ordenar por fecha de creación (más antiguas primero para cocina)
      ordersData.sort((a, b) => {
        const dateA = a.createdAt || new Date(0)
        const dateB = b.createdAt || new Date(0)
        return dateA - dateB
      })

      setOrders(ordersData)
      setIsLoading(false)
      return
    }

    // Modo normal - usar Firestore
    const businessId = getBusinessId()
    const ordersRef = collection(db, 'businesses', businessId, 'orders')

    // Query simplificada sin orderBy para evitar índice compuesto
    // Ordenaremos los datos en el cliente después de recibirlos
    const q = query(
      ordersRef,
      where('status', 'in', ['pending', 'preparing', 'ready'])
    )

    // Listener en tiempo real - se ejecuta cada vez que hay cambios en las órdenes
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = []
        snapshot.forEach((doc) => {
          ordersData.push({ id: doc.id, ...doc.data() })
        })

        // Ordenar por fecha de creación en el cliente (más antiguas primero para cocina)
        ordersData.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0)
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0)
          return dateA - dateB // Ascendente - las más antiguas primero
        })

        setOrders(ordersData)
        setIsLoading(false)
      },
      (error) => {
        console.error('Error en listener de órdenes de cocina:', error)
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

  const handleStatusChange = async (orderId, newStatus) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setUpdatingOrderId(orderId)
    try {
      const result = await updateOrderStatus(getBusinessId(), orderId, newStatus)
      if (result.success) {
        toast.success(`Orden actualizada`)
        // No es necesario llamar a loadOrders() - el listener actualiza automáticamente
      } else {
        toast.error('Error al actualizar orden')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar orden')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const preparingOrders = orders.filter(o => o.status === 'preparing')
  const readyOrders = orders.filter(o => o.status === 'ready')

  const calculateElapsedTime = (createdAt) => {
    if (!createdAt) return '0 min'
    const orderDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
    const now = new Date()
    const diffMs = now - orderDate
    const diffMins = Math.floor(diffMs / 60000)
    return diffMins
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-100'
      case 'normal':
        return 'text-blue-600 bg-blue-100'
      case 'low':
        return 'text-gray-600 bg-gray-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high':
        return 'Urgente'
      case 'normal':
        return 'Normal'
      case 'low':
        return 'Bajo'
      default:
        return priority
    }
  }

  const getElapsedColor = (elapsed) => {
    const minutes = parseInt(elapsed)
    if (minutes > 20) return 'text-red-600'
    if (minutes > 10) return 'text-yellow-600'
    return 'text-green-600'
  }

  const renderOrderCard = (order, showActions = true) => {
    const elapsed = calculateElapsedTime(order.createdAt)
    const isUpdating = updatingOrderId === order.id

    return (
      <Card key={order.id} className="border-2 border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-primary-100 rounded-full w-10 h-10 flex items-center justify-center">
                <span className="font-bold text-primary-600 text-lg">{order.tableNumber}</span>
              </div>
              <div>
                <div className="font-mono font-bold text-gray-900">{order.orderNumber || '#' + order.id.slice(-6)}</div>
                <div className="text-xs text-gray-500">{order.waiterName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${getElapsedColor(elapsed)}`}>
                {elapsed} min
              </div>
              <div className="text-xs text-gray-500">{formatTime(order.createdAt)}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Items */}
          <div className="space-y-2">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-lg">{item.quantity}x</span>
                      <span className="font-semibold text-gray-900">{item.name}</span>
                    </div>
                    {item.notes && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded w-fit">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{item.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex gap-2 pt-2">
              {order.status === 'pending' && (
                <Button
                  onClick={() => handleStatusChange(order.id, 'preparing')}
                  disabled={isUpdating}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isUpdating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Actualizando...</>
                  ) : (
                    <><Flame className="w-4 h-4 mr-2" />Iniciar Preparación</>
                  )}
                </Button>
              )}
              {order.status === 'preparing' && (
                <Button
                  onClick={() => handleStatusChange(order.id, 'ready')}
                  disabled={isUpdating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isUpdating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Actualizando...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Marcar como Lista</>
                  )}
                </Button>
              )}
              {order.status === 'ready' && (
                <Button
                  onClick={() => handleStatusChange(order.id, 'delivered')}
                  disabled={isUpdating}
                  className="flex-1 bg-gray-600 hover:bg-gray-700"
                >
                  {isUpdating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Actualizando...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Entregada</>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
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
            <ChefHat className="w-7 h-7" />
            Vista de Cocina
          </h1>
          <p className="text-gray-600 mt-1">Sistema de display para la cocina (KDS)</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-lg">
          <Clock className="w-5 h-5 text-gray-600" />
          <span className="font-mono text-xl font-bold text-gray-900">
            {new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-700">Pendientes</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{pendingOrders.length}</p>
              </div>
              <Clock className="w-12 h-12 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">En Preparación</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{preparingOrders.length}</p>
              </div>
              <Flame className="w-12 h-12 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Listas</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{readyOrders.length}</p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Columnas de Órdenes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pendientes */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-yellow-300">
            <Clock className="w-5 h-5 text-yellow-600" />
            <h2 className="text-lg font-bold text-yellow-700">
              Pendientes ({pendingOrders.length})
            </h2>
          </div>
          <div className="space-y-4">
            {pendingOrders.map(order => renderOrderCard(order))}
            {pendingOrders.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay órdenes pendientes</p>
              </div>
            )}
          </div>
        </div>

        {/* En Preparación */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-blue-300">
            <Flame className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-blue-700">
              En Preparación ({preparingOrders.length})
            </h2>
          </div>
          <div className="space-y-4">
            {preparingOrders.map(order => renderOrderCard(order))}
            {preparingOrders.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Flame className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay órdenes en preparación</p>
              </div>
            )}
          </div>
        </div>

        {/* Listas */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b-2 border-green-300">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-bold text-green-700">
              Listas ({readyOrders.length})
            </h2>
          </div>
          <div className="space-y-4">
            {readyOrders.map(order => renderOrderCard(order))}
            {readyOrders.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay órdenes listas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

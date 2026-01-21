import { useState, useEffect } from 'react'
import { ChefHat, Clock, CheckCircle, AlertTriangle, Flame, Loader2, LayoutGrid } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getActiveOrders, updateOrderStatus, updateItemStatus } from '@/services/orderService'
import { getProductCategories } from '@/services/firestoreService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { collection, query, where, onSnapshot, orderBy as firestoreOrderBy, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function Kitchen() {
  const { user, getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [updatingItemId, setUpdatingItemId] = useState(null)
  const [itemStatusTracking, setItemStatusTracking] = useState(false) // Config para modo de seguimiento

  // Estados para modo multi-estación
  const [enableKitchenStations, setEnableKitchenStations] = useState(false)
  const [kitchenStations, setKitchenStations] = useState([])
  const [selectedStation, setSelectedStation] = useState('all') // 'all' o el ID de una estación
  const [categoryMap, setCategoryMap] = useState({}) // Mapeo de ID a nombre de categoría

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
          // Cargar configuración de estaciones
          setEnableKitchenStations(config.enableKitchenStations || false)
          setKitchenStations(config.kitchenStations || [])
        }
      },
      (error) => {
        console.error('Error al cargar configuración del negocio:', error)
      }
    )

    return () => unsubscribe()
  }, [user, isDemoMode, getBusinessId])

  // Cargar categorías para mapeo ID -> nombre (necesario para compatibilidad con estaciones antiguas)
  useEffect(() => {
    if (!user?.uid || isDemoMode) return

    const loadCategories = async () => {
      try {
        const result = await getProductCategories(getBusinessId())
        if (result.success && result.data) {
          const catMap = {}
          result.data.forEach(cat => {
            catMap[cat.id] = cat.name
          })
          setCategoryMap(catMap)
        }
      } catch (error) {
        console.error('Error al cargar categorías:', error)
      }
    }

    loadCategories()
  }, [user, isDemoMode, getBusinessId])

  // Listener en tiempo real para órdenes activas de cocina
  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)

    // Si estamos en modo demo, usar datos de demo
    if (isDemoMode && demoData?.orders) {
      const ordersData = demoData.orders.filter(o =>
        ['pending', 'preparing', 'ready', 'active'].includes(o.status)
      )

      // Ordenar: urgentes primero, luego por fecha de creación (más antiguas primero)
      ordersData.sort((a, b) => {
        // Primero por prioridad (urgente primero)
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
        // Luego por fecha (más antiguas primero)
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

        // Ordenar: urgentes primero, luego por fecha de creación (más antiguas primero)
        ordersData.sort((a, b) => {
          // Primero por prioridad (urgente primero)
          if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
          if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
          // Luego por fecha (más antiguas primero)
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

  const handleItemStatusChange = async (orderId, itemId, newStatus) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    setUpdatingItemId(itemId)
    try {
      const result = await updateItemStatus(getBusinessId(), orderId, itemId, newStatus)
      if (result.success) {
        const statusLabels = {
          'preparing': 'En Preparación',
          'ready': 'Listo',
          'delivered': 'Entregado'
        }
        toast.success(`Item marcado como: ${statusLabels[newStatus]}`)
        // El listener en tiempo real actualizará automáticamente
      } else {
        toast.error('Error al actualizar item')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar item')
    } finally {
      setUpdatingItemId(null)
    }
  }

  // En modo item-tracking, no dividimos por estado de orden
  // En modo legacy, sí dividimos en columnas
  const pendingOrders = !itemStatusTracking ? orders.filter(o => o.status === 'pending') : []
  const preparingOrders = !itemStatusTracking ? orders.filter(o => o.status === 'preparing') : []
  const readyOrders = !itemStatusTracking ? orders.filter(o => o.status === 'ready') : []

  // Para modo item-tracking: todas las órdenes activas ordenadas por tiempo
  const allActiveOrders = itemStatusTracking ? orders : []

  // Helper para verificar si una categoría de item coincide con las categorías de una estación
  // Soporta tanto nombres (nuevo) como IDs (compatibilidad con config antigua)
  const itemMatchesStationCategory = (itemCategory, stationCategories) => {
    if (!itemCategory || !stationCategories || stationCategories.length === 0) return false

    // Verificar coincidencia directa (por nombre)
    if (stationCategories.includes(itemCategory)) return true

    // Verificar si algún ID en stationCategories corresponde al nombre del item
    // (para compatibilidad con configuraciones antiguas que guardaron IDs)
    for (const stationCat of stationCategories) {
      // Si stationCat es un ID y su nombre en el mapa coincide con itemCategory
      if (categoryMap[stationCat] === itemCategory) return true
    }

    return false
  }

  // Función para filtrar items de una orden según la estación seleccionada
  const filterItemsByStation = (items) => {
    if (!enableKitchenStations || selectedStation === 'all') {
      return items
    }

    const station = kitchenStations.find(s => s.id === selectedStation)
    if (!station) return items

    // Si es estación de pase, mostrar todos los items
    if (station.isPase) {
      return items
    }

    // Filtrar items cuya categoría esté en las categorías de la estación
    return items.filter(item => {
      const itemCategory = item.category || ''
      return itemMatchesStationCategory(itemCategory, station.categories || [])
    })
  }

  // Función para obtener órdenes con items filtrados por estación
  const getFilteredOrders = (ordersToFilter) => {
    if (!enableKitchenStations || selectedStation === 'all') {
      return ordersToFilter
    }

    return ordersToFilter
      .map(order => ({
        ...order,
        items: filterItemsByStation(order.items || [])
      }))
      .filter(order => order.items.length > 0) // Solo mostrar órdenes que tengan items para esta estación
  }

  // Aplicar filtro de estación a las órdenes
  const filteredPendingOrders = getFilteredOrders(pendingOrders)
  const filteredPreparingOrders = getFilteredOrders(preparingOrders)
  const filteredReadyOrders = getFilteredOrders(readyOrders)
  const filteredAllActiveOrders = getFilteredOrders(allActiveOrders)

  // Contar items por estación (para mostrar badges en tabs)
  const countItemsForStation = (stationId) => {
    const station = kitchenStations.find(s => s.id === stationId)
    if (!station) return 0

    let count = 0
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const itemCategory = item.category || ''
        if (station.isPase || itemMatchesStationCategory(itemCategory, station.categories || [])) {
          // Solo contar items pendientes o en preparación
          const itemStatus = item.status || 'pending'
          if (itemStatus === 'pending' || itemStatus === 'preparing') {
            count++
          }
        }
      })
    })
    return count
  }

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
    const isUrgent = order.priority === 'urgent'

    return (
      <Card key={order.id} className={`border-2 ${isUrgent ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`rounded-full w-10 h-10 flex items-center justify-center ${isUrgent ? 'bg-red-100' : 'bg-primary-100'}`}>
                <span className={`font-bold text-lg ${isUrgent ? 'text-red-600' : 'text-primary-600'}`}>{order.tableNumber}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-gray-900">{order.orderNumber || '#' + order.id.slice(-6)}</span>
                  {isUrgent && (
                    <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                      URGENTE
                    </span>
                  )}
                </div>
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
            {(order.items || []).map((item, idx) => {
              const itemStatus = item.status || 'pending'
              const isItemUpdating = updatingItemId === item.itemId

              return (
                <div key={item.itemId || idx} className="bg-gray-50 rounded-lg p-3 space-y-2 border-2 border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-lg">{item.quantity}x</span>
                        <span className="font-semibold text-gray-900">{item.name}</span>

                        {/* Badge de estado del item - Solo si itemStatusTracking está habilitado */}
                        {itemStatusTracking && (
                          <Badge className={`text-xs text-white ${
                            itemStatus === 'delivered' ? 'bg-gray-600' :
                            itemStatus === 'ready' ? 'bg-green-600' :
                            itemStatus === 'preparing' ? 'bg-blue-600' :
                            'bg-yellow-600'
                          }`}>
                            {itemStatus === 'delivered' ? 'Entregado' :
                             itemStatus === 'ready' ? 'Listo' :
                             itemStatus === 'preparing' ? 'Preparando' :
                             'Pendiente'}
                          </Badge>
                        )}
                      </div>

                      {/* Mostrar modificadores si existen - DESTACADO */}
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="mt-2 bg-black text-white rounded-lg p-2 space-y-1">
                          <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            Modificadores
                          </div>
                          {item.modifiers.map((modifier, modIdx) => (
                            <div key={modIdx} className="text-sm">
                              <span className="font-semibold">• {modifier.modifierName}:</span>
                              <div className="ml-4 text-xs">
                                {modifier.options.map((opt, optIdx) => (
                                  <div key={optIdx}>
                                    → {opt.optionName}
                                    {opt.priceAdjustment > 0 && (
                                      <span className="text-yellow-300"> (+S/ {opt.priceAdjustment.toFixed(2)})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.notes && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded w-fit">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{item.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botones de acción por item - Solo si itemStatusTracking está habilitado */}
                  {itemStatusTracking && showActions && itemStatus !== 'delivered' && (
                    <div className="flex gap-2 pt-2 border-t border-gray-300">
                      {itemStatus === 'pending' && (
                        <Button
                          onClick={() => handleItemStatusChange(order.id, item.itemId, 'preparing')}
                          disabled={isItemUpdating}
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                        >
                          {isItemUpdating ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Actualizando...</>
                          ) : (
                            <><Flame className="w-3 h-3 mr-1" />Iniciar</>
                          )}
                        </Button>
                      )}
                      {itemStatus === 'preparing' && (
                        <Button
                          onClick={() => handleItemStatusChange(order.id, item.itemId, 'ready')}
                          disabled={isItemUpdating}
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-xs"
                        >
                          {isItemUpdating ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Actualizando...</>
                          ) : (
                            <><CheckCircle className="w-3 h-3 mr-1" />Marcar Listo</>
                          )}
                        </Button>
                      )}
                      {itemStatus === 'ready' && (
                        <Button
                          onClick={() => handleItemStatusChange(order.id, item.itemId, 'delivered')}
                          disabled={isItemUpdating}
                          size="sm"
                          className="flex-1 bg-gray-600 hover:bg-gray-700 text-xs"
                        >
                          {isItemUpdating ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Actualizando...</>
                          ) : (
                            <><CheckCircle className="w-3 h-3 mr-1" />Entregado</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Actions por orden completa - Solo si itemStatusTracking está deshabilitado */}
          {!itemStatusTracking && showActions && (
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
              {/* El estado 'ready' es el final en cocina - no hay botón de Entregada aquí */}
              {/* La orden se marca como entregada/servida desde Órdenes Activas o Mesas */}
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

      {/* Tabs de Estaciones - Solo si está habilitado el modo multi-estación */}
      {enableKitchenStations && kitchenStations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedStation('all')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                selectedStation === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Todas las Estaciones
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                selectedStation === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {orders.reduce((acc, order) => acc + (order.items?.length || 0), 0)}
              </span>
            </button>

            {kitchenStations.map((station) => {
              const itemCount = countItemsForStation(station.id)
              const isSelected = selectedStation === station.id

              return (
                <button
                  key={station.id}
                  onClick={() => setSelectedStation(station.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={isSelected ? { backgroundColor: station.color } : {}}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: isSelected ? 'white' : station.color }}
                  />
                  {station.name || 'Sin nombre'}
                  {station.isPase && (
                    <span className="text-xs opacity-75">(Pase)</span>
                  )}
                  {itemCount > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isSelected ? 'bg-white/30 text-white' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {itemCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Indicador de estación seleccionada */}
          {selectedStation !== 'all' && (
            <div className="mt-2 px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-600">
              <span className="font-medium">Filtro activo:</span> Mostrando solo items de{' '}
              <span className="font-semibold" style={{ color: kitchenStations.find(s => s.id === selectedStation)?.color }}>
                {kitchenStations.find(s => s.id === selectedStation)?.name}
              </span>
              {kitchenStations.find(s => s.id === selectedStation)?.isPase && (
                <span className="ml-1">(ve todos los items para coordinar entrega)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Estadísticas - Solo en modo legacy (orden completa) */}
      {!itemStatusTracking && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-2 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-700">Pendientes</p>
                  <p className="text-3xl font-bold text-yellow-600 mt-2">{filteredPendingOrders.length}</p>
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
                  <p className="text-3xl font-bold text-blue-600 mt-2">{filteredPreparingOrders.length}</p>
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
                  <p className="text-3xl font-bold text-green-600 mt-2">{filteredReadyOrders.length}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estadística simple para modo item-tracking */}
      {itemStatusTracking && (
        <Card className="border-2 border-primary-200 bg-primary-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary-700">Órdenes Activas</p>
                <p className="text-3xl font-bold text-primary-600 mt-2">{filteredAllActiveOrders.length}</p>
                <p className="text-xs text-primary-600 mt-1">Ordenadas por tiempo de llegada</p>
              </div>
              <ChefHat className="w-12 h-12 text-primary-500" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modo Legacy: 3 Columnas por estado de orden */}
      {!itemStatusTracking && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pendientes */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-yellow-300">
              <Clock className="w-5 h-5 text-yellow-600" />
              <h2 className="text-lg font-bold text-yellow-700">
                Pendientes ({filteredPendingOrders.length})
              </h2>
            </div>
            <div className="space-y-4">
              {filteredPendingOrders.map(order => renderOrderCard(order))}
              {filteredPendingOrders.length === 0 && (
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
                En Preparación ({filteredPreparingOrders.length})
              </h2>
            </div>
            <div className="space-y-4">
              {filteredPreparingOrders.map(order => renderOrderCard(order))}
              {filteredPreparingOrders.length === 0 && (
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
                Listas ({filteredReadyOrders.length})
              </h2>
            </div>
            <div className="space-y-4">
              {filteredReadyOrders.map(order => renderOrderCard(order))}
              {filteredReadyOrders.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No hay órdenes listas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modo Item-Tracking: Una sola lista ordenada por tiempo */}
      {itemStatusTracking && (
        <div>
          <div className="flex items-center gap-2 pb-4 border-b-2 border-primary-300 mb-4">
            <ChefHat className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold text-primary-700">
              Órdenes Activas ({filteredAllActiveOrders.length})
            </h2>
            <span className="text-sm text-gray-500 ml-2">
              • Ordenadas por tiempo de llegada
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {filteredAllActiveOrders.map(order => renderOrderCard(order))}
            {filteredAllActiveOrders.length === 0 && (
              <div className="col-span-full text-center py-16 text-gray-400">
                <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No hay órdenes activas</p>
                <p className="text-sm mt-2">Las nuevas órdenes aparecerán aquí automáticamente</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

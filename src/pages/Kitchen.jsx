import { useState } from 'react'
import { ChefHat, Clock, CheckCircle, AlertTriangle, Flame } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function Kitchen() {
  // Estado temporal para demostración
  const [orders] = useState([
    {
      id: 1,
      orderNumber: 'ORD-001',
      table: 2,
      items: [
        { name: 'Lomo Saltado', quantity: 2, notes: 'Sin cebolla', priority: 'high' },
        { name: 'Chicha Morada', quantity: 2, notes: '', priority: 'normal' },
      ],
      status: 'preparing',
      startTime: '18:30',
      elapsed: '15 min',
      waiter: 'Juan Pérez',
    },
    {
      id: 2,
      orderNumber: 'ORD-003',
      table: 8,
      items: [
        { name: 'Parrilla Mixta', quantity: 1, notes: 'Término medio', priority: 'high' },
        { name: 'Papa a la Huancaína', quantity: 2, notes: '', priority: 'normal' },
      ],
      status: 'pending',
      startTime: '20:00',
      elapsed: '2 min',
      waiter: 'Carlos López',
    },
    {
      id: 3,
      orderNumber: 'ORD-004',
      table: 3,
      items: [
        { name: 'Ají de Gallina', quantity: 1, notes: 'Extra picante', priority: 'normal' },
        { name: 'Arroz con Leche', quantity: 1, notes: '', priority: 'low' },
      ],
      status: 'preparing',
      startTime: '19:45',
      elapsed: '20 min',
      waiter: 'Juan Pérez',
    },
    {
      id: 4,
      orderNumber: 'ORD-002',
      table: 5,
      items: [
        { name: 'Ceviche', quantity: 1, notes: 'Sin ají', priority: 'normal' },
      ],
      status: 'ready',
      startTime: '19:15',
      elapsed: '8 min',
      waiter: 'María García',
    },
  ])

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const preparingOrders = orders.filter(o => o.status === 'preparing')
  const readyOrders = orders.filter(o => o.status === 'ready')

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

  const renderOrderCard = (order, showActions = true) => (
    <Card key={order.id} className="border-2 border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary-100 rounded-full w-10 h-10 flex items-center justify-center">
              <span className="font-bold text-primary-600 text-lg">{order.table}</span>
            </div>
            <div>
              <div className="font-mono font-bold text-gray-900">{order.orderNumber}</div>
              <div className="text-xs text-gray-500">{order.waiter}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${getElapsedColor(order.elapsed)}`}>
              {order.elapsed}
            </div>
            <div className="text-xs text-gray-500">{order.startTime}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Items */}
        <div className="space-y-2">
          {order.items.map((item, idx) => (
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
                <Badge className={`${getPriorityColor(item.priority)} text-xs`}>
                  {getPriorityLabel(item.priority)}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 pt-2">
            {order.status === 'pending' && (
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700">
                <Flame className="w-4 h-4 mr-2" />
                Iniciar Preparación
              </Button>
            )}
            {order.status === 'preparing' && (
              <Button className="flex-1 bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Marcar como Lista
              </Button>
            )}
            {order.status === 'ready' && (
              <Button className="flex-1 bg-gray-600 hover:bg-gray-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Entregada
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )

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

      {/* Mensaje informativo */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-2">
              <ChefHat className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Kitchen Display System (KDS) en Desarrollo
              </h3>
              <p className="text-sm text-blue-800">
                Esta es una vista preliminar del sistema de display para cocina. Próximamente se agregarán:
                actualización en tiempo real, alertas sonoras, priorización automática, métricas de tiempo de preparación y más.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

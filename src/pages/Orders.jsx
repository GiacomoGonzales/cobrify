import { useState } from 'react'
import { ListOrdered, Clock, CheckCircle, XCircle, AlertCircle, Users, DollarSign } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

export default function Orders() {
  // Estado temporal para demostración
  const [orders] = useState([
    {
      id: 1,
      orderNumber: 'ORD-001',
      table: 2,
      waiter: 'Juan Pérez',
      status: 'preparing',
      items: [
        { name: 'Lomo Saltado', quantity: 2, price: 35.00 },
        { name: 'Chicha Morada', quantity: 2, price: 8.00 },
      ],
      total: 86.00,
      startTime: '18:30',
      elapsed: '15 min',
    },
    {
      id: 2,
      orderNumber: 'ORD-002',
      table: 5,
      waiter: 'María García',
      status: 'ready',
      items: [
        { name: 'Ceviche', quantity: 1, price: 42.00 },
        { name: 'Inca Kola', quantity: 1, price: 6.00 },
      ],
      total: 48.00,
      startTime: '19:15',
      elapsed: '8 min',
    },
    {
      id: 3,
      orderNumber: 'ORD-003',
      table: 8,
      waiter: 'Carlos López',
      status: 'pending',
      items: [
        { name: 'Parrilla Mixta', quantity: 1, price: 85.00 },
        { name: 'Papa a la Huancaína', quantity: 2, price: 18.00 },
        { name: 'Pisco Sour', quantity: 2, price: 25.00 },
      ],
      total: 146.00,
      startTime: '20:00',
      elapsed: '2 min',
    },
    {
      id: 4,
      orderNumber: 'ORD-004',
      table: 3,
      waiter: 'Juan Pérez',
      status: 'preparing',
      items: [
        { name: 'Ají de Gallina', quantity: 1, price: 32.00 },
        { name: 'Arroz con Leche', quantity: 1, price: 12.00 },
      ],
      total: 44.00,
      startTime: '19:45',
      elapsed: '20 min',
    },
    {
      id: 5,
      orderNumber: 'ORD-005',
      table: 1,
      waiter: 'Pedro Ramírez',
      status: 'delivered',
      items: [
        { name: 'Causa Limeña', quantity: 2, price: 22.00 },
        { name: 'Limonada', quantity: 2, price: 7.00 },
      ],
      total: 58.00,
      startTime: '18:15',
      elapsed: '45 min',
    },
  ])

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

  const activeOrders = orders.filter(o => o.status !== 'delivered')
  const totalAmount = activeOrders.reduce((sum, o) => sum + o.total, 0)

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
                <p className="text-2xl font-bold text-gray-900 mt-2">{activeOrders.length}</p>
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
                  {orders.filter(o => o.status === 'pending').length}
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
                  {orders.filter(o => o.status === 'preparing').length}
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
                <p className="text-sm font-medium text-gray-600">Monto Total</p>
                <p className="text-2xl font-bold text-green-600 mt-2">S/ {totalAmount.toFixed(2)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Órdenes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.map((order) => {
          const statusConfig = getStatusConfig(order.status)
          const StatusIcon = statusConfig.icon

          return (
            <Card key={order.id} className={`border-2 ${statusConfig.bgColor}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{order.orderNumber}</span>
                    <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <span className={`text-sm font-semibold ${statusConfig.color}`}>
                    {order.elapsed}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Info de Mesa y Mozo */}
                <div className="flex items-center justify-between text-sm pb-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-gray-700">
                      {order.table}
                    </div>
                    <span className="text-gray-600">Mesa {order.table}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Users className="w-4 h-4" />
                    <span>{order.waiter}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-medium text-gray-900">
                        S/ {(item.quantity * item.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">TOTAL</span>
                  <span className="text-lg font-bold text-gray-900">
                    S/ {order.total.toFixed(2)}
                  </span>
                </div>

                {/* Hora de inicio */}
                <div className="flex items-center gap-2 text-xs text-gray-500 pt-2">
                  <Clock className="w-3 h-3" />
                  <span>Iniciada a las {order.startTime}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Mensaje informativo */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-2">
              <ListOrdered className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Sistema de Órdenes en Desarrollo
              </h3>
              <p className="text-sm text-blue-800">
                Esta es una vista preliminar del sistema de órdenes. Próximamente se agregarán funcionalidades como:
                actualización en tiempo real, notificaciones, cambio de estado de órdenes, división de cuentas y más.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

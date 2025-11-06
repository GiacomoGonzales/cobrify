import { useState } from 'react'
import { Grid3x3, Plus, Users, Clock, CheckCircle, XCircle, DollarSign } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function Tables() {
  // Estado temporal para demostración
  const [tables] = useState([
    { id: 1, number: 1, capacity: 4, status: 'available', zone: 'Salón Principal' },
    { id: 2, number: 2, capacity: 2, status: 'occupied', zone: 'Salón Principal', waiter: 'Juan Pérez', startTime: '18:30', amount: 125.50 },
    { id: 3, number: 3, capacity: 6, status: 'available', zone: 'Salón Principal' },
    { id: 4, number: 4, capacity: 4, status: 'reserved', zone: 'Salón Principal', reservedFor: '19:00' },
    { id: 5, number: 5, capacity: 2, status: 'occupied', zone: 'Terraza', waiter: 'María García', startTime: '19:15', amount: 89.00 },
    { id: 6, number: 6, capacity: 4, status: 'available', zone: 'Terraza' },
    { id: 7, number: 7, capacity: 8, status: 'available', zone: 'Salón VIP' },
    { id: 8, number: 8, capacity: 4, status: 'occupied', zone: 'Salón VIP', waiter: 'Carlos López', startTime: '20:00', amount: 256.75 },
  ])

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 border-green-300 hover:border-green-400'
      case 'occupied':
        return 'bg-red-100 border-red-300 hover:border-red-400'
      case 'reserved':
        return 'bg-yellow-100 border-yellow-300 hover:border-yellow-400'
      default:
        return 'bg-gray-100 border-gray-300'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'occupied':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'reserved':
        return <Clock className="w-5 h-5 text-yellow-600" />
      default:
        return null
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'available':
        return 'Disponible'
      case 'occupied':
        return 'Ocupada'
      case 'reserved':
        return 'Reservada'
      default:
        return status
    }
  }

  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Grid3x3 className="w-7 h-7" />
            Gestión de Mesas
          </h1>
          <p className="text-gray-600 mt-1">Administra las mesas de tu restaurante</p>
        </div>
        <Button className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nueva Mesa
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Mesas</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
              </div>
              <Grid3x3 className="w-10 h-10 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Disponibles</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{stats.available}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ocupadas</p>
                <p className="text-2xl font-bold text-red-600 mt-2">{stats.occupied}</p>
              </div>
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Reservadas</p>
                <p className="text-2xl font-bold text-yellow-600 mt-2">{stats.reserved}</p>
              </div>
              <Clock className="w-10 h-10 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vista de Mesas por Zona */}
      <div className="space-y-6">
        {['Salón Principal', 'Terraza', 'Salón VIP'].map(zone => {
          const zoneTables = tables.filter(t => t.zone === zone)

          return (
            <Card key={zone}>
              <CardHeader>
                <CardTitle>{zone}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {zoneTables.map(table => (
                    <div
                      key={table.id}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${getStatusColor(table.status)}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-gray-900">
                            {table.number}
                          </span>
                          {getStatusIcon(table.status)}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{table.capacity}</span>
                        </div>
                      </div>

                      <Badge
                        variant={
                          table.status === 'available' ? 'success' :
                          table.status === 'occupied' ? 'danger' : 'warning'
                        }
                        className="mb-2 w-full justify-center"
                      >
                        {getStatusText(table.status)}
                      </Badge>

                      {table.status === 'occupied' && (
                        <div className="space-y-1 text-xs text-gray-700 mt-2 pt-2 border-t border-gray-300">
                          <div className="flex justify-between">
                            <span>Mozo:</span>
                            <span className="font-medium">{table.waiter}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Inicio:</span>
                            <span className="font-medium">{table.startTime}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Consumo:</span>
                            <span className="font-bold text-gray-900 flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {table.amount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {table.status === 'reserved' && (
                        <div className="text-xs text-gray-700 mt-2 pt-2 border-t border-gray-300">
                          <div className="flex justify-between">
                            <span>Reserva:</span>
                            <span className="font-medium">{table.reservedFor}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
              <Grid3x3 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Vista de Mesas en Desarrollo
              </h3>
              <p className="text-sm text-blue-800">
                Esta es una vista preliminar de la gestión de mesas. Próximamente se agregarán funcionalidades como:
                asignación de mozos, apertura de comandas, gestión de reservas, división de cuentas y más.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { Users, Plus, Edit, Trash2, UserCheck, DollarSign, Clock, TrendingUp } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'

export default function Waiters() {
  // Estado temporal para demostración
  const [waiters] = useState([
    {
      id: 1,
      name: 'Juan Pérez',
      code: 'M001',
      status: 'active',
      phone: '987654321',
      activeTables: 3,
      todaySales: 850.50,
      todayOrders: 12,
      shift: 'Mañana',
      startTime: '08:00',
    },
    {
      id: 2,
      name: 'María García',
      code: 'M002',
      status: 'active',
      phone: '987654322',
      activeTables: 2,
      todaySales: 456.75,
      todayOrders: 8,
      shift: 'Tarde',
      startTime: '14:00',
    },
    {
      id: 3,
      name: 'Carlos López',
      code: 'M003',
      status: 'active',
      phone: '987654323',
      activeTables: 4,
      todaySales: 1250.00,
      todayOrders: 15,
      shift: 'Noche',
      startTime: '18:00',
    },
    {
      id: 4,
      name: 'Ana Martínez',
      code: 'M004',
      status: 'inactive',
      phone: '987654324',
      activeTables: 0,
      todaySales: 0,
      todayOrders: 0,
      shift: 'Mañana',
      startTime: '08:00',
    },
    {
      id: 5,
      name: 'Pedro Ramírez',
      code: 'M005',
      status: 'active',
      phone: '987654325',
      activeTables: 1,
      todaySales: 325.25,
      todayOrders: 5,
      shift: 'Tarde',
      startTime: '14:00',
    },
  ])

  const activeWaiters = waiters.filter(w => w.status === 'active')
  const totalActiveTables = activeWaiters.reduce((sum, w) => sum + w.activeTables, 0)
  const totalSales = activeWaiters.reduce((sum, w) => sum + w.todaySales, 0)
  const totalOrders = activeWaiters.reduce((sum, w) => sum + w.todayOrders, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7" />
            Gestión de Mozos
          </h1>
          <p className="text-gray-600 mt-1">Administra el personal de atención al cliente</p>
        </div>
        <Button className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Mozo
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mozos Activos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{activeWaiters.length}</p>
                <p className="text-xs text-gray-500 mt-1">de {waiters.length} totales</p>
              </div>
              <UserCheck className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mesas Atendidas</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">{totalActiveTables}</p>
                <p className="text-xs text-gray-500 mt-1">en este momento</p>
              </div>
              <Clock className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas de Hoy</p>
                <p className="text-2xl font-bold text-green-600 mt-2">S/ {totalSales.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">{totalOrders} órdenes</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Promedio por Orden</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  S/ {totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-gray-500 mt-1">ticket promedio</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de Mozos */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Mozos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Mesas Activas</TableHead>
                <TableHead className="text-right">Ventas Hoy</TableHead>
                <TableHead className="text-center">Órdenes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiters.map((waiter) => (
                <TableRow key={waiter.id}>
                  <TableCell>
                    <span className="font-mono font-medium">{waiter.code}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold text-sm">
                          {waiter.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{waiter.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{waiter.phone}</TableCell>
                  <TableCell>
                    <Badge variant="default" className="flex items-center gap-1 w-fit">
                      <Clock className="w-3 h-3" />
                      {waiter.shift} ({waiter.startTime})
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {waiter.status === 'active' ? (
                      <Badge variant="success" className="flex items-center gap-1 w-fit">
                        <UserCheck className="w-3 h-3" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${waiter.activeTables > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {waiter.activeTables}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold text-gray-900">
                      S/ {waiter.todaySales.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium text-gray-700">{waiter.todayOrders}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mensaje informativo */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 rounded-full p-2">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Gestión de Mozos en Desarrollo
              </h3>
              <p className="text-sm text-blue-800">
                Esta es una vista preliminar de la gestión de mozos. Próximamente se agregarán funcionalidades como:
                asignación automática de mesas, comisiones por ventas, horarios de trabajo, historial de desempeño y más.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Users, Plus, Edit, Trash2, UserCheck, DollarSign, Clock, TrendingUp, Loader2 } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getWaiters, getWaitersStats, deleteWaiter, toggleWaiterStatus } from '@/services/waiterService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import WaiterFormModal from '@/components/restaurant/WaiterFormModal'

export default function Waiters() {
  const { getBusinessId, isDemoMode, demoData } = useAppContext()
  const toast = useToast()

  const [waiters, setWaiters] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingWaiter, setEditingWaiter] = useState(null)

  // Cargar datos de Firestore o demo
  useEffect(() => {
    loadWaiters()
  }, [isDemoMode, demoData])

  const loadWaiters = async () => {
    setIsLoading(true)
    try {
      // Si estamos en modo demo, usar datos de demo
      if (isDemoMode && demoData?.waiters) {
        setWaiters(demoData.waiters)
        // Calcular stats básicas de demo
        setStats({
          total: demoData.waiters.length,
          active: demoData.waiters.filter(w => w.status === 'active').length,
          inactive: demoData.waiters.filter(w => w.status === 'inactive').length,
        })
        setIsLoading(false)
        return
      }

      // Modo normal - usar Firestore
      const businessId = getBusinessId()
      const [waitersResult, statsResult] = await Promise.all([
        getWaiters(businessId),
        getWaitersStats(businessId),
      ])

      if (waitersResult.success) {
        setWaiters(waitersResult.data || [])
      } else {
        toast.error('Error al cargar mozos: ' + waitersResult.error)
      }

      if (statsResult.success) {
        setStats(statsResult.data)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de mozos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingWaiter(null)
    setIsFormModalOpen(true)
  }

  const handleEdit = (waiter) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingWaiter(waiter)
    setIsFormModalOpen(true)
  }

  const handleDelete = async (waiter) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (!window.confirm(`¿Eliminar al mozo ${waiter.name}?`)) return

    try {
      const result = await deleteWaiter(getBusinessId(), waiter.id)
      if (result.success) {
        toast.success('Mozo eliminado correctamente')
        loadWaiters()
      } else {
        toast.error('Error al eliminar mozo: ' + result.error)
      }
    } catch (error) {
      console.error('Error al eliminar mozo:', error)
      toast.error('Error al eliminar mozo')
    }
  }

  const handleToggleStatus = async (waiter) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    const newStatus = waiter.status !== 'active'
    try {
      const result = await toggleWaiterStatus(getBusinessId(), waiter.id, newStatus)
      if (result.success) {
        toast.success(`Mozo ${newStatus ? 'activado' : 'desactivado'} correctamente`)
        loadWaiters()
      } else {
        toast.error('Error al cambiar estado: ' + result.error)
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      toast.error('Error al cambiar estado del mozo')
    }
  }

  const handleFormSuccess = () => {
    setIsFormModalOpen(false)
    setEditingWaiter(null)
    loadWaiters()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando mozos...</p>
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
            <Users className="w-7 h-7" />
            Gestión de Mozos
          </h1>
          <p className="text-gray-600 mt-1">Administra el personal de atención al cliente</p>
        </div>
        <Button onClick={handleCreate} className="flex items-center gap-2">
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
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats?.active || 0}</p>
                <p className="text-xs text-gray-500 mt-1">de {stats?.total || 0} totales</p>
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
                <p className="text-2xl font-bold text-blue-600 mt-2">{stats?.totalActiveTables || 0}</p>
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
                <p className="text-2xl font-bold text-green-600 mt-2">
                  S/ {(stats?.totalSalesToday || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stats?.totalOrdersToday || 0} órdenes</p>
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
                  S/ {(stats?.averageTicket || 0).toFixed(2)}
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
              {waiters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">No hay mozos registrados</p>
                    <p className="text-sm text-gray-500 mt-1">Crea tu primer mozo para comenzar</p>
                  </TableCell>
                </TableRow>
              ) : (
                waiters.map((waiter) => (
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
                    <TableCell className="text-gray-600">{waiter.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="default" className="flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" />
                        {waiter.shift} ({waiter.startTime})
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleStatus(waiter)}
                        className="cursor-pointer"
                      >
                        {waiter.status === 'active' ? (
                          <Badge variant="success" className="flex items-center gap-1 w-fit hover:opacity-80">
                            <UserCheck className="w-3 h-3" />
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit hover:opacity-80">
                            Inactivo
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${waiter.activeTables > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {waiter.activeTables || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-gray-900">
                        S/ {(waiter.todaySales || 0).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium text-gray-700">{waiter.todayOrders || 0}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(waiter)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(waiter)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de crear/editar mozo */}
      <WaiterFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setEditingWaiter(null)
        }}
        waiter={editingWaiter}
        onSuccess={handleFormSuccess}
      />
    </div>
  )
}

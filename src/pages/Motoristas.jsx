import { useState, useEffect } from 'react'
import {
  Bike, Plus, Edit, Trash2, UserCheck, DollarSign, TrendingUp,
  Loader2, Search, Package, Clock, CheckCircle, XCircle, Filter,
  CircleDot, Coffee, WifiOff,
} from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import {
  getMotoristas, getMotoristasStats, deleteMotorista, toggleMotoristaStatus,
  updateOperationalStatus, getDeliveries, getActiveMotoristas,
  getUnsettledDeliveriesForMotorista, settleDeliveries,
} from '@/services/motoristaService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import MotoristaFormModal from '@/components/restaurant/MotoristaFormModal'

const OPERATIONAL_STATUS_CONFIG = {
  available: { label: 'Disponible', color: 'success', icon: CheckCircle },
  on_delivery: { label: 'En entrega', color: 'info', icon: Package },
  break: { label: 'Descanso', color: 'warning', icon: Coffee },
  offline: { label: 'Desconectado', color: 'secondary', icon: WifiOff },
}

const VEHICLE_LABELS = {
  moto: 'Moto',
  auto: 'Auto',
  bicicleta: 'Bicicleta',
  pie: 'A pie',
}

const DELIVERY_STATUS_LABELS = {
  assigned: 'Asignado',
  in_transit: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  yape: 'Yape',
  plin: 'Plin',
}

export default function Motoristas() {
  const { getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('motoristas')
  const [motoristas, setMotoristas] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingMotorista, setEditingMotorista] = useState(null)

  // Tab Envíos
  const [deliveries, setDeliveries] = useState([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [deliveryFilters, setDeliveryFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    motoristaId: '',
    status: '',
    paymentMethod: '',
  })

  // Tab Arqueo
  const [arqueoMotoristaId, setArqueoMotoristaId] = useState('')
  const [arqueoDate, setArqueoDate] = useState(new Date().toISOString().split('T')[0])
  const [unsettledDeliveries, setUnsettledDeliveries] = useState([])
  const [arqueoLoading, setArqueoLoading] = useState(false)
  const [actualAmount, setActualAmount] = useState('')
  const [settlingLoading, setSettlingLoading] = useState(false)

  useEffect(() => {
    loadMotoristas()
  }, [isDemoMode])

  const loadMotoristas = async () => {
    setIsLoading(true)
    try {
      const businessId = getBusinessId()
      const [motoristasResult, statsResult] = await Promise.all([
        getMotoristas(businessId),
        getMotoristasStats(businessId),
      ])

      if (motoristasResult.success) {
        setMotoristas(motoristasResult.data || [])
      } else {
        toast.error('Error al cargar motoristas: ' + motoristasResult.error)
      }

      if (statsResult.success) {
        setStats(statsResult.data)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de motoristas')
    } finally {
      setIsLoading(false)
    }
  }

  // ========================
  // Tab Motoristas handlers
  // ========================
  const handleCreate = () => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    setEditingMotorista(null)
    setIsFormModalOpen(true)
  }

  const handleEdit = (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    setEditingMotorista(m)
    setIsFormModalOpen(true)
  }

  const handleDelete = async (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    if (!window.confirm(`¿Eliminar al motorista ${m.name}?`)) return
    try {
      const result = await deleteMotorista(getBusinessId(), m.id)
      if (result.success) {
        toast.success('Motorista eliminado')
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al eliminar motorista')
    }
  }

  const handleToggleStatus = async (m) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    const newStatus = m.status !== 'active'
    try {
      const result = await toggleMotoristaStatus(getBusinessId(), m.id, newStatus)
      if (result.success) {
        toast.success(`Motorista ${newStatus ? 'activado' : 'desactivado'}`)
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cambiar estado')
    }
  }

  const handleChangeOperationalStatus = async (m, newStatus) => {
    if (isDemoMode) { toast.info('No disponible en demo'); return }
    try {
      const result = await updateOperationalStatus(getBusinessId(), m.id, newStatus)
      if (result.success) {
        toast.success(`Estado cambiado a ${OPERATIONAL_STATUS_CONFIG[newStatus]?.label}`)
        loadMotoristas()
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cambiar estado operacional')
    }
  }

  const handleFormSuccess = () => {
    setIsFormModalOpen(false)
    setEditingMotorista(null)
    loadMotoristas()
  }

  // ========================
  // Tab Envíos handlers
  // ========================
  const loadDeliveries = async () => {
    setDeliveriesLoading(true)
    try {
      const result = await getDeliveries(getBusinessId(), deliveryFilters)
      if (result.success) {
        setDeliveries(result.data || [])
      } else {
        toast.error('Error al cargar envíos: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cargar envíos')
    } finally {
      setDeliveriesLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'envios') {
      loadDeliveries()
    }
  }, [activeTab])

  // ========================
  // Tab Arqueo handlers
  // ========================
  const handleConsultArqueo = async () => {
    if (!arqueoMotoristaId) {
      toast.error('Selecciona un motorista')
      return
    }
    setArqueoLoading(true)
    try {
      const result = await getUnsettledDeliveriesForMotorista(
        getBusinessId(), arqueoMotoristaId, arqueoDate
      )
      if (result.success) {
        setUnsettledDeliveries(result.data || [])
        setActualAmount('')
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al consultar arqueo')
    } finally {
      setArqueoLoading(false)
    }
  }

  const expectedTotal = unsettledDeliveries.reduce((sum, d) => sum + (d.cashCollected || d.amount || 0), 0)

  const handleSettleDeliveries = async () => {
    if (unsettledDeliveries.length === 0) return
    if (!actualAmount && actualAmount !== 0) {
      toast.error('Ingresa el monto real entregado')
      return
    }

    setSettlingLoading(true)
    try {
      const ids = unsettledDeliveries.map(d => d.id)
      const result = await settleDeliveries(getBusinessId(), ids, actualAmount)
      if (result.success) {
        const diff = parseFloat(actualAmount) - expectedTotal
        toast.success(
          `Arqueo cerrado. ${diff === 0 ? 'Cuadra perfecto.' : diff > 0 ? `Sobrante: S/ ${diff.toFixed(2)}` : `Faltante: S/ ${Math.abs(diff).toFixed(2)}`}`
        )
        setUnsettledDeliveries([])
        setActualAmount('')
      } else {
        toast.error('Error: ' + result.error)
      }
    } catch (error) {
      toast.error('Error al cerrar arqueo')
    } finally {
      setSettlingLoading(false)
    }
  }

  // ========================
  // Render
  // ========================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando motoristas...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'motoristas', label: 'Motoristas' },
    { id: 'envios', label: 'Envíos' },
    { id: 'arqueo', label: 'Arqueo' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bike className="w-7 h-7" />
            Motoristas
          </h1>
          <p className="text-gray-600 mt-1">Gestión de repartidores, envíos y arqueo de caja</p>
        </div>
        {activeTab === 'motoristas' && (
          <Button onClick={handleCreate} className="flex items-center gap-2 w-full md:w-auto">
            <Plus className="w-4 h-4" />
            Nuevo Motorista
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'motoristas' && (
        <TabMotoristas
          motoristas={motoristas}
          stats={stats}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          onChangeOperationalStatus={handleChangeOperationalStatus}
        />
      )}

      {activeTab === 'envios' && (
        <TabEnvios
          deliveries={deliveries}
          loading={deliveriesLoading}
          filters={deliveryFilters}
          setFilters={setDeliveryFilters}
          motoristas={motoristas}
          onSearch={loadDeliveries}
        />
      )}

      {activeTab === 'arqueo' && (
        <TabArqueo
          motoristas={motoristas.filter(m => m.status === 'active')}
          motoristaId={arqueoMotoristaId}
          setMotoristaId={setArqueoMotoristaId}
          date={arqueoDate}
          setDate={setArqueoDate}
          unsettledDeliveries={unsettledDeliveries}
          loading={arqueoLoading}
          onConsult={handleConsultArqueo}
          expectedTotal={expectedTotal}
          actualAmount={actualAmount}
          setActualAmount={setActualAmount}
          onSettle={handleSettleDeliveries}
          settlingLoading={settlingLoading}
        />
      )}

      {/* Modal */}
      <MotoristaFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingMotorista(null) }}
        motorista={editingMotorista}
        onSuccess={handleFormSuccess}
      />
    </div>
  )
}

// ============================================================
// Tab 1: Motoristas (CRUD)
// ============================================================
function TabMotoristas({ motoristas, stats, onEdit, onDelete, onToggleStatus, onChangeOperationalStatus }) {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos</p>
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
                <p className="text-sm font-medium text-gray-600">Entregas Hoy</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">{stats?.todayDeliveries || 0}</p>
                <p className="text-xs text-gray-500 mt-1">envíos realizados</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Efectivo Cobrado</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  S/ {(stats?.todayCashCollected || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">hoy en efectivo</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ganancia Promedio</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  S/ {(stats?.averageEarning || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">por entrega</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Motoristas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden md:table-cell">Vehículo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Operacional</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motoristas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Bike className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">No hay motoristas registrados</p>
                      <p className="text-sm text-gray-500 mt-1">Crea tu primer motorista para comenzar</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  motoristas.map((m) => {
                    const opConfig = OPERATIONAL_STATUS_CONFIG[m.operationalStatus] || OPERATIONAL_STATUS_CONFIG.offline
                    const OpIcon = opConfig.icon
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <span className="font-mono font-medium">{m.code}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold text-sm">
                                {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </span>
                            </div>
                            <span className="font-medium">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-gray-600">{m.phone || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="default" className="w-fit">
                            {VEHICLE_LABELS[m.vehicleType] || m.vehicleType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button onClick={() => onToggleStatus(m)} className="cursor-pointer">
                            {m.status === 'active' ? (
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
                        <TableCell>
                          <select
                            value={m.operationalStatus || 'offline'}
                            onChange={(e) => onChangeOperationalStatus(m, e.target.value)}
                            className="text-sm px-2 py-1 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {Object.entries(OPERATIONAL_STATUS_CONFIG).map(([key, cfg]) => (
                              <option key={key} value={key}>{cfg.label}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(m)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => onDelete(m)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ============================================================
// Tab 2: Envíos (Historial)
// ============================================================
function TabEnvios({ deliveries, loading, filters, setFilters, motoristas, onSearch }) {
  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  return (
    <>
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <Input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <Input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motorista</label>
              <Select name="motoristaId" value={filters.motoristaId} onChange={handleFilterChange}>
                <option value="">Todos</option>
                {motoristas.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <Select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">Todos</option>
                <option value="assigned">Asignado</option>
                <option value="in_transit">En camino</option>
                <option value="delivered">Entregado</option>
                <option value="cancelled">Cancelado</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={onSearch} className="w-full flex items-center justify-center gap-2">
                <Search className="w-4 h-4" />
                Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Envíos ({deliveries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Orden #</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Método Pago</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No se encontraron envíos</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm text-gray-600">
                          {d.createdAt?.toDate
                            ? d.createdAt.toDate().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
                            : '-'}
                        </TableCell>
                        <TableCell className="font-mono">{d.orderNumber || '-'}</TableCell>
                        <TableCell className="font-medium">{d.motoristaName || '-'}</TableCell>
                        <TableCell>{d.customerName || '-'}</TableCell>
                        <TableCell className="text-right font-semibold">
                          S/ {(d.amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="w-fit">
                            {PAYMENT_METHOD_LABELS[d.paymentMethod] || d.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              d.status === 'delivered' ? 'success'
                              : d.status === 'cancelled' ? 'destructive'
                              : d.status === 'in_transit' ? 'info'
                              : 'warning'
                            }
                            className="w-fit"
                          >
                            {DELIVERY_STATUS_LABELS[d.status] || d.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ============================================================
// Tab 3: Arqueo (Liquidación de caja)
// ============================================================
function TabArqueo({
  motoristas, motoristaId, setMotoristaId, date, setDate,
  unsettledDeliveries, loading, onConsult,
  expectedTotal, actualAmount, setActualAmount,
  onSettle, settlingLoading,
}) {
  const diff = actualAmount !== '' ? parseFloat(actualAmount) - expectedTotal : null

  return (
    <>
      {/* Consulta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Arqueo de Caja - Motorista
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motorista</label>
              <Select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
                <option value="">Seleccionar motorista</option>
                {motoristas.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={onConsult} disabled={loading} className="w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultados del arqueo */}
      {unsettledDeliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entregas en Efectivo sin Liquidar ({unsettledDeliveries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden #</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Monto Cobrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unsettledDeliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono">{d.orderNumber || '-'}</TableCell>
                      <TableCell>{d.customerName || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">
                        S/ {(d.cashCollected || d.amount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Resumen y cierre */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Total Esperado:</p>
                  <p className="text-2xl font-bold text-gray-900">S/ {expectedTotal.toFixed(2)}</p>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto Real Entregado (S/)</label>
                  <Input
                    type="number"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                {diff !== null && (
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Diferencia:</p>
                    <p className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {diff === 0 ? 'Cuadra' : diff > 0 ? `+S/ ${diff.toFixed(2)}` : `-S/ ${Math.abs(diff).toFixed(2)}`}
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={onSettle}
                disabled={settlingLoading || actualAmount === ''}
                className="w-full md:w-auto flex items-center justify-center gap-2"
              >
                {settlingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Cerrar Arqueo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensaje cuando no hay entregas */}
      {unsettledDeliveries.length === 0 && !loading && motoristaId && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No hay entregas pendientes de liquidar</p>
            <p className="text-sm text-gray-500 mt-1">Este motorista tiene todo al día para la fecha seleccionada</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}

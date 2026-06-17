import { useState, useEffect, useMemo } from 'react'
import {
  Users, Plus, Edit, Trash2, UserCheck, DollarSign, Clock, TrendingUp, Loader2,
  Search, FileSpreadsheet, Trophy, X, Receipt, ChevronRight,
} from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getWaiters, deleteWaiter, toggleWaiterStatus } from '@/services/waiterService'
import { getActiveBranches } from '@/services/branchService'
import { getOrdersInRange } from '@/services/orderService'
import { generateWaitersExcel } from '@/services/waiterExportService'
import { formatCurrency } from '@/lib/utils'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useLocationAccess } from '@/utils/locationAccess'
import WaiterFormModal from '@/components/restaurant/WaiterFormModal'

// ---- Periodos ----
const PERIOD_LABELS = { today: 'Hoy', yesterday: 'Ayer', week: 'Últimos 7 días', month: 'Este mes', custom: 'Personalizado' }
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
const getPeriodRange = (key, cs, ce) => {
  const now = new Date()
  if (key === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)] }
  if (key === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); return [startOfDay(s), endOfDay(now)] }
  if (key === 'month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return [startOfDay(s), endOfDay(now)] }
  if (key === 'custom' && cs && ce) return [startOfDay(new Date(cs)), endOfDay(new Date(ce))]
  return [startOfDay(now), endOfDay(now)]
}

// ---- Clasificación de órdenes ----
const isCancelled = (o) => o.overallStatus === 'cancelled' || o.status === 'cancelled'
const isClosed = (o) => !isCancelled(o) && (o.paid === true || o.status === 'closed' || o.overallStatus === 'completed')
const isInProgress = (o) => !isCancelled(o) && !isClosed(o)

const fmtDateTime = (d) => {
  if (!d) return '-'
  const date = d?.toDate ? d.toDate() : new Date(d)
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Waiters() {
  const { getBusinessId, isDemoMode, demoData, filterBranchesByAccess, allowedBranches, businessSettings } = useAppContext()
  const toast = useToast()
  const canAccess = useLocationAccess()

  const [waiters, setWaiters] = useState([])
  const [branches, setBranches] = useState([])
  const [periodOrders, setPeriodOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingWaiter, setEditingWaiter] = useState(null)
  const [detailWaiter, setDetailWaiter] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Filtros
  const [period, setPeriod] = useState('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [search, setSearch] = useState('')

  const branchNameById = useMemo(() => branches.reduce((acc, b) => { acc[b.id] = b.name; return acc }, {}), [branches])
  const mainBranchName = businessSettings?.mainBranchName || 'Sucursal Principal'
  const branchNameOf = (w) => (w.branchId ? (branchNameById[w.branchId] || w.branchId) : mainBranchName)

  const visibleWaiters = useMemo(() => waiters.filter(canAccess), [waiters, canAccess])

  // ---- Carga de mozos + sedes ----
  useEffect(() => {
    loadWaiters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, demoData, allowedBranches])

  const loadWaiters = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode && demoData?.waiters) {
        setWaiters(demoData.waiters)
        setBranches([])
        setIsLoading(false)
        return
      }
      const businessId = getBusinessId()
      const [waitersResult, branchesResult] = await Promise.all([
        getWaiters(businessId),
        getActiveBranches(businessId),
      ])
      if (waitersResult.success) setWaiters(waitersResult.data || [])
      else toast.error('Error al cargar mozos: ' + waitersResult.error)
      if (branchesResult.success) {
        const list = filterBranchesByAccess ? filterBranchesByAccess(branchesResult.data || []) : (branchesResult.data || [])
        setBranches(list)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de mozos')
    } finally {
      setIsLoading(false)
    }
  }

  // ---- Carga de órdenes del periodo ----
  useEffect(() => {
    loadPeriodOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customStart, customEnd, isDemoMode, demoData])

  const loadPeriodOrders = async () => {
    // Demo: usar las órdenes del demo si existen (no hay backend).
    if (isDemoMode) {
      setPeriodOrders(demoData?.orders || [])
      return
    }
    if (period === 'custom' && (!customStart || !customEnd)) return
    setLoadingOrders(true)
    try {
      const [start, end] = getPeriodRange(period, customStart, customEnd)
      const res = await getOrdersInRange(getBusinessId(), start, end)
      setPeriodOrders(res.success ? (res.data || []) : [])
      if (!res.success) toast.error('No se pudieron cargar las órdenes del periodo')
    } catch (e) {
      console.error('Error al cargar órdenes del periodo:', e)
      setPeriodOrders([])
    } finally {
      setLoadingOrders(false)
    }
  }

  // ---- Agregación de desempeño por mozo ----
  const perfByWaiter = useMemo(() => {
    const map = {}
    for (const o of periodOrders) {
      const wid = o.waiterId
      if (!wid) continue
      if (!map[wid]) map[wid] = { sales: 0, orders: 0, inProgress: 0, ticket: 0 }
      if (isClosed(o)) { map[wid].sales += (o.total || 0); map[wid].orders += 1 }
      else if (isInProgress(o)) { map[wid].inProgress += 1 }
    }
    for (const k of Object.keys(map)) map[k].ticket = map[k].orders > 0 ? map[k].sales / map[k].orders : 0
    return map
  }, [periodOrders])

  // Órdenes sin mozo asignado (cerradas) — para nota informativa
  const unassignedClosed = useMemo(
    () => periodOrders.filter(o => !o.waiterId && isClosed(o)).length,
    [periodOrders],
  )

  // Mozos con métricas + sede; demo cae a los campos guardados si no hay órdenes
  const waitersWithPerf = useMemo(() => {
    return visibleWaiters.map(w => {
      const live = perfByWaiter[w.id]
      const perf = live || (isDemoMode
        ? { sales: w.todaySales || 0, orders: w.todayOrders || 0, inProgress: w.activeTables || 0, ticket: w.averageTicket || ((w.todayOrders > 0) ? (w.todaySales / w.todayOrders) : 0) }
        : { sales: 0, orders: 0, inProgress: 0, ticket: 0 })
      return { ...w, perf, branchName: branchNameOf(w) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleWaiters, perfByWaiter, isDemoMode, branchNameById])

  // Filtro de búsqueda + orden por ventas desc (ranking)
  const rankedWaiters = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? waitersWithPerf.filter(w => (w.name || '').toLowerCase().includes(q) || (w.code || '').toLowerCase().includes(q))
      : waitersWithPerf
    return [...filtered].sort((a, b) => (b.perf.sales - a.perf.sales) || (b.perf.orders - a.perf.orders))
  }, [waitersWithPerf, search])

  // Estadísticas del periodo (sobre los mozos visibles)
  const stats = useMemo(() => {
    const active = waitersWithPerf.filter(w => w.status === 'active')
    const totalSales = waitersWithPerf.reduce((s, w) => s + w.perf.sales, 0)
    const totalOrders = waitersWithPerf.reduce((s, w) => s + w.perf.orders, 0)
    const inProgress = waitersWithPerf.reduce((s, w) => s + w.perf.inProgress, 0)
    return {
      total: visibleWaiters.length,
      active: active.length,
      inactive: visibleWaiters.length - active.length,
      inProgress,
      totalSales,
      totalOrders,
      averageTicket: totalOrders > 0 ? totalSales / totalOrders : 0,
    }
  }, [waitersWithPerf, visibleWaiters])

  // ---- Handlers CRUD (sin cambios funcionales) ----
  const handleCreate = () => {
    if (isDemoMode) return toast.info('Esta función no está disponible en modo demo')
    setEditingWaiter(null); setIsFormModalOpen(true)
  }
  const handleEdit = (waiter) => {
    if (isDemoMode) return toast.info('Esta función no está disponible en modo demo')
    setEditingWaiter(waiter); setIsFormModalOpen(true)
  }
  const handleDelete = async (waiter) => {
    if (isDemoMode) return toast.info('Esta función no está disponible en modo demo')
    if (!window.confirm(`¿Eliminar al mozo ${waiter.name}?`)) return
    try {
      const result = await deleteWaiter(getBusinessId(), waiter.id)
      if (result.success) { toast.success('Mozo eliminado correctamente'); loadWaiters() }
      else toast.error('Error al eliminar mozo: ' + result.error)
    } catch (error) {
      console.error('Error al eliminar mozo:', error); toast.error('Error al eliminar mozo')
    }
  }
  const handleToggleStatus = async (waiter) => {
    if (isDemoMode) return toast.info('Esta función no está disponible en modo demo')
    const newStatus = waiter.status !== 'active'
    try {
      const result = await toggleWaiterStatus(getBusinessId(), waiter.id, newStatus)
      if (result.success) { toast.success(`Mozo ${newStatus ? 'activado' : 'desactivado'} correctamente`); loadWaiters() }
      else toast.error('Error al cambiar estado: ' + result.error)
    } catch (error) {
      console.error('Error al cambiar estado:', error); toast.error('Error al cambiar estado del mozo')
    }
  }
  const handleFormSuccess = () => { setIsFormModalOpen(false); setEditingWaiter(null); loadWaiters() }

  const handleExport = async () => {
    if (rankedWaiters.length === 0) return toast.info('No hay mozos para exportar')
    setExporting(true)
    try {
      await generateWaitersExcel(rankedWaiters, periodOrders, businessSettings, PERIOD_LABELS[period])
      toast.success('Excel generado')
    } catch (e) {
      console.error('Error al exportar mozos:', e); toast.error('No se pudo generar el Excel')
    } finally {
      setExporting(false)
    }
  }

  // Órdenes del mozo del detalle (dentro del periodo)
  const detailData = useMemo(() => {
    if (!detailWaiter) return null
    const orders = periodOrders
      .filter(o => o.waiterId === detailWaiter.id)
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
        const dbb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
        return dbb - da
      })
    const prodMap = {}
    orders.filter(isClosed).forEach(o => (o.items || []).forEach(it => {
      const name = it.name || it.description
      if (!name) return
      prodMap[name] = (prodMap[name] || 0) + (it.quantity || 1)
    }))
    const topProducts = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { orders, topProducts }
  }, [detailWaiter, periodOrders])

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

  const orderStateBadge = (o) => {
    if (isCancelled(o)) return <Badge variant="secondary">Cancelada</Badge>
    if (isClosed(o)) return <Badge variant="success">Cerrada</Badge>
    return <Badge variant="warning">En curso</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7" />
            Gestión de Mozos
          </h1>
          <p className="text-gray-600 mt-1">Desempeño y administración del personal de atención</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {!isDemoMode && (
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="flex items-center gap-2 flex-1 md:flex-initial">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exportar
            </Button>
          )}
          <Button onClick={handleCreate} className="flex items-center gap-2 flex-1 md:flex-initial">
            <Plus className="w-4 h-4" />
            Nuevo Mozo
          </Button>
        </div>
      </div>

      {/* Filtro de periodo + búsqueda */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    period === key ? 'bg-primary-600 text-white border-primary-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                <span className="text-gray-400">→</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
            )}
            <div className="lg:ml-auto relative w-full lg:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar mozo…"
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas del periodo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Mozos Activos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stats.active}</p>
                <p className="text-xs text-gray-500 mt-1">de {stats.total} totales</p>
              </div>
              <UserCheck className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Órdenes en curso</p>
                <p className="text-2xl font-bold text-blue-600 mt-2">{stats.inProgress}</p>
                <p className="text-xs text-gray-500 mt-1">sin cerrar</p>
              </div>
              <Clock className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas ({PERIOD_LABELS[period]})</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {loadingOrders ? '…' : formatCurrency(stats.totalSales)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stats.totalOrders} órdenes cerradas</p>
              </div>
              <DollarSign className="w-10 h-10 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ticket Promedio</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">{formatCurrency(stats.averageTicket)}</p>
                <p className="text-xs text-gray-500 mt-1">por orden cerrada</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {unassignedClosed > 0 && (
        <p className="text-xs text-gray-500 -mt-2">
          Nota: {unassignedClosed} orden(es) cerrada(s) del periodo no tienen mozo asignado (no se suman a ningún mozo).
        </p>
      )}

      {/* Lista de mozos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Mozos · {PERIOD_LABELS[period]}</span>
            {loadingOrders && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rankedWaiters.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">{search ? 'Sin resultados' : 'No hay mozos registrados'}</p>
              <p className="text-sm text-gray-500 mt-1">{search ? 'Prueba con otro nombre' : 'Crea tu primer mozo para comenzar'}</p>
            </div>
          ) : (
            <>
              {/* ===== Vista MÓVIL: tarjetas ===== */}
              <div className="lg:hidden space-y-3">
                {rankedWaiters.map((w, idx) => (
                  <div
                    key={w.id}
                    onClick={() => setDetailWaiter(w)}
                    className="rounded-xl border border-gray-200 p-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold text-sm">{(w.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                        </div>
                        {idx === 0 && w.perf.sales > 0 && (
                          <Trophy className="w-4 h-4 text-amber-500 absolute -top-1 -right-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">{w.name}</span>
                          {w.status === 'active'
                            ? <Badge variant="success" className="text-[10px]">Activo</Badge>
                            : <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                        </div>
                        <div className="text-xs text-gray-500">{w.code} · {branches.length > 0 ? w.branchName : w.shift}</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div>
                        <div className="text-sm font-bold text-green-600">{formatCurrency(w.perf.sales)}</div>
                        <div className="text-[10px] text-gray-500">ventas</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{w.perf.orders}</div>
                        <div className="text-[10px] text-gray-500">órdenes</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-blue-600">{w.perf.inProgress}</div>
                        <div className="text-[10px] text-gray-500">en curso</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ===== Vista DESKTOP: tabla ===== */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Mozo</TableHead>
                      <TableHead>Código</TableHead>
                      {branches.length > 0 && <TableHead>Sede</TableHead>}
                      <TableHead>Turno</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-center">En curso</TableHead>
                      <TableHead className="text-center">Órdenes</TableHead>
                      <TableHead className="text-right">Ventas ({PERIOD_LABELS[period]})</TableHead>
                      <TableHead className="text-right">Ticket</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedWaiters.map((w, idx) => (
                      <TableRow key={w.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailWaiter(w)}>
                        <TableCell>
                          {idx === 0 && w.perf.sales > 0
                            ? <Trophy className="w-5 h-5 text-amber-500" />
                            : <span className="text-gray-400 font-medium">{idx + 1}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                              <span className="text-primary-600 font-semibold text-sm">{(w.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                            </div>
                            <span className="font-medium">{w.name}</span>
                          </div>
                        </TableCell>
                        <TableCell><span className="font-mono font-medium">{w.code}</span></TableCell>
                        {branches.length > 0 && <TableCell className="text-gray-600">{w.branchName}</TableCell>}
                        <TableCell>
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />{w.shift} ({w.startTime})
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(w) }}>
                            {w.status === 'active'
                              ? <Badge variant="success" className="flex items-center gap-1 w-fit hover:opacity-80"><UserCheck className="w-3 h-3" />Activo</Badge>
                              : <Badge variant="secondary" className="flex items-center gap-1 w-fit hover:opacity-80">Inactivo</Badge>}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${w.perf.inProgress > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{w.perf.inProgress}</span>
                        </TableCell>
                        <TableCell className="text-center"><span className="font-medium text-gray-700">{w.perf.orders}</span></TableCell>
                        <TableCell className="text-right"><span className="font-semibold text-green-700">{formatCurrency(w.perf.sales)}</span></TableCell>
                        <TableCell className="text-right text-gray-600">{formatCurrency(w.perf.ticket)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(w)}><Edit className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(w)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalle / historial */}
      <Modal isOpen={!!detailWaiter} onClose={() => setDetailWaiter(null)} title={detailWaiter ? `${detailWaiter.name}` : ''} size="2xl">
        {detailWaiter && detailData && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-mono">{detailWaiter.code}</span>
              {branches.length > 0 && <><span>·</span><span>{detailWaiter.branchName}</span></>}
              <span>·</span><span>{detailWaiter.shift}</span>
              <span>·</span><span>{PERIOD_LABELS[period]}</span>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-xs text-gray-600">Ventas</div>
                <div className="text-lg font-bold text-green-700">{formatCurrency(detailWaiter.perf.sales)}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-600">Órdenes</div>
                <div className="text-lg font-bold text-gray-900">{detailWaiter.perf.orders}</div>
              </div>
              <div className="rounded-lg bg-purple-50 p-3">
                <div className="text-xs text-gray-600">Ticket prom.</div>
                <div className="text-lg font-bold text-purple-700">{formatCurrency(detailWaiter.perf.ticket)}</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <div className="text-xs text-gray-600">En curso</div>
                <div className="text-lg font-bold text-blue-700">{detailWaiter.perf.inProgress}</div>
              </div>
            </div>

            {/* Top productos */}
            {detailData.topProducts.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Productos que más vendió</h4>
                <div className="flex flex-wrap gap-2">
                  {detailData.topProducts.map(([name, qty]) => (
                    <span key={name} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {name} <span className="font-semibold">×{qty}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Historial de órdenes */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Receipt className="w-4 h-4" /> Órdenes ({detailData.orders.length})
              </h4>
              {detailData.orders.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Sin órdenes en este periodo.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {detailData.orders.map(o => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          Orden #{o.orderNumber || o.id?.slice(0, 6)}
                          {o.tableNumber ? <span className="text-gray-500 font-normal"> · Mesa {o.tableNumber}</span> : ''}
                        </div>
                        <div className="text-xs text-gray-500">{fmtDateTime(o.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {orderStateBadge(o)}
                        <span className="text-sm font-semibold text-gray-900 w-20 text-right">{formatCurrency(o.total || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              {!isDemoMode && (
                <Button variant="outline" onClick={() => { const w = detailWaiter; setDetailWaiter(null); handleEdit(w) }}>
                  <Edit className="w-4 h-4 mr-2" /> Editar mozo
                </Button>
              )}
              <Button onClick={() => setDetailWaiter(null)}>
                <X className="w-4 h-4 mr-2" /> Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de crear/editar mozo */}
      <WaiterFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingWaiter(null) }}
        waiter={editingWaiter}
        onSuccess={handleFormSuccess}
      />
    </div>
  )
}

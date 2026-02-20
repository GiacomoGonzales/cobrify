import { useState, useEffect, useMemo } from 'react'
import { Users, Plus, Edit, Trash2, UserCheck, DollarSign, ShoppingCart, TrendingUp, Loader2, Store, Search, Eye, MoreVertical, Target, Calendar } from 'lucide-react'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { getSellers, deleteSeller, toggleSellerStatus } from '@/services/sellerService'
import { getInvoices } from '@/services/firestoreService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import SellerFormModal from '@/components/SellerFormModal'
import { formatCurrency, formatDate } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import { getActiveBranches } from '@/services/branchService'

// Datos de ejemplo para modo demo
const DEMO_SELLERS = [
  {
    id: 'demo-seller-1',
    code: 'V001',
    name: 'Carlos Mendoza',
    dni: '45678912',
    phone: '987654321',
    email: 'carlos.mendoza@email.com',
    status: 'active',
    todaySales: 2450.00,
    todayOrders: 8,
    totalSales: 45670.50,
  },
  {
    id: 'demo-seller-2',
    code: 'V002',
    name: 'María García',
    dni: '78945612',
    phone: '976543210',
    email: 'maria.garcia@email.com',
    status: 'active',
    todaySales: 3180.00,
    todayOrders: 12,
    totalSales: 68920.00,
  },
  {
    id: 'demo-seller-3',
    code: 'V003',
    name: 'José Rodríguez',
    dni: '32165498',
    phone: '965432109',
    email: 'jose.rodriguez@email.com',
    status: 'active',
    todaySales: 1890.50,
    todayOrders: 6,
    totalSales: 32450.75,
  },
  {
    id: 'demo-seller-4',
    code: 'V004',
    name: 'Ana Torres',
    dni: '65432178',
    phone: '954321098',
    email: 'ana.torres@email.com',
    status: 'inactive',
    todaySales: 0,
    todayOrders: 0,
    totalSales: 15680.00,
  },
]


export default function Sellers() {
  const { getBusinessId, isDemoMode, filterBranchesByAccess, user } = useAppContext()
  const toast = useToast()

  const [sellers, setSellers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState(null)
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewingSeller, setViewingSeller] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState('all')

  // Cargar datos de Firestore
  useEffect(() => {
    loadSellers()
    loadBranches()
  }, [])

  // Cargar sucursales para filtro
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const result = await getActiveBranches(getBusinessId())
      if (result.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || [])
        setBranches(branchList)
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  // Helper para aplicar preset de fecha
  const applyDatePreset = (preset) => {
    setDatePreset(preset)
    const today = new Date()
    const fmt = (d) => d.toISOString().split('T')[0]

    if (preset === 'today') {
      setDateFrom(fmt(today))
      setDateTo(fmt(today))
    } else if (preset === 'week') {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      setDateFrom(fmt(weekStart))
      setDateTo(fmt(today))
    } else if (preset === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      setDateFrom(fmt(monthStart))
      setDateTo(fmt(today))
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  // Facturas válidas (excluye anuladas/convertidas)
  const validInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      if (invoice.status === 'cancelled' || invoice.status === 'voided') return false
      if (invoice.sunatStatus === 'voiding' || invoice.sunatStatus === 'voided') return false
      if (invoice.convertedTo) return false
      if (!invoice.sellerId) return false
      return true
    })
  }, [invoices])

  // Facturas filtradas por rango de fecha
  const dateFilteredInvoices = useMemo(() => {
    if (!dateFrom && !dateTo) return validInvoices

    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null

    return validInvoices.filter(invoice => {
      const invoiceDate = invoice.createdAt?.toDate
        ? invoice.createdAt.toDate()
        : new Date(invoice.createdAt || 0)
      if (from && invoiceDate < from) return false
      if (to && invoiceDate > to) return false
      return true
    })
  }, [validInvoices, dateFrom, dateTo])

  // Calcular estadísticas de vendedores desde facturas filtradas
  const sellerInvoiceStats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const statsMap = {}

    dateFilteredInvoices.forEach(invoice => {
      const sellerId = invoice.sellerId
      const total = invoice.total || 0
      const invoiceDate = invoice.createdAt?.toDate
        ? invoice.createdAt.toDate()
        : new Date(invoice.createdAt || 0)

      if (!statsMap[sellerId]) {
        statsMap[sellerId] = { filteredSales: 0, filteredOrders: 0, todaySales: 0, todayOrders: 0, weekSales: 0, monthSales: 0 }
      }

      statsMap[sellerId].filteredSales += total
      statsMap[sellerId].filteredOrders += 1

      if (invoiceDate >= today) {
        statsMap[sellerId].todaySales += total
        statsMap[sellerId].todayOrders += 1
      }
      if (invoiceDate >= weekStart) {
        statsMap[sellerId].weekSales += total
      }
      if (invoiceDate >= monthStart) {
        statsMap[sellerId].monthSales += total
      }
    })

    return statsMap
  }, [dateFilteredInvoices])

  // Enriquecer vendedores con stats calculadas desde facturas (en demo usar datos de ejemplo)
  const sellersWithStats = useMemo(() => {
    if (isDemoMode) return sellers
    return sellers.map(seller => ({
      ...seller,
      todaySales: sellerInvoiceStats[seller.id]?.todaySales ?? 0,
      todayOrders: sellerInvoiceStats[seller.id]?.todayOrders ?? 0,
      weekSales: sellerInvoiceStats[seller.id]?.weekSales ?? 0,
      monthSales: sellerInvoiceStats[seller.id]?.monthSales ?? 0,
      filteredSales: sellerInvoiceStats[seller.id]?.filteredSales ?? 0,
      filteredOrders: sellerInvoiceStats[seller.id]?.filteredOrders ?? 0,
    }))
  }, [sellers, sellerInvoiceStats, isDemoMode])

  // Facturas del vendedor seleccionado (para el modal), respeta filtro de fechas
  const sellerInvoices = useMemo(() => {
    if (!viewingSeller) return []
    return dateFilteredInvoices
      .filter(inv => inv.sellerId === viewingSeller.id)
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        return dateB - dateA
      })
  }, [dateFilteredInvoices, viewingSeller])

  // Stats globales calculadas desde facturas filtradas
  const hasDateFilter = dateFrom || dateTo
  const stats = useMemo(() => {
    const activeSellers = sellersWithStats.filter(s => s.status === 'active')
    return {
      total: sellersWithStats.length,
      active: activeSellers.length,
      filteredSales: sellersWithStats.reduce((sum, s) => sum + s.filteredSales, 0),
      filteredOrders: sellersWithStats.reduce((sum, s) => sum + s.filteredOrders, 0),
      todaySales: sellersWithStats.reduce((sum, s) => sum + s.todaySales, 0),
      todayOrders: sellersWithStats.reduce((sum, s) => sum + s.todayOrders, 0),
    }
  }, [sellersWithStats])

  // Filtrar vendedores
  const filteredSellers = sellersWithStats.filter(seller => {
    // Filtrar por búsqueda
    const search = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      seller.name?.toLowerCase().includes(search) ||
      seller.code?.toLowerCase().includes(search) ||
      seller.dni?.includes(search) ||
      seller.email?.toLowerCase().includes(search)

    // Filtrar por sucursal
    let matchesBranch = true
    if (filterBranch !== 'all') {
      if (filterBranch === 'main') {
        matchesBranch = !seller.branchId
      } else {
        matchesBranch = seller.branchId === filterBranch
      }
    }

    return matchesSearch && matchesBranch
  })

  const loadSellers = async () => {
    setIsLoading(true)
    try {
      if (isDemoMode) {
        // Usar datos de ejemplo en modo demo
        setSellers(DEMO_SELLERS)
        setInvoices([])
        setIsLoading(false)
        return
      }

      const businessId = getBusinessId()
      const [sellersResult, invoicesResult] = await Promise.all([
        getSellers(businessId),
        getInvoices(businessId),
      ])

      if (sellersResult.success) {
        setSellers(sellersResult.data || [])
      } else {
        toast.error('Error al cargar vendedores: ' + sellersResult.error)
      }

      if (invoicesResult.success) {
        setInvoices(invoicesResult.data || [])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar datos de vendedores')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingSeller(null)
    setIsFormModalOpen(true)
  }

  const handleEdit = (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    setEditingSeller(seller)
    setIsFormModalOpen(true)
  }

  const handleDelete = async (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }
    if (!window.confirm(`¿Eliminar al vendedor ${seller.name}?`)) return

    try {
      const result = await deleteSeller(getBusinessId(), seller.id)
      if (result.success) {
        toast.success('Vendedor eliminado correctamente')
        loadSellers()
      } else {
        toast.error('Error al eliminar vendedor: ' + result.error)
      }
    } catch (error) {
      console.error('Error al eliminar vendedor:', error)
      toast.error('Error al eliminar vendedor')
    }
  }

  const handleToggleStatus = async (seller) => {
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo')
      return
    }

    try {
      const result = await toggleSellerStatus(getBusinessId(), seller.id, seller.status)
      if (result.success) {
        toast.success(`Vendedor ${result.newStatus === 'active' ? 'activado' : 'desactivado'}`)
        loadSellers()
      } else {
        toast.error('Error al cambiar estado: ' + result.error)
      }
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      toast.error('Error al cambiar estado del vendedor')
    }
  }

  const handleFormSuccess = () => {
    setIsFormModalOpen(false)
    setEditingSeller(null)
    loadSellers()
  }

  const GOAL_LABELS = { daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' }

  const getGoalSales = (seller) => {
    const period = seller.goalPeriod || 'daily'
    if (period === 'weekly') return seller.weekSales || 0
    if (period === 'monthly') return seller.monthSales || 0
    return seller.todaySales || 0
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Vendedores</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestiona tu equipo de vendedores y sus métricas de ventas
          </p>
        </div>
        <Button onClick={handleCreate} className="w-full lg:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Vendedor
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">Total Vendedores</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
                </div>
                <div className="p-3 bg-primary-100 rounded-lg flex-shrink-0">
                  <Users className="w-6 h-6 text-primary-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">
                    {hasDateFilter ? 'Ventas (Período)' : 'Ventas de Hoy'}
                  </p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {formatCurrency(hasDateFilter ? stats.filteredSales : stats.todaySales)}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">
                    {hasDateFilter ? 'Órdenes (Período)' : 'Órdenes de Hoy'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {hasDateFilter ? stats.filteredOrders : stats.todayOrders}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">
                    {hasDateFilter ? 'Total (Período)' : 'Ventas Totales'}
                  </p>
                  <p className="text-xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.filteredSales)}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nombre, código, DNI..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
            {/* Filtro de Sucursal */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Store className="w-4 h-4 text-gray-500" />
                <select
                  value={filterBranch}
                  onChange={e => setFilterBranch(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las sucursales</option>
                  <option value="main">Sucursal Principal</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Filtro de fechas */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-600">Período:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'Todo' },
                { key: 'today', label: 'Hoy' },
                { key: 'week', label: 'Esta Semana' },
                { key: 'month', label: 'Este Mes' },
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => applyDatePreset(p.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    datePreset === p.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setDatePreset('custom') }}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-auto"
              />
              <span className="text-gray-400 text-xs">a</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setDatePreset('custom') }}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-auto"
              />
              {hasDateFilter && (
                <button
                  onClick={() => applyDatePreset('all')}
                  className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sellers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSellers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm || filterBranch !== 'all' ? 'No se encontraron vendedores' : 'No hay vendedores registrados'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterBranch !== 'all' ? 'Intenta con otros filtros de búsqueda' : 'Comienza agregando tu primer vendedor'}
              </p>
              {!searchTerm && filterBranch === 'all' && (
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Vendedor
                </Button>
              )}
            </div>
          ) : (
            <>
            {/* Vista de tarjetas para móvil */}
            <div className="lg:hidden divide-y divide-gray-100">
              {filteredSellers.map((seller) => (
                <div key={seller.id} className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setViewingSeller(seller)}>
                  {/* Fila 1: Código + nombre + acciones */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-primary-600 text-sm">{seller.code}</span>
                      <span className="text-sm font-medium text-gray-900 truncate">{seller.name}</span>
                    </div>
                    <div className="flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const openUpward = rect.bottom > window.innerHeight - 200
                          setMenuPosition({
                            top: openUpward ? rect.top : rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                            openUpward
                          })
                          setOpenMenuId(openMenuId === seller.id ? null : seller.id)
                        }}
                        className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        title="Acciones"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: DNI + contacto + sucursal */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {seller.dni && <span>DNI: {seller.dni}</span>}
                    {seller.phone && <span>{seller.phone}</span>}
                    {branches.length > 0 && (
                      <span className="text-blue-600 flex items-center gap-0.5">
                        <Store className="w-3 h-3" />
                        {seller.branchId
                          ? branches.find(b => b.id === seller.branchId)?.name || 'Sucursal'
                          : 'Principal'}
                      </span>
                    )}
                  </div>

                  {/* Fila 3: Ventas + órdenes + estado */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span>{hasDateFilter ? 'Ventas' : 'Hoy'}: <span className="font-semibold text-sm text-gray-900">{formatCurrency(hasDateFilter ? seller.filteredSales : seller.todaySales)}</span></span>
                      <span>{hasDateFilter ? seller.filteredOrders : seller.todayOrders} órd.</span>
                    </div>
                    <Badge variant={seller.status === 'active' ? 'success' : 'secondary'}>
                      {seller.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>

                  {/* Barra de progreso meta */}
                  {(seller.salesGoal || seller.dailyGoal) > 0 && (() => {
                    const goal = seller.salesGoal || seller.dailyGoal
                    const current = getGoalSales(seller)
                    const pct = Math.min((current / goal) * 100, 100)
                    const reached = pct >= 100
                    const label = GOAL_LABELS[seller.goalPeriod] || 'Diaria'
                    return (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-500 flex items-center gap-1"><Target className="w-3 h-3" />Meta {label}: {formatCurrency(goal)}</span>
                          <span className={reached ? 'font-semibold text-green-600' : 'text-gray-500'}>{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${reached ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>

            {/* Tabla para desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>{hasDateFilter ? 'Ventas (Período)' : 'Ventas Hoy'}</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>{hasDateFilter ? 'Total (Período)' : 'Total Ventas'}</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{seller.name}</p>
                          {seller.dni && (
                            <p className="text-sm text-gray-500">DNI: {seller.dni}</p>
                          )}
                          {branches.length > 0 && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              <Store className="w-3 h-3 inline mr-1" />
                              {seller.branchId
                                ? branches.find(b => b.id === seller.branchId)?.name || 'Sucursal'
                                : 'Sucursal Principal'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {seller.phone && <p>{seller.phone}</p>}
                          {seller.email && <p className="text-gray-500">{seller.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={seller.status === 'active' ? 'success' : 'secondary'}>
                          {seller.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span>{formatCurrency(hasDateFilter ? seller.filteredSales : seller.todaySales)}</span>
                          <span className="text-xs text-gray-400 ml-1">({hasDateFilter ? seller.filteredOrders : seller.todayOrders} órd.)</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(seller.salesGoal || seller.dailyGoal) > 0 ? (() => {
                          const goal = seller.salesGoal || seller.dailyGoal
                          const current = getGoalSales(seller)
                          const pct = Math.min((current / goal) * 100, 100)
                          const reached = pct >= 100
                          const label = GOAL_LABELS[seller.goalPeriod] || 'Diaria'
                          return (
                            <div className="min-w-[120px]">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-500">{label}</span>
                                <span className={reached ? 'font-semibold text-green-600' : 'text-gray-500'}>{pct.toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${reached ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{formatCurrency(current)} / {formatCurrency(goal)}</div>
                            </div>
                          )
                        })() : (
                          <span className="text-xs text-gray-400">Sin meta</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(seller.filteredSales || 0)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const openUpward = rect.bottom > window.innerHeight - 200
                              setMenuPosition({
                                top: openUpward ? rect.top : rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                                openUpward
                              })
                              setOpenMenuId(openMenuId === seller.id ? null : seller.id)
                            }}
                            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Menú de acciones flotante */}
            {openMenuId && (() => {
              const menuSeller = filteredSellers.find(s => s.id === openMenuId)
              if (!menuSeller) return null
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div
                    className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                      transform: menuPosition.openUpward ? 'translateY(-100%)' : 'translateY(0)',
                    }}
                  >
                    <button
                      onClick={() => { setViewingSeller(menuSeller); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4 text-primary-600" />
                      Ver ventas
                    </button>
                    <button
                      onClick={() => { handleEdit(menuSeller); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                      Editar
                    </button>
                    <button
                      onClick={() => { handleToggleStatus(menuSeller); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <UserCheck className="w-4 h-4 text-amber-600" />
                      {menuSeller.status === 'active' ? 'Desactivar' : 'Activar'}
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={() => { handleDelete(menuSeller); setOpenMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </button>
                  </div>
                </>
              )
            })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <SellerFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setEditingSeller(null)
        }}
        seller={editingSeller}
        onSuccess={handleFormSuccess}
      />

      {/* Seller Sales Modal */}
      <Modal
        isOpen={!!viewingSeller}
        onClose={() => setViewingSeller(null)}
        title="Ventas del Vendedor"
        size="xl"
      >
        {viewingSeller && (() => {
          const sellerStats = sellerInvoiceStats[viewingSeller.id] || { todaySales: 0, todayOrders: 0, totalSales: 0, totalOrders: 0 }
          const getDocTypeName = (type) => {
            const names = { boleta: 'Boleta', factura: 'Factura', nota_venta: 'Nota de Venta', nota_credito: 'N. Crédito', nota_debito: 'N. Débito' }
            return names[type] || type || '-'
          }
          return (
            <div className="space-y-5">
              {/* Header gradient */}
              <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{viewingSeller.name}</p>
                    <p className="text-primary-100 text-sm mt-1">Código: {viewingSeller.code}</p>
                  </div>
                  <Badge variant={viewingSeller.status === 'active' ? 'success' : 'secondary'} className="self-start">
                    {viewingSeller.status === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase">Ventas Hoy</p>
                  <p className="font-bold text-green-700 mt-1">{formatCurrency(sellerStats.todaySales)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase">Órdenes Hoy</p>
                  <p className="font-bold text-blue-700 mt-1">{sellerStats.todayOrders}</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase">Total Ventas</p>
                  <p className="font-bold text-purple-700 mt-1">{formatCurrency(sellerStats.totalSales)}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 uppercase">Total Órdenes</p>
                  <p className="font-bold text-gray-700 mt-1">{sellerStats.totalOrders}</p>
                </div>
              </div>

              {/* Barra de progreso meta */}
              {(viewingSeller.salesGoal || viewingSeller.dailyGoal) > 0 && (() => {
                const goal = viewingSeller.salesGoal || viewingSeller.dailyGoal
                const period = viewingSeller.goalPeriod || 'daily'
                const current = period === 'weekly' ? sellerStats.weekSales
                  : period === 'monthly' ? sellerStats.monthSales
                  : sellerStats.todaySales
                const pct = Math.min((current / goal) * 100, 100)
                const reached = pct >= 100
                const remaining = Math.max(goal - current, 0)
                const label = GOAL_LABELS[period] || 'Diaria'
                return (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-primary-600" />
                        Meta {label}: {formatCurrency(goal)}
                      </span>
                      <span className={`text-sm font-bold ${reached ? 'text-green-600' : 'text-gray-700'}`}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${reached ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{formatCurrency(current)} de {formatCurrency(goal)}</span>
                      <span>{reached ? 'Meta alcanzada' : `Faltan ${formatCurrency(remaining)}`}</span>
                    </div>
                  </div>
                )
              })()}

              {/* Sales list */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-gray-400" />
                    <h4 className="font-semibold text-gray-700">Ventas ({sellerInvoices.length})</h4>
                  </div>
                </div>

                {sellerInvoices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No hay ventas registradas</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: cards */}
                    <div className="lg:hidden divide-y divide-gray-100 max-h-80 overflow-y-auto">
                      {sellerInvoices.map(inv => {
                        const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0)
                        return (
                          <div key={inv.id} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-gray-900">{inv.number || '-'}</span>
                              <span className="font-semibold text-sm text-primary-600">{formatCurrency(inv.total || 0)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              <span>{formatDate(date)}</span>
                              <span className="text-gray-300">|</span>
                              <span>{getDocTypeName(inv.documentType)}</span>
                              {inv.customer?.name && (
                                <>
                                  <span className="text-gray-300">|</span>
                                  <span className="truncate">{inv.customer.name}</span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden lg:block max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Número</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sellerInvoices.map(inv => {
                            const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0)
                            return (
                              <TableRow key={inv.id}>
                                <TableCell className="font-medium">{inv.number || '-'}</TableCell>
                                <TableCell className="text-sm text-gray-500">{formatDate(date)}</TableCell>
                                <TableCell className="text-sm">{inv.customer?.name || inv.customer?.businessName || 'Cliente General'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{getDocTypeName(inv.documentType)}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(inv.total || 0)}</TableCell>
                                <TableCell>
                                  <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'secondary'}>
                                    {inv.status === 'paid' ? 'Pagada' : inv.status === 'pending' ? 'Pendiente' : inv.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

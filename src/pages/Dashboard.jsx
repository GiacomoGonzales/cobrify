import { useState, useEffect } from 'react'
import {
  FileText,
  Users,
  Package,
  DollarSign,
  Plus,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Store,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import SalesChart from '@/components/charts/SalesChart'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getRecentInvoices, getCustomers, getProducts } from '@/services/firestoreService'
import { useBranding } from '@/contexts/BrandingContext'
import { getActiveBranches } from '@/services/branchService'
import { getTablesStats } from '@/services/tableService'
import HotelDashboard from '@/components/hotel/HotelDashboard'

export default function Dashboard() {
  const { user, isDemoMode, demoData, getBusinessId, isAdmin, isBusinessOwner, filterBranchesByAccess, businessMode, hasMainBranchAccess } = useAppContext()
  const { branding } = useBranding()
  const location = useLocation()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hideDashboardData, setHideDashboardData] = useState(false)
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [showAmounts, setShowAmounts] = useState(() => localStorage.getItem('dashboard_show_amounts') === 'true')
  const [openTablesAmount, setOpenTablesAmount] = useState(0) // Suma de mesas ocupadas (modo restaurante)

  const toggleShowAmounts = () => {
    const newValue = !showAmounts
    setShowAmounts(newValue)
    localStorage.setItem('dashboard_show_amounts', newValue.toString())
  }

  // Determinar el prefijo de ruta según el contexto
  const getRoutePrefix = () => {
    if (isDemoMode) {
      if (location.pathname.startsWith('/demorestaurant')) return '/demorestaurant'
      if (location.pathname.startsWith('/demopharmacy')) return '/demopharmacy'
      if (location.pathname.startsWith('/demohotel')) return '/demohotel'
      if (location.pathname.startsWith('/demoveterinary')) return '/demoveterinary'
      return '/demo'
    }
    return '/app'
  }

  const routePrefix = getRoutePrefix()

  useEffect(() => {
    loadDashboardData()
    loadBranches()
  }, [user, isDemoMode])

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

  // Helper: Obtener medianoche de hoy en hora Perú (UTC-5)
  const getStartOfTodayPeru = () => {
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) // 'YYYY-MM-DD'
    return new Date(peruDate + 'T00:00:00-05:00')
  }

  // Helper: Obtener inicio del mes actual en hora Perú
  const getStartOfMonthPeru = () => {
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [year, month] = peruDate.split('-')
    return new Date(`${year}-${month}-01T00:00:00-05:00`)
  }

  // Helper: Obtener inicio del día N días atrás en hora Perú
  const getDaysAgo = days => {
    const today = getStartOfTodayPeru()
    return new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
  }

  const loadDashboardData = async () => {
    if (isDemoMode && demoData) {
      // Load demo data
      setInvoices(demoData.invoices || [])
      setCustomers(demoData.customers || [])
      setProducts(demoData.products || [])
      // Calcular monto de mesas abiertas en modo demo restaurante
      if (businessMode === 'restaurant' && Array.isArray(demoData.tables)) {
        const openAmount = demoData.tables
          .filter(t => t.status === 'occupied')
          .reduce((sum, t) => sum + (t.amount || 0), 0)
        setOpenTablesAmount(openAmount)
      } else {
        setOpenTablesAmount(0)
      }
      setIsLoading(false)
      return
    }

    if (!user?.uid) return

    const businessId = getBusinessId()
    setIsLoading(true)
    try {
      // Load business settings to check privacy options
      const businessRef = doc(db, 'businesses', businessId)
      const businessDoc = await getDoc(businessRef)
      const businessData = businessDoc.exists() ? businessDoc.data() : {}

      // Check if we should hide dashboard data from secondary users
      const shouldHideData = businessData.hideDashboardDataFromSecondary && !isAdmin && !isBusinessOwner
      setHideDashboardData(shouldHideData)

      // If we need to hide data, don't load anything
      if (shouldHideData) {
        setInvoices([])
        setCustomers([])
        setProducts([])
        setIsLoading(false)
        return
      }

      // Cargar facturas desde el inicio del mes o 14 días atrás (lo que sea más antiguo)
      // Se necesitan 14 días para el gráfico comparativo y desde inicio del mes para "Ventas del Mes"
      const fourteenDaysAgo = getDaysAgo(14)
      const monthStart = getStartOfMonthPeru()
      const sinceDate = monthStart < fourteenDaysAgo ? monthStart : fourteenDaysAgo

      const [invoicesResult, customersResult, productsResult] = await Promise.all([
        getRecentInvoices(businessId, sinceDate),
        getCustomers(businessId),
        getProducts(businessId),
      ])

      if (invoicesResult.success) {
        setInvoices(invoicesResult.data || [])
      }
      if (customersResult.success) {
        setCustomers(customersResult.data || [])
      }
      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      // Cargar monto de mesas abiertas (solo en modo restaurante)
      if (businessMode === 'restaurant') {
        const tablesStatsResult = await getTablesStats(businessId)
        if (tablesStatsResult.success) {
          setOpenTablesAmount(tablesStatsResult.data.totalAmount || 0)
        } else {
          setOpenTablesAmount(0)
        }
      } else {
        setOpenTablesAmount(0)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper to get date from invoice - usa fecha de emisión si existe, sino createdAt
  const getInvoiceDate = (inv) => {
    if (inv?.emissionDate) {
      if (inv.emissionDate.toDate) return inv.emissionDate.toDate()
      if (typeof inv.emissionDate === 'string') {
        const createdAt = inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
        if (createdAt) {
          const [year, month, day] = inv.emissionDate.split('-').map(Number)
          const combined = new Date(createdAt)
          combined.setFullYear(year, month - 1, day)
          return combined
        }
        return new Date(inv.emissionDate + 'T12:00:00')
      }
      return new Date(inv.emissionDate)
    }
    if (!inv?.createdAt) return null
    return inv.createdAt.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt)
  }

  // Filtrar por sucursal primero
  const branchFilteredInvoices = filterBranch === 'all'
    ? invoices
    : filterBranch === 'main'
      ? invoices.filter(inv => !inv.branchId)
      : invoices.filter(inv => inv.branchId === filterBranch)

  // Filtrar facturas válidas para cálculos de ventas:
  // - Excluir notas de crédito y débito (no son ventas, son ajustes)
  // - Excluir notas de venta ya convertidas a boleta/factura (para no duplicar ingresos)
  // - Excluir documentos anulados (notas de venta, boletas, facturas)
  const validInvoicesForSales = branchFilteredInvoices.filter(inv => {
    // Excluir notas de crédito y débito (no son ventas)
    if (inv.documentType === 'nota_credito' || inv.documentType === 'nota_debito') {
      return false
    }
    // Si es una nota de venta que ya fue convertida a boleta/factura, no contar
    // (se cuenta la boleta/factura resultante en su lugar)
    if (inv.documentType === 'nota_venta' && inv.convertedTo) {
      return false
    }
    // Si el documento está anulado o pendiente de anulación por NC, no contar
    if (inv.status === 'cancelled' || inv.status === 'voided' ||
        inv.status === 'pending_cancellation' || inv.status === 'partial_refund_pending') {
      return false
    }
    // Si está en proceso de anulación SUNAT (voiding), tampoco contar
    if (inv.sunatStatus === 'voiding' || inv.sunatStatus === 'voided') {
      return false
    }
    return true
  })

  // Calcular ventas del día
  const todaysSales = validInvoicesForSales
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      return invDate >= getStartOfTodayPeru()
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Calcular ventas del mes
  const monthSales = validInvoicesForSales
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      return invDate >= getStartOfMonthPeru()
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Facturas pendientes
  const pendingInvoices = branchFilteredInvoices.filter(inv => inv.status === 'pending')

  // Productos con stock bajo (< 4)
  const lowStockProducts = products.filter(p => {
    if (p.hasVariants && p.variants?.length > 0) {
      const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
      return totalStock < 4
    }
    return p.stock !== null && p.stock < 4
  })

  // Datos de ventas de los últimos 7 días con comparativa de semana anterior
  const salesData = []
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  for (let i = 6; i >= 0; i--) {
    const dayStart = getDaysAgo(i)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

    // Semana anterior (mismo día, 7 días antes)
    const prevDayStart = getDaysAgo(i + 7)
    const prevDayEnd = new Date(prevDayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

    const daySales = validInvoicesForSales
      .filter(inv => {
        const invDate = getInvoiceDate(inv)
        if (!invDate) return false
        return invDate >= dayStart && invDate <= dayEnd
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0)

    const prevDaySales = validInvoicesForSales
      .filter(inv => {
        const invDate = getInvoiceDate(inv)
        if (!invDate) return false
        return invDate >= prevDayStart && invDate <= prevDayEnd
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0)

    salesData.push({
      name: dayNames[dayStart.getDay()],
      ventas: daySales,
      ventasAnterior: prevDaySales,
    })
  }

  // Calcular cambio del día anterior
  const yesterdaySales = validInvoicesForSales
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      const yesterday = getDaysAgo(1)
      const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      return invDate >= yesterday && invDate <= yesterdayEnd
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  const todayChange = yesterdaySales > 0
    ? ((todaysSales - yesterdaySales) / yesterdaySales * 100).toFixed(1)
    : todaysSales > 0 ? '+100.0' : '0.0'

  // Formatear fecha corta en zona Perú (ej: "30 mar")
  const formatShortDate = (date) => {
    return date.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' })
  }

  const todayLabel = formatShortDate(new Date())
  const monthStartDate = getStartOfMonthPeru()
  const monthRangeLabel = `${formatShortDate(monthStartDate)} - ${todayLabel}`

  // Estadísticas
  const hiddenAmount = 'S/ ****'
  const isRestaurantMode = businessMode === 'restaurant'
  const projectedDayTotal = todaysSales + openTablesAmount
  const stats = [
    {
      title: 'Ventas del Día',
      subtitle: todayLabel,
      value: showAmounts ? formatCurrency(todaysSales) : hiddenAmount,
      icon: DollarSign,
      change: todaysSales > yesterdaySales ? `+${todayChange}%` : `${todayChange}%`,
      changeType: todaysSales >= yesterdaySales ? 'positive' : 'negative',
      isSalesAmount: true,
      // En modo restaurante, mostrar desglose Cerrado / Abierto / Total proyectado
      restaurantBreakdown: isRestaurantMode ? {
        closed: showAmounts ? formatCurrency(todaysSales) : hiddenAmount,
        open: showAmounts ? formatCurrency(openTablesAmount) : hiddenAmount,
        projected: showAmounts ? formatCurrency(projectedDayTotal) : hiddenAmount,
      } : null,
    },
    {
      title: 'Ventas del Mes',
      subtitle: monthRangeLabel,
      value: showAmounts ? formatCurrency(monthSales) : hiddenAmount,
      icon: TrendingUp,
      change: `${validInvoicesForSales.filter(inv => {
        const invDate = getInvoiceDate(inv)
        if (!invDate) return false
        return invDate >= getStartOfMonthPeru()
      }).length} comprobantes`,
      changeType: 'positive',
      isSalesAmount: true,
    },
    {
      title: 'Facturas Pendientes',
      value: pendingInvoices.length,
      icon: FileText,
      change: pendingInvoices.length > 0 ? 'Requiere atención' : 'Todo al día',
      changeType: pendingInvoices.length > 0 ? 'warning' : 'positive',
    },
    {
      title: 'Stock Bajo',
      value: lowStockProducts.length,
      icon: AlertTriangle,
      change: lowStockProducts.length > 0 ? 'Revisar inventario' : 'Stock adecuado',
      changeType: lowStockProducts.length > 0 ? 'danger' : 'positive',
    },
  ]

  // Últimas 5 facturas
  const recentInvoices = [...invoices]
    .sort((a, b) => {
      const dateA = getInvoiceDate(a)
      const dateB = getInvoiceDate(b)
      if (!dateA || !dateB) return 0
      return dateB - dateA
    })
    .slice(0, 5)

  const getStatusBadge = status => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Pagada</Badge>
      case 'pending':
        return <Badge variant="warning">Pendiente</Badge>
      case 'overdue':
        return <Badge variant="danger">Vencida</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  // Modo hotel: mostrar dashboard hotelero
  if (businessMode === 'hotel') {
    return <HotelDashboard getBusinessId={getBusinessId} getRoutePrefix={getRoutePrefix} isDemoMode={isDemoMode} />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Bienvenido{branding?.companyName ? ` a ${branding.companyName}` : ''} - Resumen de tu negocio
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Selector de Sucursal */}
          {branches.length > 0 && (
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
              <Store className="w-4 h-4 text-gray-500" />
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="all">Todas las sucursales</option>
                {hasMainBranchAccess && <option value="main">Sucursal Principal</option>}
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}
          <Link to={`${routePrefix}/pos`} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Package className="w-4 h-4 mr-2" />
              Punto de Venta
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">{stat.title}</p>
                    {stat.isSalesAmount && (
                      <button
                        onClick={toggleShowAmounts}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                      >
                        {showAmounts ? (
                          <Eye className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                        )}
                      </button>
                    )}
                  </div>
                  {stat.subtitle && (
                    <p className="text-xs text-primary-600 mt-0.5">{stat.subtitle}</p>
                  )}
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  {stat.restaurantBreakdown ? (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Cerrado</span>
                        <span className="font-medium text-gray-700">{stat.restaurantBreakdown.closed}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Abierto (mesas)</span>
                        <span className="font-medium text-amber-600">{stat.restaurantBreakdown.open}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
                        <span className="text-gray-600 font-medium">Total proyectado</span>
                        <span className="font-bold text-primary-600">{stat.restaurantBreakdown.projected}</span>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={`text-xs sm:text-sm mt-2 ${
                        stat.changeType === 'positive'
                          ? 'text-green-600'
                          : stat.changeType === 'warning'
                          ? 'text-yellow-600'
                          : stat.changeType === 'negative'
                          ? 'text-gray-600'
                          : 'text-red-600'
                      }`}
                    >
                      {stat.change}
                    </p>
                  )}
                </div>
                <div
                  className={`p-2 sm:p-3 rounded-lg ${
                    stat.changeType === 'danger'
                      ? 'bg-red-100'
                      : stat.changeType === 'warning'
                      ? 'bg-yellow-100'
                      : 'bg-primary-100'
                  }`}
                >
                  <stat.icon
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${
                      stat.changeType === 'danger'
                        ? 'text-red-600'
                        : stat.changeType === 'warning'
                        ? 'text-yellow-600'
                        : 'text-primary-600'
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and Quick Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Ventas de los Últimos 7 Días</CardTitle>
            </CardHeader>
            <CardContent>
              <SalesChart data={salesData} />
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 text-primary-600" />
                <span className="text-3xl font-bold text-gray-900">{customers.length}</span>
              </div>
              <p className="text-sm text-gray-600">Total Clientes</p>
              <Link to={`${routePrefix}/clientes`} className="text-xs text-primary-600 hover:underline mt-1 inline-block">
                Ver clientes →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Package className="w-8 h-8 text-primary-600" />
                <span className="text-3xl font-bold text-gray-900">{products.length}</span>
              </div>
              <p className="text-sm text-gray-600">Productos Activos</p>
              <Link to={`${routePrefix}/productos`} className="text-xs text-primary-600 hover:underline mt-1 inline-block">
                Ver productos →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Alert variant="warning" title="Productos con Stock Bajo">
          <div className="space-y-2 mt-2">
            {lowStockProducts.slice(0, 5).map((product, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-sm"
              >
                <span className="font-medium text-sm">{product.name}</span>
                <span className="text-red-600 font-semibold text-xs sm:text-sm">
                  Stock: {product.hasVariants ? product.variants?.reduce((s, v) => s + (v.stock || 0), 0) : product.stock}
                  {(product.hasVariants ? product.variants?.reduce((s, v) => s + (v.stock || 0), 0) === 0 : product.stock === 0) && ' - ¡Agotado!'}
                </span>
              </div>
            ))}
            {lowStockProducts.length > 5 && (
              <p className="text-xs text-gray-600 mt-2">
                +{lowStockProducts.length - 5} productos más con stock bajo
              </p>
            )}
          </div>
          <Link to={`${routePrefix}/productos`} className="inline-block mt-3">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              Ver Inventario
            </Button>
          </Link>
        </Alert>
      )}

      {/* Recent Invoices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Facturas Recientes</CardTitle>
            <Link to={`${routePrefix}/facturas`}>
              <Button variant="ghost" size="sm">
                Ver todas
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No hay facturas registradas</p>
              <Link to={`${routePrefix}/pos`}>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primera Venta
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map(invoice => (
                <div
                  key={invoice.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer space-y-3 sm:space-y-0"
                >
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="p-2 bg-primary-100 rounded-lg flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">
                        {invoice.number}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 truncate">
                        {invoice.customer?.name || 'Sin cliente'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:space-x-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-gray-900 text-sm sm:text-base">
                        {formatCurrency(invoice.total)}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600">
                        {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : 'N/A'}
                      </p>
                    </div>
                    <div className="flex-shrink-0">{getStatusBadge(invoice.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

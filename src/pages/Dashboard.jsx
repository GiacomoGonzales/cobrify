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
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import SalesChart from '@/components/charts/SalesChart'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getCustomers, getProducts } from '@/services/firestoreService'

export default function Dashboard() {
  const { user, isDemoMode, demoData, getBusinessId } = useAppContext()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [user, isDemoMode])

  const loadDashboardData = async () => {
    if (isDemoMode && demoData) {
      // Load demo data
      setInvoices(demoData.invoices || [])
      setCustomers(demoData.customers || [])
      setProducts(demoData.products || [])
      setIsLoading(false)
      return
    }

    if (!user?.uid) return

    const businessId = getBusinessId()
    setIsLoading(true)
    try {
      const [invoicesResult, customersResult, productsResult] = await Promise.all([
        getInvoices(businessId),
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
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper: Get start of today
  const getStartOfToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }

  // Helper: Get start of month
  const getStartOfMonth = () => {
    const date = new Date()
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
    return date
  }

  // Helper: Get date N days ago
  const getDaysAgo = days => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    date.setHours(0, 0, 0, 0)
    return date
  }

  // Helper to get date from invoice (handles both Firestore timestamp and regular Date)
  const getInvoiceDate = (inv) => {
    if (!inv.createdAt) return null
    return inv.createdAt.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt)
  }

  // Calcular ventas del día
  const todaysSales = invoices
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      return invDate >= getStartOfToday()
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Calcular ventas del mes
  const monthSales = invoices
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      return invDate >= getStartOfMonth()
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Facturas pendientes
  const pendingInvoices = invoices.filter(inv => inv.status === 'pending')

  // Productos con stock bajo (< 10)
  const lowStockProducts = products.filter(p => p.stock !== null && p.stock < 10)

  // Datos de ventas de los últimos 7 días
  const salesData = []
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  for (let i = 6; i >= 0; i--) {
    const dayStart = getDaysAgo(i)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const daySales = invoices
      .filter(inv => {
        const invDate = getInvoiceDate(inv)
        if (!invDate) return false
        return invDate >= dayStart && invDate <= dayEnd
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0)

    salesData.push({
      name: dayNames[dayStart.getDay()],
      ventas: daySales,
    })
  }

  // Calcular cambio del día anterior
  const yesterdaySales = invoices
    .filter(inv => {
      const invDate = getInvoiceDate(inv)
      if (!invDate) return false
      const yesterday = getDaysAgo(1)
      const yesterdayEnd = new Date(yesterday)
      yesterdayEnd.setHours(23, 59, 59, 999)
      return invDate >= yesterday && invDate <= yesterdayEnd
    })
    .reduce((sum, inv) => sum + (inv.total || 0), 0)

  const todayChange = yesterdaySales > 0
    ? ((todaysSales - yesterdaySales) / yesterdaySales * 100).toFixed(1)
    : todaysSales > 0 ? '+100.0' : '0.0'

  // Estadísticas
  const stats = [
    {
      title: 'Ventas del Día',
      value: formatCurrency(todaysSales),
      icon: DollarSign,
      change: todaysSales > yesterdaySales ? `+${todayChange}%` : `${todayChange}%`,
      changeType: todaysSales >= yesterdaySales ? 'positive' : 'negative',
    },
    {
      title: 'Ventas del Mes',
      value: formatCurrency(monthSales),
      icon: TrendingUp,
      change: `${invoices.filter(inv => {
        const invDate = getInvoiceDate(inv)
        if (!invDate) return false
        return invDate >= getStartOfMonth()
      }).length} comprobantes`,
      changeType: 'positive',
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Bienvenido a Cobrify - Resumen de tu negocio
          </p>
        </div>
        <Link to="/pos" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Package className="w-4 h-4 mr-2" />
            Punto de Venta
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
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
              <Link to="/clientes" className="text-xs text-primary-600 hover:underline mt-1 inline-block">
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
              <Link to="/productos" className="text-xs text-primary-600 hover:underline mt-1 inline-block">
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
                  Stock: {product.stock}
                  {product.stock === 0 && ' - ¡Agotado!'}
                </span>
              </div>
            ))}
            {lowStockProducts.length > 5 && (
              <p className="text-xs text-gray-600 mt-2">
                +{lowStockProducts.length - 5} productos más con stock bajo
              </p>
            )}
          </div>
          <Link to="/productos" className="inline-block mt-3">
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
            <Link to="/facturas">
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
              <Link to="/pos">
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

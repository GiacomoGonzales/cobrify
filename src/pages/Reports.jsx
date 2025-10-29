import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  Calendar,
  FileText,
  Loader2,
  Download,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getCustomersWithStats, getProducts } from '@/services/firestoreService'

export default function Reports() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('month') // week, month, quarter, year, all
  const [selectedReport, setSelectedReport] = useState('overview') // overview, sales, products, customers

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      const [invoicesResult, customersResult, productsResult] = await Promise.all([
        getInvoices(user.uid),
        getCustomersWithStats(user.uid),
        getProducts(user.uid),
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

  // Filtrar facturas por rango de fecha
  const filteredInvoices = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    switch (dateRange) {
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        filterDate.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        filterDate.setMonth(now.getMonth() - 3)
        break
      case 'year':
        filterDate.setFullYear(now.getFullYear() - 1)
        break
      case 'all':
        return invoices
      default:
        return invoices
    }

    return invoices.filter(invoice => {
      if (!invoice.createdAt) return false
      const invoiceDate = invoice.createdAt.toDate
        ? invoice.createdAt.toDate()
        : new Date(invoice.createdAt)
      return invoiceDate >= filterDate
    })
  }, [invoices, dateRange])

  // Función helper para calcular revenue del período anterior
  const getPreviousPeriodRevenue = useCallback(() => {
    const now = new Date()
    let startDate = new Date()
    let endDate = new Date()

    switch (dateRange) {
      case 'week':
        startDate.setDate(now.getDate() - 14)
        endDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 2)
        endDate.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        startDate.setMonth(now.getMonth() - 6)
        endDate.setMonth(now.getMonth() - 3)
        break
      case 'year':
        startDate.setFullYear(now.getFullYear() - 2)
        endDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        return 0
    }

    return invoices
      .filter(invoice => {
        if (!invoice.createdAt) return false
        const invoiceDate = invoice.createdAt.toDate
          ? invoice.createdAt.toDate()
          : new Date(invoice.createdAt)
        return invoiceDate >= startDate && invoiceDate <= endDate
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0)
  }, [invoices, dateRange])

  // Calcular estadísticas generales
  const stats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0)
    const paidRevenue = filteredInvoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0)
    const pendingRevenue = filteredInvoices
      .filter(inv => inv.status === 'pending')
      .reduce((sum, inv) => sum + (inv.total || 0), 0)

    const totalInvoices = filteredInvoices.length
    const facturas = filteredInvoices.filter(inv => inv.documentType === 'factura').length
    const boletas = filteredInvoices.filter(inv => inv.documentType === 'boleta').length

    const avgTicket = totalInvoices > 0 ? totalRevenue / totalInvoices : 0

    // Comparar con período anterior
    const previousPeriodRevenue = getPreviousPeriodRevenue()
    const revenueGrowth = previousPeriodRevenue > 0
      ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
      : 0

    return {
      totalRevenue,
      paidRevenue,
      pendingRevenue,
      totalInvoices,
      facturas,
      boletas,
      avgTicket,
      revenueGrowth,
    }
  }, [filteredInvoices, getPreviousPeriodRevenue])

  // Top productos vendidos
  const topProducts = useMemo(() => {
    const productSales = {}

    filteredInvoices.forEach(invoice => {
      invoice.items?.forEach(item => {
        const key = item.name
        if (!productSales[key]) {
          productSales[key] = {
            name: item.name,
            quantity: 0,
            revenue: 0,
          }
        }
        productSales[key].quantity += item.quantity || 0
        // Calcular revenue usando unitPrice o subtotal
        const itemRevenue = item.subtotal || ((item.quantity || 0) * (item.unitPrice || 0))
        productSales[key].revenue += itemRevenue
      })
    })

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [filteredInvoices])

  // Top clientes - recalcular con facturas filtradas
  const topCustomers = useMemo(() => {
    // Recalcular estadísticas de clientes basado en facturas filtradas
    const customerStats = {}

    filteredInvoices.forEach(invoice => {
      // Intentar obtener el ID del cliente de diferentes formas
      const customerId = invoice.customer?.id || invoice.customerId
      const customerName = invoice.customer?.name || invoice.customerName || 'Cliente General'
      const customerDocType = invoice.customer?.documentType || invoice.customerDocumentType || '1'
      const customerDocNumber = invoice.customer?.documentNumber || invoice.customerDocumentNumber || '00000000'

      // Usar documento como clave si no hay ID
      const key = customerId || customerDocNumber

      if (!customerStats[key]) {
        customerStats[key] = {
          id: customerId || key,
          name: customerName,
          documentType: customerDocType,
          documentNumber: customerDocNumber,
          ordersCount: 0,
          totalSpent: 0,
        }
      }

      customerStats[key].ordersCount += 1
      customerStats[key].totalSpent += invoice.total || 0
    })

    return Object.values(customerStats)
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
      .slice(0, 10)
  }, [filteredInvoices])

  // Ventas por mes (últimos 12 meses)
  const salesByMonth = useMemo(() => {
    const monthsData = {}
    const now = new Date()

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      monthsData[key] = {
        month: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
        revenue: 0,
        count: 0,
      }
    }

    invoices.forEach(invoice => {
      if (!invoice.createdAt) return
      const invoiceDate = invoice.createdAt.toDate
        ? invoice.createdAt.toDate()
        : new Date(invoice.createdAt)
      const key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`

      if (monthsData[key]) {
        monthsData[key].revenue += invoice.total || 0
        monthsData[key].count += 1
      }
    })

    return Object.values(monthsData)
  }, [invoices])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-2" />
          <p className="text-gray-600">Cargando reportes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Análisis detallado de tu negocio
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full sm:w-48"
          >
            <option value="week">Última semana</option>
            <option value="month">Último mes</option>
            <option value="quarter">Último trimestre</option>
            <option value="year">Último año</option>
            <option value="all">Todo el período</option>
          </Select>
        </div>
      </div>

      {/* Tabs de reportes */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedReport('overview')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'overview'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline-block mr-2" />
          Resumen General
        </button>
        <button
          onClick={() => setSelectedReport('sales')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'sales'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline-block mr-2" />
          Ventas
        </button>
        <button
          onClick={() => setSelectedReport('products')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'products'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Package className="w-4 h-4 inline-block mr-2" />
          Productos
        </button>
        <button
          onClick={() => setSelectedReport('customers')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'customers'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Users className="w-4 h-4 inline-block mr-2" />
          Clientes
        </button>
      </div>

      {/* Resumen General */}
      {selectedReport === 'overview' && (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ingresos Totales</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatCurrency(stats.totalRevenue)}
                    </p>
                    {stats.revenueGrowth !== 0 && (
                      <div className="flex items-center mt-2">
                        {stats.revenueGrowth > 0 ? (
                          <ArrowUpRight className="w-4 h-4 text-green-600 mr-1" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-600 mr-1" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            stats.revenueGrowth > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {Math.abs(stats.revenueGrowth).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Comprobantes</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{stats.totalInvoices}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="primary">{stats.facturas} Facturas</Badge>
                      <Badge>{stats.boletas} Boletas</Badge>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ticket Promedio</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatCurrency(stats.avgTicket)}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <ShoppingCart className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Clientes Activos</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{customers.length}</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Users className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ventas por mes */}
          <Card>
            <CardHeader>
              <CardTitle>Tendencia de Ventas (Últimos 12 Meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Comprobantes</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesByMonth.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.month}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(item.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Ventas */}
      {selectedReport === 'sales' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pagadas</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">
                    {formatCurrency(stats.paidRevenue)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {filteredInvoices.filter(inv => inv.status === 'paid').length} comprobantes
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-2">
                    {formatCurrency(stats.pendingRevenue)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {filteredInvoices.filter(inv => inv.status === 'pending').length} comprobantes
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{stats.totalInvoices} comprobantes</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Últimas Ventas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.slice(0, 20).map(invoice => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.number}</TableCell>
                        <TableCell>{invoice.customer?.name || 'Cliente General'}</TableCell>
                        <TableCell>
                          {invoice.createdAt
                            ? formatDate(
                                invoice.createdAt.toDate
                                  ? invoice.createdAt.toDate()
                                  : invoice.createdAt
                              )
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoice.documentType === 'factura' ? 'primary' : 'default'}>
                            {invoice.documentType === 'factura' ? 'Factura' : 'Boleta'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === 'paid'
                                ? 'success'
                                : invoice.status === 'pending'
                                ? 'warning'
                                : 'default'
                            }
                          >
                            {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Productos */}
      {selectedReport === 'products' && (
        <Card>
          <CardHeader>
            <CardTitle>Productos Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posición</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad Vendida</TableHead>
                    <TableHead className="text-right">Ingresos Generados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        No hay datos de productos en este período
                      </TableCell>
                    </TableRow>
                  ) : (
                    topProducts.map((product, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                              index === 0
                                ? 'bg-yellow-100 text-yellow-700'
                                : index === 1
                                ? 'bg-gray-200 text-gray-700'
                                : index === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-right">{product.quantity.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(product.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reporte de Clientes */}
      {selectedReport === 'customers' && (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posición</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Total Gastado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        No hay datos de clientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    topCustomers.map((customer, index) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                              index === 0
                                ? 'bg-yellow-100 text-yellow-700'
                                : index === 1
                                ? 'bg-gray-200 text-gray-700'
                                : index === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              customer.documentType === '6' ? 'primary' : 'default'
                            }
                          >
                            {customer.documentType === '6' ? 'RUC' : 'DNI'}
                          </Badge>
                          <span className="ml-2 text-sm">{customer.documentNumber}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                            <span className="text-sm font-semibold">{customer.ordersCount || 0}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(customer.totalSpent || 0)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

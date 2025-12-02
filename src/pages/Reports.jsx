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
  Receipt,
  TrendingDown,
  Zap,
  Truck,
  Wrench,
  Building,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getCustomersWithStats, getProducts } from '@/services/firestoreService'
import { getRecipes } from '@/services/recipeService'
import {
  exportGeneralReport,
  exportSalesReport,
  exportProductsReport,
  exportCustomersReport,
} from '@/services/reportExportService'
import { getExpenses, EXPENSE_CATEGORIES } from '@/services/expenseService'
import * as XLSX from 'xlsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

export default function Reports() {
  const { user, isDemoMode, demoData, getBusinessId, hasFeature } = useAppContext()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [recipes, setRecipes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('month') // week, month, quarter, year, all
  const [selectedReport, setSelectedReport] = useState('overview') // overview, sales, products, customers, expenses

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setIsLoading(true)
    try {
      // MODO DEMO: Usar datos de ejemplo
      if (isDemoMode && demoData) {
        setInvoices(demoData.invoices || [])
        setCustomers(demoData.customers || [])
        setProducts(demoData.products || [])
        setRecipes([]) // En demo no hay recetas por ahora
        setExpenses([]) // En demo no hay gastos por ahora
        setIsLoading(false)
        return
      }

      const [invoicesResult, customersResult, productsResult, recipesResult] = await Promise.all([
        getInvoices(getBusinessId()),
        getCustomersWithStats(getBusinessId()),
        getProducts(getBusinessId()),
        getRecipes(getBusinessId()),
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
      if (recipesResult.success) {
        setRecipes(recipesResult.data || [])
      }

      // Cargar gastos solo si tiene el feature habilitado
      if (hasFeature && hasFeature('expenseManagement')) {
        try {
          const expensesData = await getExpenses(getBusinessId())
          setExpenses(expensesData || [])
        } catch (error) {
          console.error('Error al cargar gastos:', error)
          setExpenses([])
        }
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Función para calcular el costo de un item
  const calculateItemCost = useCallback((item) => {
    const productId = item.productId || item.id
    const quantity = item.quantity || 0

    // Buscar si el producto tiene receta (prioridad)
    const recipe = recipes.find(r => r.productId === productId)

    if (recipe) {
      // Usar costo de la receta (calculado de ingredientes)
      return (recipe.totalCost || 0) * quantity
    } else {
      // Si no tiene receta, usar costo manual del producto
      const product = products.find(p => p.id === productId)
      return (product?.cost || 0) * quantity
    }
  }, [products, recipes])

  // Filtrar facturas por rango de fecha y calcular costos
  const filteredInvoices = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    // Primero filtrar facturas para evitar duplicados:
    // - Excluir boletas/facturas convertidas desde notas de venta (para no duplicar ingresos)
    // - Excluir documentos anulados (notas de venta, boletas, facturas)
    const validInvoices = invoices.filter(invoice => {
      // Si es una boleta convertida desde nota de venta, no contar (ya se contó en la nota)
      if (invoice.convertedFrom) {
        return false
      }
      // Si el documento está anulado, no contar
      if (invoice.status === 'cancelled' || invoice.status === 'voided') {
        return false
      }
      return true
    })

    const addCostCalculations = (invoice) => {
      let totalCost = 0
      invoice.items?.forEach(item => {
        totalCost += calculateItemCost(item)
      })
      return {
        ...invoice,
        totalCost,
        profit: (invoice.total || 0) - totalCost,
        profitMargin: invoice.total > 0 ? ((invoice.total - totalCost) / invoice.total) * 100 : 0
      }
    }

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
        return validInvoices.map(addCostCalculations)
      default:
        return validInvoices.map(addCostCalculations)
    }

    return validInvoices
      .filter(invoice => {
        if (!invoice.createdAt) return false
        const invoiceDate = invoice.createdAt.toDate
          ? invoice.createdAt.toDate()
          : new Date(invoice.createdAt)
        return invoiceDate >= filterDate
      })
      .map(addCostCalculations)
  }, [invoices, dateRange, calculateItemCost])

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

    // Calcular utilidad total
    let totalCost = 0
    filteredInvoices.forEach(invoice => {
      invoice.items?.forEach(item => {
        const productId = item.productId || item.id
        const quantity = item.quantity || 0

        // Buscar si el producto tiene receta (prioridad)
        const recipe = recipes.find(r => r.productId === productId)

        if (recipe) {
          // Usar costo de la receta (calculado de ingredientes)
          const cost = recipe.totalCost || 0
          totalCost += cost * quantity
        } else {
          // Si no tiene receta, usar costo manual del producto
          const product = products.find(p => p.id === productId)
          const cost = product?.cost || 0
          totalCost += cost * quantity
        }
      })
    })
    const totalProfit = totalRevenue - totalCost
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

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
      totalCost,
      totalProfit,
      profitMargin,
    }
  }, [filteredInvoices, getPreviousPeriodRevenue, products, recipes])

  // Top productos vendidos
  const topProducts = useMemo(() => {
    const productSales = {}

    filteredInvoices.forEach(invoice => {
      invoice.items?.forEach(item => {
        // Soportar tanto 'name' como 'description' y tanto 'unitPrice' como 'price'
        const itemName = item.name || item.description
        const itemPrice = item.unitPrice || item.price || 0
        const key = itemName

        if (!productSales[key]) {
          productSales[key] = {
            name: itemName,
            quantity: 0,
            revenue: 0,
          }
        }
        productSales[key].quantity += item.quantity || 0
        const itemRevenue = item.subtotal || ((item.quantity || 0) * itemPrice)
        // Redondear a 2 decimales para evitar errores de punto flotante
        productSales[key].revenue = Number((productSales[key].revenue + itemRevenue).toFixed(2))
      })
    })

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [filteredInvoices])

  // Top clientes
  const topCustomers = useMemo(() => {
    const customerStats = {}

    filteredInvoices.forEach(invoice => {
      const customerId = invoice.customer?.id || invoice.customerId
      const customerName = invoice.customer?.name || invoice.customerName || 'Cliente General'
      const customerDocType = invoice.customer?.documentType || invoice.customerDocumentType || '1'
      const customerDocNumber = invoice.customer?.documentNumber || invoice.customerDocumentNumber || '00000000'

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
      // Redondear a 2 decimales para evitar errores de punto flotante
      customerStats[key].totalSpent = Number((customerStats[key].totalSpent + (invoice.total || 0)).toFixed(2))
    })

    return Object.values(customerStats)
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
      .slice(0, 10)
  }, [filteredInvoices])

  // Estadísticas por vendedor
  const sellerStats = useMemo(() => {
    const sellers = {}

    filteredInvoices.forEach(invoice => {
      const sellerId = invoice.createdBy || 'unknown'
      const sellerName = invoice.createdByName || invoice.createdByEmail || 'Sin asignar'

      if (!sellers[sellerId]) {
        sellers[sellerId] = {
          id: sellerId,
          name: sellerName,
          email: invoice.createdByEmail || '',
          salesCount: 0,
          totalRevenue: 0,
          facturas: 0,
          boletas: 0,
          notasCredito: 0,
          notasDebito: 0,
        }
      }

      sellers[sellerId].salesCount += 1
      sellers[sellerId].totalRevenue += invoice.total || 0

      if (invoice.documentType === 'factura') sellers[sellerId].facturas += 1
      else if (invoice.documentType === 'boleta') sellers[sellerId].boletas += 1
      else if (invoice.documentType === 'nota_credito') sellers[sellerId].notasCredito += 1
      else if (invoice.documentType === 'nota_debito') sellers[sellerId].notasDebito += 1
    })

    return Object.values(sellers)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [filteredInvoices])

  // Estadísticas por método de pago
  const paymentMethodStats = useMemo(() => {
    const methods = {}

    filteredInvoices.forEach(invoice => {
      // Soportar múltiples formas de pago
      if (invoice.payments && Array.isArray(invoice.payments)) {
        invoice.payments.forEach(payment => {
          const method = payment.method || 'Efectivo'
          const amount = payment.amount || 0

          if (!methods[method]) {
            methods[method] = {
              method,
              total: 0,
              count: 0,
            }
          }

          methods[method].total += amount
          methods[method].count += 1
        })
      } else {
        // Compatibilidad con facturas antiguas que solo tienen paymentMethod
        const method = invoice.paymentMethod || 'Efectivo'
        const amount = invoice.total || 0

        if (!methods[method]) {
          methods[method] = {
            method,
            total: 0,
            count: 0,
          }
        }

        methods[method].total += amount
        methods[method].count += 1
      }
    })

    return Object.values(methods)
      .sort((a, b) => b.total - a.total)
  }, [filteredInvoices])

  // Datos para gráfico de métodos de pago
  const paymentMethodsData = useMemo(() => {
    return paymentMethodStats.map((method, index) => ({
      name: method.method,
      value: method.total,
      color: COLORS[index % COLORS.length]
    }))
  }, [paymentMethodStats])

  // Ventas por período según el rango seleccionado
  const salesByPeriod = useMemo(() => {
    const now = new Date()
    let periodsData = {}
    let groupBy = 'month' // 'day', 'week', 'month'

    // Determinar agrupación según el rango
    if (dateRange === 'week') {
      groupBy = 'day'
      // Últimos 7 días
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          revenue: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'month') {
      groupBy = 'day'
      // Últimos 30 días
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          revenue: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'quarter') {
      groupBy = 'month'
      // Últimos 3 meses
      for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
          revenue: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'year') {
      groupBy = 'month'
      // Últimos 12 meses
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
          revenue: 0,
          count: 0,
        }
      }
    } else {
      // 'all' - mostrar por mes
      groupBy = 'month'
      invoices.forEach(invoice => {
        if (!invoice.createdAt) return
        const invoiceDate = invoice.createdAt.toDate
          ? invoice.createdAt.toDate()
          : new Date(invoice.createdAt)
        const key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`

        if (!periodsData[key]) {
          periodsData[key] = {
            period: invoiceDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
            revenue: 0,
            count: 0,
          }
        }
      })
    }

    // Procesar facturas filtradas
    filteredInvoices.forEach(invoice => {
      if (!invoice.createdAt) return
      const invoiceDate = invoice.createdAt.toDate
        ? invoice.createdAt.toDate()
        : new Date(invoice.createdAt)

      let key
      if (groupBy === 'day') {
        key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}`
      } else {
        key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
      }

      if (periodsData[key]) {
        periodsData[key].revenue = Number((periodsData[key].revenue + (invoice.total || 0)).toFixed(2))
        periodsData[key].count += 1
      }
    })

    return Object.entries(periodsData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [filteredInvoices, dateRange, invoices])

  // Datos para gráfico de torta de tipos de documentos
  const documentTypesData = useMemo(() => {
    return [
      { name: 'Facturas', value: stats.facturas, color: COLORS[0] },
      { name: 'Boletas', value: stats.boletas, color: COLORS[1] },
    ].filter(item => item.value > 0)
  }, [stats])

  // Datos para gráfico de torta de estados de pago
  const paymentStatusData = useMemo(() => {
    const paid = filteredInvoices.filter(inv => inv.status === 'paid').length
    const pending = filteredInvoices.filter(inv => inv.status === 'pending').length

    return [
      { name: 'Pagadas', value: paid, color: COLORS[1] },
      { name: 'Pendientes', value: pending, color: COLORS[2] },
    ].filter(item => item.value > 0)
  }, [filteredInvoices])

  // Datos para gráfico de tipos de pedido
  const orderTypeData = useMemo(() => {
    const dineIn = filteredInvoices.filter(inv => inv.orderType === 'dine-in').length
    const takeaway = filteredInvoices.filter(inv => inv.orderType === 'takeaway').length
    const delivery = filteredInvoices.filter(inv => inv.orderType === 'delivery').length
    const unspecified = filteredInvoices.filter(inv => !inv.orderType).length

    return [
      { name: 'En Mesa', value: dineIn, color: COLORS[0] },
      { name: 'Para Llevar', value: takeaway, color: COLORS[1] },
      { name: 'Delivery', value: delivery, color: COLORS[2] },
      { name: 'Sin especificar', value: unspecified, color: COLORS[6] },
    ].filter(item => item.value > 0)
  }, [filteredInvoices])

  // Datos para gráfico de productos top 5
  const top5ProductsData = useMemo(() => {
    return topProducts.slice(0, 5).map((product, index) => ({
      name: product.name && product.name.length > 15 ? product.name.substring(0, 15) + '...' : (product.name || 'Producto'),
      fullName: product.name || 'Producto',
      ventas: product.revenue,
      cantidad: product.quantity,
      color: COLORS[index % COLORS.length]
    }))
  }, [topProducts])

  // ========== CÁLCULOS DE GASTOS ==========

  // Filtrar gastos por rango de fecha
  const filteredExpenses = useMemo(() => {
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
        return expenses
      default:
        return expenses
    }

    return expenses.filter(expense => {
      if (!expense.date) return false
      const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)
      return expenseDate >= filterDate
    })
  }, [expenses, dateRange])

  // Estadísticas de gastos
  const expenseStats = useMemo(() => {
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)

    // Por categoría
    const byCategory = filteredExpenses.reduce((acc, expense) => {
      const cat = expense.category || 'otros'
      if (!acc[cat]) {
        acc[cat] = { total: 0, count: 0 }
      }
      acc[cat].total += expense.amount || 0
      acc[cat].count += 1
      return acc
    }, {})

    // Por método de pago
    const byPaymentMethod = filteredExpenses.reduce((acc, expense) => {
      const method = expense.paymentMethod || 'efectivo'
      if (!acc[method]) {
        acc[method] = { total: 0, count: 0 }
      }
      acc[method].total += expense.amount || 0
      acc[method].count += 1
      return acc
    }, {})

    return {
      total: totalExpenses,
      count: filteredExpenses.length,
      byCategory,
      byPaymentMethod,
      avgExpense: filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0
    }
  }, [filteredExpenses])

  // Datos para gráfico de gastos por categoría
  const expensesByCategoryData = useMemo(() => {
    return Object.entries(expenseStats.byCategory).map(([catId, data], index) => {
      const category = EXPENSE_CATEGORIES.find(c => c.id === catId)
      return {
        name: category?.name || catId,
        value: data.total,
        count: data.count,
        color: COLORS[index % COLORS.length]
      }
    }).sort((a, b) => b.value - a.value)
  }, [expenseStats.byCategory])

  // Gastos por período (para gráfico de tendencia)
  const expensesByPeriod = useMemo(() => {
    const now = new Date()
    let periodsData = {}
    let groupBy = 'month'

    if (dateRange === 'week') {
      groupBy = 'day'
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          gastos: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'month') {
      groupBy = 'day'
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
          gastos: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'quarter') {
      groupBy = 'month'
      for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
          gastos: 0,
          count: 0,
        }
      }
    } else if (dateRange === 'year') {
      groupBy = 'month'
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        periodsData[key] = {
          period: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
          gastos: 0,
          count: 0,
        }
      }
    } else {
      groupBy = 'month'
      filteredExpenses.forEach(expense => {
        if (!expense.date) return
        const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)
        const key = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`
        if (!periodsData[key]) {
          periodsData[key] = {
            period: expenseDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
            gastos: 0,
            count: 0,
          }
        }
      })
    }

    filteredExpenses.forEach(expense => {
      if (!expense.date) return
      const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)

      let key
      if (groupBy === 'day') {
        key = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}-${String(expenseDate.getDate()).padStart(2, '0')}`
      } else {
        key = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`
      }

      if (periodsData[key]) {
        periodsData[key].gastos = Number((periodsData[key].gastos + (expense.amount || 0)).toFixed(2))
        periodsData[key].count += 1
      }
    })

    return Object.entries(periodsData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [filteredExpenses, dateRange])

  // Función para exportar reporte de gastos
  const exportExpensesReport = () => {
    const data = filteredExpenses.map(e => ({
      'Fecha': e.date instanceof Date ? e.date.toLocaleDateString('es-PE') : new Date(e.date).toLocaleDateString('es-PE'),
      'Descripción': e.description || '',
      'Categoría': EXPENSE_CATEGORIES.find(c => c.id === e.category)?.name || e.category,
      'Proveedor': e.supplier || '-',
      'Referencia': e.reference || '-',
      'Método de Pago': e.paymentMethod || 'Efectivo',
      'Monto': e.amount || 0
    }))

    // Agregar fila de total
    data.push({
      'Fecha': '',
      'Descripción': 'TOTAL',
      'Categoría': '',
      'Proveedor': '',
      'Referencia': '',
      'Método de Pago': '',
      'Monto': expenseStats.total
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos')

    const dateRangeText = {
      week: 'ultima_semana',
      month: 'ultimo_mes',
      quarter: 'ultimo_trimestre',
      year: 'ultimo_año',
      all: 'todo'
    }[dateRange] || 'periodo'

    XLSX.writeFile(wb, `reporte_gastos_${dateRangeText}.xlsx`)
  }

  // Custom tooltip para los gráficos
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.name.includes('ventas') || entry.name.includes('Ingresos')
                ? formatCurrency(entry.value)
                : entry.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

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
        <button
          onClick={() => setSelectedReport('sellers')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedReport === 'sellers'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Users className="w-4 h-4 inline-block mr-2" />
          Vendedores
        </button>
        {/* Tab de Gastos - solo visible si tiene el feature */}
        {hasFeature && hasFeature('expenseManagement') && (
          <button
            onClick={() => setSelectedReport('expenses')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedReport === 'expenses'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Receipt className="w-4 h-4 inline-block mr-2" />
            Gastos
          </button>
        )}
      </div>

      {/* Resumen General */}
      {selectedReport === 'overview' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={() => exportGeneralReport({ stats, salesByMonth: salesByPeriod, topProducts, topCustomers, filteredInvoices, dateRange, paymentMethodStats })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte General (Excel)
            </button>
          </div>

          {/* KPIs principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    <p className="text-sm font-medium text-gray-600">Costo Total</p>
                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {formatCurrency(stats.totalCost)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Productos vendidos
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-lg">
                    <Package className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Utilidad Total</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      {formatCurrency(stats.totalProfit)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Margen: {stats.profitMargin.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-green-600" />
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
                      <Badge variant="primary">{stats.facturas} F</Badge>
                      <Badge>{stats.boletas} B</Badge>
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
          </div>

          {/* Gráficos principales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Ventas por Período */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Tendencia de Ventas
                  {dateRange === 'week' && ' (Última Semana)'}
                  {dateRange === 'month' && ' (Último Mes)'}
                  {dateRange === 'quarter' && ' (Último Trimestre)'}
                  {dateRange === 'year' && ' (Último Año)'}
                  {dateRange === 'all' && ' (Todo el Período)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesByPeriod}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={COLORS[0]}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name="Ingresos"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Tipos de Documentos */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución de Comprobantes</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RePieChart>
                    <Pie
                      data={documentTypesData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {documentTypesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos secundarios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Estados de Pago */}
            <Card>
              <CardHeader>
                <CardTitle>Estados de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RePieChart>
                    <Pie
                      data={paymentStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {paymentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Tipos de Pedido */}
            <Card>
              <CardHeader>
                <CardTitle>Tipos de Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                {orderTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={orderTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {orderTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No hay datos de tipos de pedido disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Reporte de Ventas */}
      {selectedReport === 'sales' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={() => exportSalesReport({ stats, salesByMonth: salesByPeriod, filteredInvoices, dateRange, paymentMethodStats })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Ventas (Excel)
            </button>
          </div>

          {/* Resumen de Ventas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Ventas</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{stats.totalInvoices} comprobantes</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Costo Total</p>
                  <p className="text-2xl font-bold text-red-600 mt-2">
                    {formatCurrency(stats.totalCost)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Productos vendidos</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Utilidad Total</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">
                    {formatCurrency(stats.totalProfit)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Margen: {stats.profitMargin.toFixed(1)}%</p>
                </div>
              </CardContent>
            </Card>

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
          </div>

          {/* Cards de Métodos de Pago */}
          {paymentMethodStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen por Método de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {paymentMethodStats.map((method, index) => (
                    <div
                      key={method.method}
                      className="p-4 rounded-lg border border-gray-200 bg-gradient-to-br from-white to-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-600">{method.method}</p>
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(method.total)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {method.count} {method.count === 1 ? 'transacción' : 'transacciones'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de línea de ingresos */}
            <Card>
              <CardHeader>
                <CardTitle>Evolución de Ingresos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={salesByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke={COLORS[0]}
                      strokeWidth={3}
                      dot={{ fill: COLORS[0], r: 6 }}
                      name="Ingresos"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Métodos de Pago */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Método de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethodsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <RePieChart>
                      <Pie
                        data={paymentMethodsData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent, value }) => `${name}: ${formatCurrency(value)} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {paymentMethodsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(value)}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-gray-500">
                    <p>No hay datos de métodos de pago disponibles</p>
                  </div>
                )}
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
                      <TableHead>Método Pago</TableHead>
                      <TableHead className="text-right">Precio Venta</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.slice(0, 20).map(invoice => {
                      // Obtener métodos de pago
                      let paymentMethods = 'Efectivo'
                      if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
                        if (invoice.payments.length === 1) {
                          paymentMethods = invoice.payments[0].method || 'Efectivo'
                        } else {
                          paymentMethods = 'Múltiples'
                        }
                      } else if (invoice.paymentMethod) {
                        paymentMethods = invoice.paymentMethod
                      }

                      return (
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
                          <TableCell>
                            <Badge variant="default">{paymentMethods}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(invoice.total)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(invoice.totalCost || 0)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(invoice.profit || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              (invoice.profitMargin || 0) >= 30
                                ? 'text-green-600'
                                : (invoice.profitMargin || 0) >= 15
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {(invoice.profitMargin || 0).toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Productos */}
      {selectedReport === 'products' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={() => exportProductsReport({ topProducts, dateRange })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Productos (Excel)
            </button>
          </div>

          {/* Gráfico de Top 5 Productos */}
          <Card>
            <CardHeader>
              <CardTitle>Top 5 Productos Más Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={top5ProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ventas" fill={COLORS[0]} name="Ventas" radius={[0, 8, 8, 0]}>
                    {top5ProductsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabla de productos */}
          <Card>
            <CardHeader>
              <CardTitle>Todos los Productos Vendidos</CardTitle>
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
        </>
      )}

      {/* Reporte de Clientes */}
      {selectedReport === 'customers' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={() => exportCustomersReport({ topCustomers, dateRange })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Clientes (Excel)
            </button>
          </div>

          {/* Gráfico de Top 10 Clientes */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Clientes por Ingresos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topCustomers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={100} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalSpent" fill={COLORS[4]} name="Total Gastado" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabla de clientes */}
          <Card>
            <CardHeader>
              <CardTitle>Detalles de Clientes</CardTitle>
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
        </>
      )}

      {/* Reporte por Vendedores */}
      {selectedReport === 'sellers' && (
        <>
          {/* Resumen de ventas por vendedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Vendedores</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{sellerStats.length}</p>
                  </div>
                  <Users className="w-8 h-8 text-primary-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Top Vendedor</p>
                    <p className="text-lg font-bold text-gray-900 mt-2">
                      {sellerStats.length > 0 ? sellerStats[0].name : 'N/A'}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ventas Top Vendedor</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {sellerStats.length > 0 ? sellerStats[0].salesCount : 0}
                    </p>
                  </div>
                  <ShoppingCart className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ingresos Top Vendedor</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {sellerStats.length > 0 ? formatCurrency(sellerStats[0].totalRevenue) : formatCurrency(0)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de ventas por vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>Ingresos por Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={sellerStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={100} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalRevenue" fill={COLORS[0]} name="Total Vendido" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabla detallada por vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>Detalles de Ventas por Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posición</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Total Ventas</TableHead>
                      <TableHead className="text-right">Facturas</TableHead>
                      <TableHead className="text-right">Boletas</TableHead>
                      <TableHead className="text-right">N. Crédito</TableHead>
                      <TableHead className="text-right">N. Débito</TableHead>
                      <TableHead className="text-right">Ingresos Totales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellerStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No hay datos de vendedores
                        </TableCell>
                      </TableRow>
                    ) : (
                      sellerStats.map((seller, index) => (
                        <TableRow key={seller.id}>
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
                          <TableCell>
                            <div>
                              <p className="font-medium">{seller.name}</p>
                              {seller.email && (
                                <p className="text-xs text-gray-500">{seller.email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                              <span className="text-sm font-semibold">{seller.salesCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="primary">{seller.facturas}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="default">{seller.boletas}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="warning">{seller.notasCredito}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="danger">{seller.notasDebito}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(seller.totalRevenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Gastos */}
      {selectedReport === 'expenses' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={exportExpensesReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Gastos (Excel)
            </button>
          </div>

          {/* KPIs de Gastos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Gastos</p>
                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {formatCurrency(expenseStats.total)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {expenseStats.count} registros
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-lg">
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Promedio por Gasto</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {formatCurrency(expenseStats.avgExpense)}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Receipt className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Servicios</p>
                    <p className="text-2xl font-bold text-yellow-600 mt-2">
                      {formatCurrency(expenseStats.byCategory.servicios?.total || 0)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {expenseStats.byCategory.servicios?.count || 0} registros
                    </p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <Zap className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Proveedores</p>
                    <p className="text-2xl font-bold text-blue-600 mt-2">
                      {formatCurrency(expenseStats.byCategory.proveedores?.total || 0)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {expenseStats.byCategory.proveedores?.count || 0} registros
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos de Gastos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Tendencia de Gastos */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Tendencia de Gastos
                  {dateRange === 'week' && ' (Última Semana)'}
                  {dateRange === 'month' && ' (Último Mes)'}
                  {dateRange === 'quarter' && ' (Último Trimestre)'}
                  {dateRange === 'year' && ' (Último Año)'}
                  {dateRange === 'all' && ' (Todo el Período)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={expensesByPeriod}>
                    <defs>
                      <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(label) => `Período: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="gastos"
                      stroke="#ef4444"
                      fillOpacity={1}
                      fill="url(#colorGastos)"
                      name="Gastos"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Gastos por Categoría */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                {expensesByCategoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={expensesByCategoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {expensesByCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No hay datos de gastos disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Resumen por Categoría */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {expensesByCategoryData.map((cat, index) => (
                  <div
                    key={cat.name}
                    className="p-4 rounded-lg border border-gray-200 bg-gradient-to-br from-white to-gray-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600">{cat.name}</p>
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(cat.value)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {cat.count} {cat.count === 1 ? 'registro' : 'registros'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabla de Últimos Gastos */}
          <Card>
            <CardHeader>
              <CardTitle>Últimos Gastos Registrados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No hay gastos registrados en este período
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.slice(0, 20).map(expense => {
                        const category = EXPENSE_CATEGORIES.find(c => c.id === expense.category)
                        return (
                          <TableRow key={expense.id}>
                            <TableCell>
                              {expense.date instanceof Date
                                ? expense.date.toLocaleDateString('es-PE')
                                : new Date(expense.date).toLocaleDateString('es-PE')
                              }
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{expense.description}</p>
                              {expense.reference && (
                                <p className="text-xs text-gray-500">Ref: {expense.reference}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">
                                {category?.name || expense.category}
                              </Badge>
                            </TableCell>
                            <TableCell>{expense.supplier || '-'}</TableCell>
                            <TableCell>
                              <span className="text-sm capitalize">{expense.paymentMethod || 'Efectivo'}</span>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-red-600">
                              {formatCurrency(expense.amount)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredExpenses.length > 20 && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Mostrando 20 de {filteredExpenses.length} gastos. Descarga el Excel para ver todos.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

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
  Store,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import RealEstateReports from './RealEstateReports'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getInvoices, getCustomersWithStats, getProducts, getProductCategories, getPurchases, getFinancialMovements, getAllCashMovements } from '@/services/firestoreService'
import { getRecipes } from '@/services/recipeService'
import { getActiveBranches } from '@/services/branchService'
import {
  exportGeneralReport,
  exportSalesReport,
  exportProductsReport,
  exportCustomersReport,
} from '@/services/reportExportService'
import { getExpenses, EXPENSE_CATEGORIES } from '@/services/expenseService'
import * as XLSX from 'xlsx'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
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

/**
 * Helper para exportar Excel que funciona en iOS/Android
 * En móvil guarda el archivo y abre el menú compartir
 * En web usa la descarga normal
 */
const exportExcelFile = async (workbook, fileName) => {
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      // Generar el archivo como array buffer
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })

      // Crear directorio si no existe
      const excelDir = 'Reportes'
      try {
        await Filesystem.mkdir({
          path: excelDir,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (mkdirError) {
        console.log('Directorio ya existe:', mkdirError)
      }

      // Guardar archivo
      const result = await Filesystem.writeFile({
        path: `${excelDir}/${fileName}`,
        data: excelBuffer,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('Excel guardado en:', result.uri)

      // Abrir menú compartir
      try {
        await Share.share({
          title: fileName,
          text: `Reporte: ${fileName}`,
          url: result.uri,
          dialogTitle: 'Compartir Reporte'
        })
      } catch (shareError) {
        console.log('Compartir cancelado:', shareError)
      }

      return { success: true, uri: result.uri }
    } catch (error) {
      console.error('Error al exportar Excel en móvil:', error)
      throw error
    }
  } else {
    // En web usar descarga normal
    XLSX.writeFile(workbook, fileName)
    return { success: true }
  }
}

export default function Reports() {
  const { user, isDemoMode, demoData, getBusinessId, hasFeature, businessMode, filterBranchesByAccess } = useAppContext()

  // Si estamos en modo inmobiliaria, renderizar el componente especializado
  if (businessMode === 'real_estate') {
    return <RealEstateReports />
  }

  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [recipes, setRecipes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [financialMovements, setFinancialMovements] = useState([])
  const [cashMovements, setCashMovements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('month') // week, month, quarter, year, all, custom
  const [selectedReport, setSelectedReport] = useState('overview') // overview, sales, products, customers, expenses
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')

  // Helper para parsear fecha en zona horaria local (evita problemas con UTC)
  const parseLocalDate = (dateString) => {
    if (!dateString) return null
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  useEffect(() => {
    loadData()
    loadBranches()
  }, [user])

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
        setExpenses(demoData.expenses || [])
        setIsLoading(false)
        return
      }

      const [invoicesResult, customersResult, productsResult, recipesResult, categoriesResult] = await Promise.all([
        getInvoices(getBusinessId()),
        getCustomersWithStats(getBusinessId()),
        getProducts(getBusinessId()),
        getRecipes(getBusinessId()),
        getProductCategories(getBusinessId()),
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
      if (categoriesResult.success) {
        setProductCategories(categoriesResult.data || [])
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

      // Cargar compras para el cálculo de rentabilidad
      try {
        const purchasesResult = await getPurchases(getBusinessId())
        if (purchasesResult.success) {
          setPurchases(purchasesResult.data || [])
        }
      } catch (error) {
        console.error('Error al cargar compras:', error)
        setPurchases([])
      }

      // Cargar movimientos financieros y de caja para otros ingresos/egresos
      try {
        const [financialResult, cashResult] = await Promise.all([
          getFinancialMovements(getBusinessId()),
          getAllCashMovements(getBusinessId())
        ])
        if (financialResult.success) {
          setFinancialMovements(financialResult.data || [])
        }
        if (cashResult.success) {
          setCashMovements(cashResult.data || [])
        }
      } catch (error) {
        console.error('Error al cargar movimientos:', error)
        setFinancialMovements([])
        setCashMovements([])
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
    // - Excluir notas de venta que ya fueron convertidas a boleta/factura (para no duplicar ingresos)
    // - Excluir documentos anulados (notas de venta, boletas, facturas)
    // - Filtrar por sucursal si está seleccionada
    const validInvoices = invoices.filter(invoice => {
      // Si es una nota de venta ya convertida a comprobante, no contar (se cuenta la boleta/factura)
      if (invoice.convertedTo) {
        return false
      }
      // Si el documento está anulado, no contar
      if (invoice.status === 'cancelled' || invoice.status === 'voided') {
        return false
      }
      // Filtrar por sucursal
      if (filterBranch !== 'all') {
        if (filterBranch === 'main') {
          if (invoice.branchId) return false // Solo sucursal principal (sin branchId)
        } else {
          if (invoice.branchId !== filterBranch) return false
        }
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

    // Para fechas personalizadas
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return validInvoices.map(addCostCalculations)
      }
      const startDate = parseLocalDate(customStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = parseLocalDate(customEndDate)
      endDate.setHours(23, 59, 59, 999)

      return validInvoices
        .filter(invoice => {
          if (!invoice.createdAt) return false
          const invoiceDate = invoice.createdAt.toDate
            ? invoice.createdAt.toDate()
            : new Date(invoice.createdAt)
          return invoiceDate >= startDate && invoiceDate <= endDate
        })
        .map(addCostCalculations)
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
  }, [invoices, dateRange, customStartDate, customEndDate, calculateItemCost, filterBranch])

  // Función helper para calcular revenue del período anterior
  const getPreviousPeriodRevenue = useCallback(() => {
    const now = new Date()
    let startDate = new Date()
    let endDate = new Date()

    // Para fechas personalizadas, calcular período anterior con la misma duración
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) return 0
      const customStart = parseLocalDate(customStartDate)
      const customEnd = parseLocalDate(customEndDate)
      const duration = customEnd.getTime() - customStart.getTime()
      endDate = new Date(customStart.getTime() - 1) // Un día antes del inicio
      startDate = new Date(endDate.getTime() - duration)
    } else {
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
  }, [invoices, dateRange, customStartDate, customEndDate])

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
      // Calcular factor de descuento para distribuir proporcionalmente a cada item
      // Si la factura tiene descuento, lo distribuimos entre los productos
      const invoiceSubtotal = invoice.items?.reduce((sum, item) => {
        const itemPrice = item.unitPrice || item.price || 0
        const quantity = item.quantity || 0
        return sum + (item.subtotal || (quantity * itemPrice))
      }, 0) || 0

      const invoiceTotal = invoice.total || invoiceSubtotal
      const discountFactor = invoiceSubtotal > 0 ? invoiceTotal / invoiceSubtotal : 1

      invoice.items?.forEach(item => {
        // Soportar tanto 'name' como 'description' y tanto 'unitPrice' como 'price'
        const itemName = item.name || item.description
        const itemPrice = item.unitPrice || item.price || 0
        const productId = item.productId || item.id
        const quantity = item.quantity || 0
        const key = itemName

        if (!productSales[key]) {
          productSales[key] = {
            name: itemName,
            productId: productId,
            quantity: 0,
            revenue: 0,
            cost: 0,
          }
        }
        productSales[key].quantity += quantity
        // Aplicar descuento proporcional al revenue del item
        const itemSubtotal = item.subtotal || (quantity * itemPrice)
        const itemRevenue = itemSubtotal * discountFactor
        // Redondear a 2 decimales para evitar errores de punto flotante
        productSales[key].revenue = Number((productSales[key].revenue + itemRevenue).toFixed(2))

        // Calcular costo del producto (mismo cálculo que utilidad total)
        let itemCost = 0
        const recipe = recipes.find(r => r.productId === productId)
        if (recipe) {
          // Usar costo de la receta (para productos elaborados)
          itemCost = (recipe.totalCost || 0) * quantity
        } else {
          // Si no tiene receta, buscar costo del producto
          const product = products.find(p => p.id === productId)
          itemCost = (product?.cost || 0) * quantity
        }
        productSales[key].cost = Number((productSales[key].cost + itemCost).toFixed(2))
      })
    })

    // Calcular utilidad y margen para cada producto
    return Object.values(productSales)
      .map(product => ({
        ...product,
        profit: Number((product.revenue - product.cost).toFixed(2)),
        profitMargin: product.revenue > 0 ? ((product.revenue - product.cost) / product.revenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      // Sin límite - mostrar todos los productos
  }, [filteredInvoices, products, recipes])

  // Ventas por categoría
  const salesByCategory = useMemo(() => {
    const categoryStats = {}

    // Función para obtener nombre de categoría
    const getCategoryName = (categoryId) => {
      if (!categoryId) return 'Sin categoría'
      const category = productCategories.find(c => c.id === categoryId)
      return category?.name || categoryId
    }

    filteredInvoices.forEach(invoice => {
      // Calcular factor de descuento para distribuir proporcionalmente a cada item
      const invoiceSubtotal = invoice.items?.reduce((sum, item) => {
        const itemPrice = item.unitPrice || item.price || 0
        const quantity = item.quantity || 0
        return sum + (item.subtotal || (quantity * itemPrice))
      }, 0) || 0

      const invoiceTotal = invoice.total || invoiceSubtotal
      const discountFactor = invoiceSubtotal > 0 ? invoiceTotal / invoiceSubtotal : 1

      invoice.items?.forEach(item => {
        const productId = item.productId || item.id
        const quantity = item.quantity || 0
        const itemPrice = item.unitPrice || item.price || 0
        // Aplicar descuento proporcional
        const itemSubtotal = item.subtotal || (quantity * itemPrice)
        const itemRevenue = itemSubtotal * discountFactor

        // Buscar el producto para obtener su categoría
        const product = products.find(p => p.id === productId)
        const categoryId = product?.category
        const categoryName = getCategoryName(categoryId)

        if (!categoryStats[categoryName]) {
          categoryStats[categoryName] = {
            name: categoryName,
            quantity: 0,
            revenue: 0,
            cost: 0,
            itemCount: 0
          }
        }

        categoryStats[categoryName].quantity += quantity
        categoryStats[categoryName].revenue = Number((categoryStats[categoryName].revenue + itemRevenue).toFixed(2))
        categoryStats[categoryName].itemCount += 1

        // Calcular costo
        let itemCost = 0
        const recipe = recipes.find(r => r.productId === productId)
        if (recipe) {
          itemCost = (recipe.totalCost || 0) * quantity
        } else if (product) {
          itemCost = (product.cost || 0) * quantity
        }
        categoryStats[categoryName].cost = Number((categoryStats[categoryName].cost + itemCost).toFixed(2))
      })
    })

    return Object.values(categoryStats)
      .map(cat => ({
        ...cat,
        profit: Number((cat.revenue - cat.cost).toFixed(2)),
        profitMargin: cat.revenue > 0 ? ((cat.revenue - cat.cost) / cat.revenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredInvoices, products, recipes, productCategories])

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
      // Sin límite - mostrar todos los clientes
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
      // Priorizar paymentHistory (ventas al crédito o parciales pagadas)
      if (invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
        invoice.paymentHistory.forEach(payment => {
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
      } else if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        // Ventas normales con array payments
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
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return []
      }
      const startDate = parseLocalDate(customStartDate)
      const endDate = parseLocalDate(customEndDate)
      const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))

      // Si el rango es menor a 60 días, agrupar por día; sino por mes
      if (diffDays <= 60) {
        groupBy = 'day'
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const date = new Date(d)
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          periodsData[key] = {
            period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            revenue: 0,
            count: 0,
          }
        }
      } else {
        groupBy = 'month'
        // Obtener todos los meses en el rango
        const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        const lastDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        while (currentDate <= lastDate) {
          const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
          periodsData[key] = {
            period: currentDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
            revenue: 0,
            count: 0,
          }
          currentDate.setMonth(currentDate.getMonth() + 1)
        }
      }
    } else if (dateRange === 'week') {
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
  }, [filteredInvoices, dateRange, customStartDate, customEndDate, invoices])

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
      name: product.name && product.name.length > 12 ? product.name.substring(0, 12) + '...' : (product.name || 'Producto'),
      fullName: product.name || 'Producto',
      ventas: product.revenue,
      cantidad: product.quantity,
      color: COLORS[index % COLORS.length]
    }))
  }, [topProducts])

  // Datos para gráfico de categorías top 5
  const top5CategoriesData = useMemo(() => {
    return salesByCategory.slice(0, 5).map((category, index) => ({
      name: category.name && category.name.length > 12 ? category.name.substring(0, 12) + '...' : (category.name || 'Sin categoría'),
      fullName: category.name || 'Sin categoría',
      ventas: category.revenue,
      cantidad: category.quantity,
      color: COLORS[index % COLORS.length]
    }))
  }, [salesByCategory])

  // ========== CÁLCULOS DE GASTOS ==========

  // Filtrar gastos por rango de fecha
  const filteredExpenses = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    // Para fechas personalizadas
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return expenses
      }
      const startDate = parseLocalDate(customStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = parseLocalDate(customEndDate)
      endDate.setHours(23, 59, 59, 999)

      return expenses.filter(expense => {
        if (!expense.date) return false
        const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)
        return expenseDate >= startDate && expenseDate <= endDate
      })
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
        return expenses
      default:
        return expenses
    }

    return expenses.filter(expense => {
      if (!expense.date) return false
      const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)
      return expenseDate >= filterDate
    })
  }, [expenses, dateRange, customStartDate, customEndDate])

  // Filtrar compras por rango de fecha (para rentabilidad)
  const filteredPurchases = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    // Para fechas personalizadas
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return purchases
      }
      const startDate = parseLocalDate(customStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = parseLocalDate(customEndDate)
      endDate.setHours(23, 59, 59, 999)

      return purchases.filter(purchase => {
        if (!purchase.createdAt) return false
        const purchaseDate = purchase.createdAt.toDate ? purchase.createdAt.toDate() : new Date(purchase.createdAt)
        return purchaseDate >= startDate && purchaseDate <= endDate
      })
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
        return purchases
      default:
        return purchases
    }

    return purchases.filter(purchase => {
      if (!purchase.createdAt) return false
      const purchaseDate = purchase.createdAt.toDate ? purchase.createdAt.toDate() : new Date(purchase.createdAt)
      return purchaseDate >= filterDate
    })
  }, [purchases, dateRange, customStartDate, customEndDate])

  // Estadísticas de compras (costo de ventas)
  const purchaseStats = useMemo(() => {
    const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0)
    const purchaseCount = filteredPurchases.length
    return {
      total: totalPurchases,
      count: purchaseCount
    }
  }, [filteredPurchases])

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

    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return []
      }
      const startDate = parseLocalDate(customStartDate)
      const endDate = parseLocalDate(customEndDate)
      const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))

      if (diffDays <= 60) {
        groupBy = 'day'
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const date = new Date(d)
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          periodsData[key] = {
            period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            gastos: 0,
            count: 0,
          }
        }
      } else {
        groupBy = 'month'
        const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        const lastDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        while (currentDate <= lastDate) {
          const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
          periodsData[key] = {
            period: currentDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
            gastos: 0,
            count: 0,
          }
          currentDate.setMonth(currentDate.getMonth() + 1)
        }
      }
    } else if (dateRange === 'week') {
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
  }, [filteredExpenses, dateRange, customStartDate, customEndDate])

  // ========== DATOS COMBINADOS PARA RENTABILIDAD ==========

  // Combinar ingresos y gastos por período para el gráfico de rentabilidad
  const profitabilityByPeriod = useMemo(() => {
    // Crear un mapa combinado de períodos
    const combinedData = {}

    // Agregar datos de ventas
    salesByPeriod.forEach((sale, index) => {
      if (!combinedData[index]) {
        combinedData[index] = {
          period: sale.period,
          ingresos: 0,
          gastos: 0,
          utilidad: 0
        }
      }
      combinedData[index].ingresos = sale.revenue || 0
    })

    // Agregar datos de gastos
    expensesByPeriod.forEach((expense, index) => {
      if (!combinedData[index]) {
        combinedData[index] = {
          period: expense.period,
          ingresos: 0,
          gastos: 0,
          utilidad: 0
        }
      }
      combinedData[index].gastos = expense.gastos || 0
    })

    // Calcular utilidad neta
    Object.keys(combinedData).forEach(key => {
      combinedData[key].utilidad = combinedData[key].ingresos - combinedData[key].gastos
    })

    return Object.values(combinedData)
  }, [salesByPeriod, expensesByPeriod])

  // Filtrar movimientos financieros y de caja por fecha
  const filteredOtherMovements = useMemo(() => {
    const now = new Date()
    const filterDate = new Date()

    // Función para verificar si un movimiento está en el rango de fechas
    const isInDateRange = (movement) => {
      // Obtener fecha del movimiento
      let movementDate
      if (movement.date?.toDate) {
        movementDate = movement.date.toDate()
      } else if (movement.createdAt?.toDate) {
        movementDate = movement.createdAt.toDate()
      } else if (movement.date) {
        movementDate = new Date(movement.date)
      } else if (movement.createdAt) {
        movementDate = new Date(movement.createdAt)
      } else {
        return false
      }

      if (dateRange === 'custom') {
        if (!customStartDate || !customEndDate) return true
        const startDate = parseLocalDate(customStartDate)
        startDate.setHours(0, 0, 0, 0)
        const endDate = parseLocalDate(customEndDate)
        endDate.setHours(23, 59, 59, 999)
        return movementDate >= startDate && movementDate <= endDate
      }

      const periodStart = new Date(filterDate)
      switch (dateRange) {
        case 'week':
          periodStart.setDate(now.getDate() - 7)
          break
        case 'month':
          periodStart.setMonth(now.getMonth() - 1)
          break
        case 'quarter':
          periodStart.setMonth(now.getMonth() - 3)
          break
        case 'year':
          periodStart.setFullYear(now.getFullYear() - 1)
          break
        case 'all':
          return true
        default:
          periodStart.setMonth(now.getMonth() - 1)
      }
      return movementDate >= periodStart
    }

    // Función para filtrar por sucursal
    const filterByBranch = (movement) => {
      if (filterBranch === 'all') return true
      if (filterBranch === 'main') {
        return !movement.branchId
      }
      return movement.branchId === filterBranch
    }

    // Filtrar movimientos financieros (Aporte Capital, Venta Activo, Retiro Dueño, etc.)
    const filteredFinancial = financialMovements.filter(m => isInDateRange(m) && filterByBranch(m))

    // Filtrar movimientos de caja (Otros Ingresos, Préstamos, etc.) - Solo los que NO tienen sessionId
    // Los que tienen sessionId son del Control de Caja diario y no deben duplicarse aquí
    const filteredCash = cashMovements.filter(m => !m.sessionId && isInDateRange(m) && filterByBranch(m))

    // Calcular totales de otros ingresos
    const otrosIngresosFinancial = filteredFinancial
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    const otrosIngresosCash = filteredCash
      .filter(m => m.type === 'income')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    // Calcular totales de otros egresos
    const otrosEgresosFinancial = filteredFinancial
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    const otrosEgresosCash = filteredCash
      .filter(m => m.type === 'expense')
      .reduce((sum, m) => sum + (m.amount || 0), 0)

    return {
      otrosIngresos: otrosIngresosFinancial + otrosIngresosCash,
      otrosEgresos: otrosEgresosFinancial + otrosEgresosCash,
      detalleIngresos: [
        ...filteredFinancial.filter(m => m.type === 'income'),
        ...filteredCash.filter(m => m.type === 'income')
      ],
      detalleEgresos: [
        ...filteredFinancial.filter(m => m.type === 'expense'),
        ...filteredCash.filter(m => m.type === 'expense')
      ]
    }
  }, [financialMovements, cashMovements, dateRange, customStartDate, customEndDate, filterBranch])

  // Estadísticas de rentabilidad
  const profitabilityStats = useMemo(() => {
    const totalVentas = stats.totalRevenue
    const costoVentas = purchaseStats.total // Costo de los productos (compras)
    const totalGastos = expenseStats.total // Gastos operativos

    // Utilidad Bruta = Ventas - Costo de Ventas
    const utilidadBruta = totalVentas - costoVentas

    // Utilidad Operativa (Neta) = Utilidad Bruta - Gastos Operativos
    const utilidadOperativa = utilidadBruta - totalGastos

    // Otros ingresos y egresos del flujo de caja
    const otrosIngresos = filteredOtherMovements.otrosIngresos
    const otrosEgresos = filteredOtherMovements.otrosEgresos

    // Utilidad Total = Utilidad Operativa + Otros Ingresos - Otros Egresos
    const utilidadTotal = utilidadOperativa + otrosIngresos - otrosEgresos

    // Margen Bruto (%) = Utilidad Bruta / Ventas
    const margenBruto = totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0

    // Margen Operativo (%) = Utilidad Operativa / Ventas
    const margenOperativo = totalVentas > 0 ? (utilidadOperativa / totalVentas) * 100 : 0

    // Margen Neto (%) = Utilidad Operativa / Ventas (mantener compatibilidad)
    const margenNeto = margenOperativo

    // Calcular ratio gastos/ingresos (solo gastos operativos)
    const ratioGastos = totalVentas > 0 ? (totalGastos / totalVentas) * 100 : 0

    // Ratio costo de ventas
    const ratioCostoVentas = totalVentas > 0 ? (costoVentas / totalVentas) * 100 : 0

    return {
      totalVentas,
      totalIngresos: totalVentas, // Mantener compatibilidad
      costoVentas,
      utilidadBruta,
      totalGastos,
      utilidadNeta: utilidadOperativa, // Mantener compatibilidad (antes era utilidadNeta)
      utilidadOperativa,
      otrosIngresos,
      otrosEgresos,
      utilidadTotal,
      margenBruto,
      margenNeto,
      margenOperativo,
      ratioGastos,
      ratioCostoVentas,
      detalleOtrosIngresos: filteredOtherMovements.detalleIngresos,
      detalleOtrosEgresos: filteredOtherMovements.detalleEgresos
    }
  }, [stats.totalRevenue, purchaseStats.total, expenseStats.total, filteredOtherMovements])

  // Determinar nombre de sucursal para los reportes Excel
  const getBranchLabel = () => {
    if (filterBranch === 'main') return 'Sucursal Principal'
    if (filterBranch !== 'all') {
      const branch = branches.find(b => b.id === filterBranch)
      return branch ? branch.name : null
    }
    return null
  }

  // Función para exportar reporte de rentabilidad
  const exportProfitabilityReport = async () => {
    const branchLabel = getBranchLabel()
    // Hoja 1: Resumen con fórmula completa
    const summaryData = [
      { 'Concepto': 'Sucursal', 'Valor': branchLabel || 'Todas' },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'Total Ventas', 'Valor': profitabilityStats.totalVentas },
      { 'Concepto': 'Costo de Ventas (Compras)', 'Valor': profitabilityStats.costoVentas },
      { 'Concepto': 'Utilidad Bruta', 'Valor': profitabilityStats.utilidadBruta },
      { 'Concepto': 'Margen Bruto (%)', 'Valor': profitabilityStats.margenBruto.toFixed(2) + '%' },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'Total Gastos Operativos', 'Valor': profitabilityStats.totalGastos },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'Utilidad Operativa', 'Valor': profitabilityStats.utilidadOperativa },
      { 'Concepto': 'Margen Operativo (%)', 'Valor': profitabilityStats.margenOperativo.toFixed(2) + '%' },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'Otros Ingresos (Flujo de Caja)', 'Valor': profitabilityStats.otrosIngresos },
      { 'Concepto': 'Otros Egresos (Flujo de Caja)', 'Valor': profitabilityStats.otrosEgresos },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'UTILIDAD TOTAL', 'Valor': profitabilityStats.utilidadTotal },
      { 'Concepto': '---', 'Valor': '---' },
      { 'Concepto': 'Fórmula:', 'Valor': 'Utilidad Operativa + Otros Ingresos - Otros Egresos = Utilidad Total' },
    ]

    // Hoja 2: Detalle por período
    const detailData = profitabilityByPeriod.map(p => ({
      'Período': p.period,
      'Ventas': p.ingresos,
      'Gastos': p.gastos,
      'Utilidad': p.utilidad,
      'Margen (%)': p.ingresos > 0 ? ((p.utilidad / p.ingresos) * 100).toFixed(2) + '%' : '0%'
    }))

    // Agregar fila de totales
    detailData.push({
      'Período': 'TOTAL',
      'Ventas': profitabilityStats.totalVentas,
      'Gastos': profitabilityStats.totalGastos,
      'Utilidad': profitabilityStats.utilidadNeta,
      'Margen (%)': profitabilityStats.margenNeto.toFixed(2) + '%'
    })

    const wb = XLSX.utils.book_new()
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    const wsDetail = XLSX.utils.json_to_sheet(detailData)

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle por Período')

    const dateRangeText = {
      week: 'ultima_semana',
      month: 'ultimo_mes',
      quarter: 'ultimo_trimestre',
      year: 'ultimo_año',
      all: 'todo'
    }[dateRange] || 'periodo'

    await exportExcelFile(wb, `reporte_rentabilidad_${dateRangeText}.xlsx`)
  }

  // Función para exportar reporte de gastos
  const exportExpensesReport = async () => {
    const branchLabel = getBranchLabel()
    const headerData = [
      { 'Fecha': 'Sucursal:', 'Descripción': branchLabel || 'Todas', 'Categoría': '', 'Proveedor': '', 'Referencia': '', 'Método de Pago': '', 'Monto': '' },
      { 'Fecha': '', 'Descripción': '', 'Categoría': '', 'Proveedor': '', 'Referencia': '', 'Método de Pago': '', 'Monto': '' },
    ]
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

    const ws = XLSX.utils.json_to_sheet([...headerData, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos')

    const dateRangeText = {
      week: 'ultima_semana',
      month: 'ultimo_mes',
      quarter: 'ultimo_trimestre',
      year: 'ultimo_año',
      all: 'todo'
    }[dateRange] || 'periodo'

    await exportExcelFile(wb, `reporte_gastos_${dateRangeText}.xlsx`)
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
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
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
                <option value="main">Sucursal Principal</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}
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
            <option value="custom">Personalizado</option>
          </Select>
          {dateRange === 'custom' && (
            <>
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                  title="Desde"
                />
              </div>
              <span className="hidden sm:inline text-gray-500">-</span>
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
                <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
                  title="Hasta"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs de reportes */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedReport('overview')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'overview'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline-block mr-2" />
          Resumen General
        </button>
        <button
          onClick={() => setSelectedReport('sales')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'sales'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline-block mr-2" />
          Ventas
        </button>
        <button
          onClick={() => setSelectedReport('products')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'products'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <Package className="w-4 h-4 inline-block mr-2" />
          Productos
        </button>
        <button
          onClick={() => setSelectedReport('customers')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'customers'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <Users className="w-4 h-4 inline-block mr-2" />
          Clientes
        </button>
        <button
          onClick={() => setSelectedReport('sellers')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'sellers'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <Users className="w-4 h-4 inline-block mr-2" />
          Vendedores
        </button>
        {/* Tab de Gastos - solo visible si tiene el feature */}
        {hasFeature && hasFeature('expenseManagement') && (
          <button
            onClick={() => setSelectedReport('expenses')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
              selectedReport === 'expenses'
                ? 'bg-red-600 text-white border border-red-700'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            <Receipt className="w-4 h-4 inline-block mr-2" />
            Gastos
          </button>
        )}
        {/* Tab de Rentabilidad - solo visible si tiene el feature de gastos */}
        {hasFeature && hasFeature('expenseManagement') && (
          <button
            onClick={() => setSelectedReport('profitability')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
              selectedReport === 'profitability'
                ? 'bg-emerald-600 text-white border border-emerald-700'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline-block mr-2" />
            Rentabilidad
          </button>
        )}
      </div>

      {/* Resumen General */}
      {selectedReport === 'overview' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={async () => await exportGeneralReport({ stats, salesByMonth: salesByPeriod, topProducts, topCustomers, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
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
                  {dateRange === 'custom' && customStartDate && customEndDate && ` (${customStartDate} al ${customEndDate})`}
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
              onClick={async () => await exportSalesReport({ stats, salesByMonth: salesByPeriod, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
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
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {filteredInvoices.slice(0, 20).map(invoice => {
                  let paymentMethods = 'Efectivo'
                  if (invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
                    paymentMethods = invoice.paymentHistory.length === 1 ? (invoice.paymentHistory[0].method || 'Efectivo') : 'Múltiples'
                  } else if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
                    paymentMethods = invoice.payments.length === 1 ? (invoice.payments[0].method || 'Efectivo') : 'Múltiples'
                  } else if (invoice.paymentMethod) {
                    paymentMethods = invoice.paymentMethod
                  }
                  return (
                    <div key={invoice.id} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{invoice.number}</p>
                          <p className="text-sm text-gray-600">{invoice.customer?.name || 'Cliente General'}</p>
                        </div>
                        <p className="font-bold text-gray-900">{formatCurrency(invoice.total)}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={invoice.documentType === 'factura' ? 'primary' : 'default'}>
                          {invoice.documentType === 'factura' ? 'Factura' : 'Boleta'}
                        </Badge>
                        <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'pending' ? 'warning' : 'default'}>
                          {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                        </Badge>
                        <Badge variant="default">{paymentMethods}</Badge>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-gray-500">
                          {invoice.createdAt ? formatDate(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt) : '-'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-green-600">+{formatCurrency(invoice.profit || 0)}</span>
                          <span className={`font-medium ${(invoice.profitMargin || 0) >= 30 ? 'text-green-600' : (invoice.profitMargin || 0) >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {(invoice.profitMargin || 0).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
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
                      // Obtener métodos de pago - priorizar paymentHistory
                      let paymentMethods = 'Efectivo'
                      if (invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
                        if (invoice.paymentHistory.length === 1) {
                          paymentMethods = invoice.paymentHistory[0].method || 'Efectivo'
                        } else {
                          paymentMethods = 'Múltiples'
                        }
                      } else if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
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
              onClick={async () => await exportProductsReport({ topProducts, salesByCategory, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Productos (Excel)
            </button>
          </div>

          {/* Gráficos de Top 5 Productos y Categorías */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico de Top 5 Productos */}
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Productos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={top5ProductsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="ventas" fill={COLORS[0]} name="Ventas" radius={[8, 8, 0, 0]}>
                      {top5ProductsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Top 5 Categorías */}
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Categorías</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={top5CategoriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="ventas" fill={COLORS[1]} name="Ventas" radius={[8, 8, 0, 0]}>
                      {top5CategoriesData.map((entry, index) => (
                        <Cell key={`cell-cat-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de productos */}
          <Card>
            <CardHeader>
              <CardTitle>Todos los Productos Vendidos</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {topProducts.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de productos en este período</p>
                ) : (
                  topProducts.map((product, index) => (
                    <div key={index} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-200 text-gray-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-gray-900">{product.name}</span>
                        </div>
                        <span className="font-bold text-gray-900">{formatCurrency(product.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-gray-500">{product.quantity.toFixed(2)} uds</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${product.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            +{formatCurrency(product.profit)}
                          </span>
                          <span className={`font-medium ${product.profitMargin >= 30 ? 'text-green-600' : product.profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {product.profitMargin.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posición</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
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
                          <TableCell className="text-right text-gray-600">
                            {formatCurrency(product.cost)}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${product.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(product.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              product.profitMargin >= 30
                                ? 'text-green-600'
                                : product.profitMargin >= 15
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {product.profitMargin.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Tabla de ventas por categoría */}
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {salesByCategory.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de categorías en este período</p>
                ) : (
                  salesByCategory.map((category, index) => (
                    <div key={index} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{category.name}</span>
                        <span className="font-bold text-gray-900">{formatCurrency(category.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-gray-500">{category.itemCount} ventas · {category.quantity.toFixed(0)} uds</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${category.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            +{formatCurrency(category.profit)}
                          </span>
                          <span className={`font-medium ${category.profitMargin >= 30 ? 'text-green-600' : category.profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {category.profitMargin.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesByCategory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No hay datos de categorías en este período
                        </TableCell>
                      </TableRow>
                    ) : (
                      salesByCategory.map((category, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{category.name}</TableCell>
                          <TableCell className="text-right">{category.itemCount}</TableCell>
                          <TableCell className="text-right">{category.quantity.toFixed(0)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(category.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {formatCurrency(category.cost)}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${category.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(category.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              category.profitMargin >= 30
                                ? 'text-green-600'
                                : category.profitMargin >= 15
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {category.profitMargin.toFixed(1)}%
                            </span>
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
              onClick={async () => await exportCustomersReport({ topCustomers, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
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
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {topCustomers.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de clientes</p>
                ) : (
                  topCustomers.map((customer, index) => (
                    <div key={customer.id} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-200 text-gray-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-gray-900">{customer.name}</span>
                        </div>
                        <span className="font-bold text-gray-900">{formatCurrency(customer.totalSpent || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant={customer.documentType === '6' ? 'primary' : 'default'}>
                            {customer.documentType === '6' ? 'RUC' : 'DNI'}
                          </Badge>
                          <span className="text-gray-500">{customer.documentNumber}</span>
                        </div>
                        <div className="inline-flex items-center justify-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          <span className="text-xs font-semibold">{customer.ordersCount || 0} pedidos</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
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
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {sellerStats.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de vendedores</p>
                ) : (
                  sellerStats.map((seller, index) => (
                    <div key={seller.id} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-200 text-gray-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{seller.name}</p>
                            {seller.email && <p className="text-xs text-gray-500">{seller.email}</p>}
                          </div>
                        </div>
                        <span className="font-bold text-green-600">{formatCurrency(seller.totalRevenue)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <div className="inline-flex items-center justify-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          <span className="text-xs font-semibold">{seller.salesCount} ventas</span>
                        </div>
                        <Badge variant="primary">{seller.facturas} F</Badge>
                        <Badge variant="default">{seller.boletas} B</Badge>
                        {seller.notasCredito > 0 && <Badge variant="warning">{seller.notasCredito} NC</Badge>}
                        {seller.notasDebito > 0 && <Badge variant="danger">{seller.notasDebito} ND</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
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
                  {dateRange === 'custom' && customStartDate && customEndDate && ` (${customStartDate} al ${customEndDate})`}
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
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {filteredExpenses.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay gastos registrados en este período</p>
                ) : (
                  filteredExpenses.slice(0, 20).map(expense => {
                    const category = EXPENSE_CATEGORIES.find(c => c.id === expense.category)
                    return (
                      <div key={expense.id} className="bg-white border rounded-lg px-4 py-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{expense.description}</p>
                            {expense.reference && <p className="text-xs text-gray-500">Ref: {expense.reference}</p>}
                          </div>
                          <span className="font-bold text-red-600">{formatCurrency(expense.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="default">{category?.name || expense.category}</Badge>
                          <span className="text-sm text-gray-500 capitalize">{expense.paymentMethod || 'Efectivo'}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                          <span>{expense.date instanceof Date ? expense.date.toLocaleDateString('es-PE') : new Date(expense.date).toLocaleDateString('es-PE')}</span>
                          {expense.supplier && <span>{expense.supplier}</span>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
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

      {/* Reporte de Rentabilidad */}
      {selectedReport === 'profitability' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={exportProfitabilityReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Rentabilidad (Excel)
            </button>
          </div>

          {/* KPIs de Rentabilidad - Fórmula: Ventas - Costo de Ventas - Gastos = Utilidad Neta */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Fila 1: Ventas, Costo de Ventas, Utilidad Bruta */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Ventas</p>
                    <p className="text-2xl font-bold text-blue-600 mt-2">
                      {formatCurrency(profitabilityStats.totalVentas)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {stats.totalInvoices} ventas
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Costo de Ventas</p>
                    <p className="text-2xl font-bold text-orange-600 mt-2">
                      {formatCurrency(profitabilityStats.costoVentas)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {purchaseStats.count} compras
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <ShoppingCart className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Utilidad Bruta</p>
                    <p className={`text-2xl font-bold mt-2 ${profitabilityStats.utilidadBruta >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                      {formatCurrency(profitabilityStats.utilidadBruta)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Ventas - Costo ({profitabilityStats.margenBruto.toFixed(1)}%)
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${profitabilityStats.utilidadBruta >= 0 ? 'bg-teal-100' : 'bg-red-100'}`}>
                    <BarChart3 className={`w-6 h-6 ${profitabilityStats.utilidadBruta >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Fila 2: Gastos, Utilidad Neta, Margen Neto */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Gastos</p>
                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {formatCurrency(profitabilityStats.totalGastos)}
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

            <Card className={`border-2 ${profitabilityStats.utilidadOperativa >= 0 ? 'border-teal-300' : 'border-red-300'}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Utilidad Operativa</p>
                    <p className={`text-2xl font-bold mt-2 ${profitabilityStats.utilidadOperativa >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                      {formatCurrency(profitabilityStats.utilidadOperativa)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      U. Bruta - Gastos ({profitabilityStats.margenOperativo.toFixed(1)}%)
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${profitabilityStats.utilidadOperativa >= 0 ? 'bg-teal-100' : 'bg-red-100'}`}>
                    <DollarSign className={`w-6 h-6 ${profitabilityStats.utilidadOperativa >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Margen Operativo</p>
                    <p className={`text-2xl font-bold mt-2 ${profitabilityStats.margenOperativo >= 20 ? 'text-emerald-600' : profitabilityStats.margenOperativo >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {profitabilityStats.margenOperativo.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Utilidad Operativa / Ventas
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${profitabilityStats.margenOperativo >= 20 ? 'bg-emerald-100' : profitabilityStats.margenOperativo >= 0 ? 'bg-yellow-100' : 'bg-red-100'}`}>
                    <PieChart className={`w-6 h-6 ${profitabilityStats.margenOperativo >= 20 ? 'text-emerald-600' : profitabilityStats.margenOperativo >= 0 ? 'text-yellow-600' : 'text-red-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumen de fórmula operativa */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <span className="font-semibold text-blue-600">{formatCurrency(profitabilityStats.totalVentas)}</span>
                <span className="text-gray-400">−</span>
                <span className="font-semibold text-orange-600">{formatCurrency(profitabilityStats.costoVentas)}</span>
                <span className="text-gray-400">−</span>
                <span className="font-semibold text-red-600">{formatCurrency(profitabilityStats.totalGastos)}</span>
                <span className="text-gray-400">=</span>
                <span className={`font-bold ${profitabilityStats.utilidadOperativa >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                  {formatCurrency(profitabilityStats.utilidadOperativa)}
                </span>
                <span className="text-gray-500 ml-2">(Utilidad Operativa)</span>
              </div>
            </CardContent>
          </Card>

          {/* Sección de Otros Ingresos/Egresos - Solo mostrar si hay movimientos */}
          {(profitabilityStats.otrosIngresos > 0 || profitabilityStats.otrosEgresos > 0) && (
            <>
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Otros Ingresos y Egresos (Flujo de Caja)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Otros Ingresos */}
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-green-700">Otros Ingresos</p>
                          <p className="text-2xl font-bold text-green-600 mt-2">
                            +{formatCurrency(profitabilityStats.otrosIngresos)}
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            {profitabilityStats.detalleOtrosIngresos?.length || 0} movimientos
                          </p>
                        </div>
                        <div className="p-3 bg-green-100 rounded-lg">
                          <ArrowUpRight className="w-6 h-6 text-green-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Otros Egresos */}
                  <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-red-700">Otros Egresos</p>
                          <p className="text-2xl font-bold text-red-600 mt-2">
                            -{formatCurrency(profitabilityStats.otrosEgresos)}
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            {profitabilityStats.detalleOtrosEgresos?.length || 0} movimientos
                          </p>
                        </div>
                        <div className="p-3 bg-red-100 rounded-lg">
                          <ArrowDownRight className="w-6 h-6 text-red-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Utilidad Total */}
                  <Card className={`border-2 ${profitabilityStats.utilidadTotal >= 0 ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50'}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">UTILIDAD TOTAL</p>
                          <p className={`text-2xl font-bold mt-2 ${profitabilityStats.utilidadTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(profitabilityStats.utilidadTotal)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Operativa + Otros Ing. - Otros Egr.
                          </p>
                        </div>
                        <div className={`p-3 rounded-lg ${profitabilityStats.utilidadTotal >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          <DollarSign className={`w-6 h-6 ${profitabilityStats.utilidadTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Fórmula de Utilidad Total */}
                <Card className="bg-emerald-50 mt-4">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                      <span className={`font-semibold ${profitabilityStats.utilidadOperativa >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                        {formatCurrency(profitabilityStats.utilidadOperativa)}
                      </span>
                      <span className="text-gray-400">+</span>
                      <span className="font-semibold text-green-600">{formatCurrency(profitabilityStats.otrosIngresos)}</span>
                      <span className="text-gray-400">−</span>
                      <span className="font-semibold text-red-600">{formatCurrency(profitabilityStats.otrosEgresos)}</span>
                      <span className="text-gray-400">=</span>
                      <span className={`font-bold text-lg ${profitabilityStats.utilidadTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(profitabilityStats.utilidadTotal)}
                      </span>
                      <span className="text-gray-500 ml-2">(Utilidad Total)</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Gráfico Principal: Ingresos vs Gastos */}
          <Card>
            <CardHeader>
              <CardTitle>
                Ingresos vs Gastos
                {dateRange === 'week' && ' (Última Semana)'}
                {dateRange === 'month' && ' (Último Mes)'}
                {dateRange === 'quarter' && ' (Último Trimestre)'}
                {dateRange === 'year' && ' (Último Año)'}
                {dateRange === 'all' && ' (Todo el Período)'}
                {dateRange === 'custom' && customStartDate && customEndDate && ` (${customStartDate} al ${customEndDate})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitabilityByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(label) => `Período: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="ingresos" fill="#3b82f6" name="Ingresos" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" fill="#ef4444" name="Gastos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráficos secundarios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de Utilidad por Período */}
            <Card>
              <CardHeader>
                <CardTitle>Evolución de la Utilidad Neta</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={profitabilityByPeriod}>
                    <defs>
                      <linearGradient id="colorUtilidad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(label) => `Período: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="utilidad"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorUtilidad)"
                      name="Utilidad Neta"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Distribución Ingresos vs Gastos */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución del Ingreso</CardTitle>
              </CardHeader>
              <CardContent>
                {profitabilityStats.totalIngresos > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={[
                          { name: 'Utilidad Neta', value: Math.max(0, profitabilityStats.utilidadNeta), color: '#10b981' },
                          { name: 'Gastos', value: profitabilityStats.totalGastos, color: '#ef4444' },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {[
                          { name: 'Utilidad Neta', value: Math.max(0, profitabilityStats.utilidadNeta), color: '#10b981' },
                          { name: 'Gastos', value: profitabilityStats.totalGastos, color: '#ef4444' },
                        ].filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <p>No hay datos de ingresos disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla de Detalle por Período */}
          <Card>
            <CardHeader>
              <CardTitle>Detalle por Período</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {profitabilityByPeriod.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos disponibles en este período</p>
                ) : (
                  <>
                    {profitabilityByPeriod.map((period, index) => {
                      const margin = period.ingresos > 0 ? (period.utilidad / period.ingresos) * 100 : 0
                      return (
                        <div key={index} className="bg-white border rounded-lg px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{period.period}</span>
                            <span className={`font-bold ${period.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(period.utilidad)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="text-blue-600">+{formatCurrency(period.ingresos)}</span>
                              <span className="text-red-600">-{formatCurrency(period.gastos)}</span>
                            </div>
                            <span className={`font-medium ${margin >= 20 ? 'text-emerald-600' : margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {margin.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Totals Card */}
                    <div className="bg-gray-50 border-2 border-gray-300 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">TOTAL</span>
                        <span className={`font-bold ${profitabilityStats.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatCurrency(profitabilityStats.utilidadNeta)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-blue-700 font-semibold">+{formatCurrency(profitabilityStats.totalIngresos)}</span>
                          <span className="text-red-700 font-semibold">-{formatCurrency(profitabilityStats.totalGastos)}</span>
                        </div>
                        <span className={`font-bold ${profitabilityStats.margenNeto >= 20 ? 'text-emerald-700' : profitabilityStats.margenNeto >= 0 ? 'text-yellow-600' : 'text-red-700'}`}>
                          {profitabilityStats.margenNeto.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Gastos</TableHead>
                      <TableHead className="text-right">Utilidad Neta</TableHead>
                      <TableHead className="text-right">Margen (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityByPeriod.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          No hay datos disponibles en este período
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {profitabilityByPeriod.map((period, index) => {
                          const margin = period.ingresos > 0 ? (period.utilidad / period.ingresos) * 100 : 0
                          return (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{period.period}</TableCell>
                              <TableCell className="text-right text-blue-600 font-semibold">
                                {formatCurrency(period.ingresos)}
                              </TableCell>
                              <TableCell className="text-right text-red-600 font-semibold">
                                {formatCurrency(period.gastos)}
                              </TableCell>
                              <TableCell className={`text-right font-bold ${period.utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(period.utilidad)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-medium ${margin >= 20 ? 'text-emerald-600' : margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {margin.toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {/* Fila de totales */}
                        <TableRow className="bg-gray-50 border-t-2">
                          <TableCell className="font-bold">TOTAL</TableCell>
                          <TableCell className="text-right text-blue-700 font-bold">
                            {formatCurrency(profitabilityStats.totalIngresos)}
                          </TableCell>
                          <TableCell className="text-right text-red-700 font-bold">
                            {formatCurrency(profitabilityStats.totalGastos)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${profitabilityStats.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatCurrency(profitabilityStats.utilidadNeta)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold ${profitabilityStats.margenNeto >= 20 ? 'text-emerald-700' : profitabilityStats.margenNeto >= 0 ? 'text-yellow-600' : 'text-red-700'}`}>
                              {profitabilityStats.margenNeto.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Análisis Comparativo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className={`border-2 ${profitabilityStats.utilidadNeta > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <CardContent className="p-6 text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${profitabilityStats.utilidadNeta > 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {profitabilityStats.utilidadNeta > 0 ? (
                    <TrendingUp className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-8 h-8 text-red-600" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {profitabilityStats.utilidadNeta > 0 ? 'Rentable' : 'En Pérdida'}
                </h3>
                <p className="text-sm text-gray-600 mt-2">
                  {profitabilityStats.utilidadNeta > 0
                    ? `Tu negocio genera ${formatCurrency(profitabilityStats.utilidadNeta)} de utilidad`
                    : `Tu negocio tiene una pérdida de ${formatCurrency(Math.abs(profitabilityStats.utilidadNeta))}`
                  }
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Por cada S/ 100</h3>
                <p className="text-sm text-gray-600 mt-2">
                  De ingresos, gastas S/ {profitabilityStats.ratioGastos.toFixed(0)} y
                  {profitabilityStats.utilidadNeta >= 0
                    ? ` ganas S/ ${(100 - profitabilityStats.ratioGastos).toFixed(0)}`
                    : ` pierdes S/ ${(profitabilityStats.ratioGastos - 100).toFixed(0)}`
                  }
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-purple-200 bg-purple-50">
              <CardContent className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-4">
                  <BarChart3 className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Margen de Utilidad</h3>
                <p className="text-sm text-gray-600 mt-2">
                  {profitabilityStats.margenNeto >= 30
                    ? 'Excelente margen de utilidad'
                    : profitabilityStats.margenNeto >= 20
                    ? 'Buen margen de utilidad'
                    : profitabilityStats.margenNeto >= 10
                    ? 'Margen aceptable, hay espacio de mejora'
                    : profitabilityStats.margenNeto >= 0
                    ? 'Margen bajo, considera optimizar gastos'
                    : 'Necesitas reducir gastos urgentemente'
                  }
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

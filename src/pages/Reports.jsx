import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
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
  Store,
  MapPin,
  BedDouble,
  Search,
  ChevronLeft,
  ChevronRight,
  Tag,
  Award,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useHidePrivateData } from '@/hooks/useHidePrivateData'
import RealEstateReports from './RealEstateReports'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getDocumentTotalInBase, convertToBase } from '@/utils/currency'
import { getInvoices, getRecentInvoices, getCustomersWithStats, getProducts, getProductCategories, getProductBrands, getPurchases, getFinancialMovements, getAllCashMovements } from '@/services/firestoreService'
import { getRecipes } from '@/services/recipeService'
import { getActiveBranches } from '@/services/branchService'
import { getWarehouses } from '@/services/warehouseService'
import { useLocationAccess } from '@/utils/locationAccess'
import {
  exportGeneralReport,
  exportSalesReport,
  exportProductsReport,
  exportBrandsReport,
  exportBrandDetailReport,
  exportCustomersReport,
} from '@/services/reportExportService'
import { getExpenses, EXPENSE_CATEGORIES } from '@/services/expenseService'
import PeruHeatMap from '@/components/PeruHeatMap'
import { getRooms as getHotelRooms, getReservations as getHotelReservations, getAllFolioCharges } from '@/services/hotelService'
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

// Helper: usar emissionDate (fecha de emisión del POS) en vez de createdAt
const getInvoiceDate = (invoice) => {
  if (invoice?.emissionDate) {
    if (invoice.emissionDate.toDate) return invoice.emissionDate.toDate()
    if (typeof invoice.emissionDate === 'string') {
      const createdAt = invoice.createdAt?.toDate?.() || (invoice.createdAt ? new Date(invoice.createdAt) : null)
      if (createdAt) {
        const [year, month, day] = invoice.emissionDate.split('-').map(Number)
        const combined = new Date(createdAt)
        combined.setFullYear(year, month - 1, day)
        return combined
      }
      return new Date(invoice.emissionDate + 'T12:00:00')
    }
    return new Date(invoice.emissionDate)
  }
  if (!invoice?.createdAt) return null
  return invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt)
}

export default function Reports() {
  const { user, isDemoMode, demoData, getBusinessId, hasFeature, businessMode, filterBranchesByAccess, hasMainBranchAccess, allowedBranches, allowedWarehouses, isBusinessOwner, isAdmin, businessSettings } = useAppContext()
  const hidePrivateData = useHidePrivateData()
  // Filtro de seguridad por ubicación (sucursal/almacén) para usuarios secundarios.
  // Debe declararse antes de cualquier return condicional para no romper el orden de hooks.
  const canAccess = useLocationAccess()

  // Si estamos en modo inmobiliaria, renderizar el componente especializado
  if (businessMode === 'real_estate') {
    return <RealEstateReports />
  }

  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [productCategories, setProductCategories] = useState([])
  const [productBrands, setProductBrands] = useState([])
  const [recipes, setRecipes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [financialMovements, setFinancialMovements] = useState([])
  const [cashMovements, setCashMovements] = useState([])
  const [hotelRooms, setHotelRooms] = useState([])
  const [hotelReservations, setHotelReservations] = useState([])
  const [hotelFolioCharges, setHotelFolioCharges] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('month') // week, month, quarter, year, all, custom
  const [selectedReport, setSelectedReport] = useState('overview') // overview, sales, products, customers, expenses
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [productSearch, setProductSearch] = useState('')
  const [productPage, setProductPage] = useState(0)
  const PRODUCTS_PER_PAGE = 25
  // Tab Marcas: búsqueda y paginación independientes
  const [brandSearch, setBrandSearch] = useState('')
  const [brandPage, setBrandPage] = useState(0)
  const BRANDS_PER_PAGE = 25
  // Drill-down de marca: null = vista lista; string = vista detalle de esa marca
  const [selectedBrandName, setSelectedBrandName] = useState(null)
  const [brandDetailSearch, setBrandDetailSearch] = useState('')
  const [brandDetailPage, setBrandDetailPage] = useState(0)
  const BRAND_DETAIL_PER_PAGE = 25
  // Gráfico "evolución por mes" de un producto: nombre seleccionado + métrica.
  const [productChartName, setProductChartName] = useState('')
  const [productChartMetric, setProductChartMetric] = useState('revenue') // 'revenue' | 'quantity'
  const [productChartSearch, setProductChartSearch] = useState('') // texto del buscador de producto
  const [productChartOpen, setProductChartOpen] = useState(false)   // dropdown del buscador abierto
  const productChartRef = useRef(null)

  // Resetear paginación cuando cambian los filtros
  useEffect(() => { setProductPage(0) }, [dateRange, filterBranch, customStartDate, customEndDate])

  // Helper para parsear fecha en zona horaria local (evita problemas con UTC)
  const parseLocalDate = (dateString) => {
    if (!dateString) return null
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  useEffect(() => {
    loadData()
    loadBranches()
    // allowedBranches/allowedWarehouses en deps: si cambian los permisos del usuario,
    // recargar y re-sanear los datos visibles.
  }, [user, allowedBranches, allowedWarehouses])

  // Recargar datos cuando el rango cambia a uno más amplio
  const [loadedRange, setLoadedRange] = useState(null)
  useEffect(() => {
    if (!user?.uid || !loadedRange) return
    const rangeOrder = { today: 0, week: 1, month: 2, quarter: 3, year: 4, custom: 4, all: 5 }
    const currentOrder = rangeOrder[dateRange] ?? 2
    const loadedOrder = rangeOrder[loadedRange] ?? 2
    if (currentOrder > loadedOrder) loadData()
  }, [dateRange])

  // Cargar sucursales y almacenes para filtro
  // (los almacenes se usan para mapear compras → sucursal en el filtro de seguridad)
  const loadBranches = async () => {
    if (!user?.uid || isDemoMode) return
    try {
      const [branchesRes, warehousesRes] = await Promise.all([
        getActiveBranches(getBusinessId()),
        getWarehouses(getBusinessId()),
      ])
      if (branchesRes.success) {
        const branchList = filterBranchesByAccess ? filterBranchesByAccess(branchesRes.data || []) : (branchesRes.data || [])
        setBranches(branchList)
      }
      if (warehousesRes.success) {
        setWarehouses((warehousesRes.data || []).filter(w => w.isActive !== false))
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

      // Cargar facturas: ajustar rango según el filtro seleccionado
      let invoicesFetcher
      if (dateRange === 'all') {
        invoicesFetcher = getInvoices(getBusinessId())
      } else {
        const sinceDate = new Date()
        if (dateRange === 'today' || dateRange === 'week') {
          sinceDate.setDate(sinceDate.getDate() - 14) // 2 semanas (para comparación con período anterior)
        } else if (dateRange === 'month') {
          sinceDate.setMonth(sinceDate.getMonth() - 2) // 2 meses
          sinceDate.setDate(1)
        } else if (dateRange === 'quarter') {
          sinceDate.setMonth(sinceDate.getMonth() - 6)
          sinceDate.setDate(1)
        } else {
          sinceDate.setFullYear(sinceDate.getFullYear() - 2)
          sinceDate.setDate(1)
        }
        sinceDate.setHours(0, 0, 0, 0)
        invoicesFetcher = getRecentInvoices(getBusinessId(), sinceDate)
      }

      // Cargar todo en paralelo
      const promises = [
        invoicesFetcher,
        getCustomersWithStats(getBusinessId()),
        getProducts(getBusinessId()),
        getRecipes(getBusinessId()),
        getProductCategories(getBusinessId()),
        getProductBrands(getBusinessId()),
        getPurchases(getBusinessId()),
        Promise.all([
          getFinancialMovements(getBusinessId()),
          getAllCashMovements(getBusinessId())
        ]),
      ]
      if (hasFeature && hasFeature('expenseManagement')) {
        promises.push(getExpenses(getBusinessId()))
      }

      const results = await Promise.all(promises.map(p => p.catch(err => {
        console.error('Error en carga paralela:', err)
        return { success: false, data: [] }
      })))

      const [invoicesResult, customersResult, productsResult, recipesResult, categoriesResult, brandsResult, purchasesResult, movementsResults] = results

      // Seguridad usuarios secundarios: sanear los conjuntos que van por sucursal (branchId)
      // con el helper compartido. Facturas también traen warehouseId.
      // Las compras NO tienen branchId (su sucursal se deriva del almacén): se filtran
      // en filteredPurchases con allowedWarehouseIds. Los clientes son globales (no se filtran).
      if (invoicesResult.success) setInvoices((invoicesResult.data || []).filter(canAccess))
      if (customersResult.success) setCustomers(customersResult.data || [])
      if (productsResult.success) setProducts(productsResult.data || [])
      if (recipesResult.success) setRecipes(recipesResult.data || [])
      if (categoriesResult.success) setProductCategories(categoriesResult.data || [])
      if (brandsResult?.success) setProductBrands(brandsResult.data || [])
      if (purchasesResult?.success) setPurchases(purchasesResult.data || [])

      // Movimientos financieros y de caja (van por branchId)
      const [financialResult, cashResult] = movementsResults || [{ success: false }, { success: false }]
      if (financialResult?.success) setFinancialMovements((financialResult.data || []).filter(canAccess))
      if (cashResult?.success) setCashMovements((cashResult.data || []).filter(canAccess))

      // Gastos (si se cargaron)
      if (hasFeature && hasFeature('expenseManagement') && results[7]) {
        setExpenses(results[7] || [])
      }

      // Cargar datos de hotel si es modo hotel
      if (businessMode === 'hotel') {
        try {
          const [roomsRes, reservationsRes, chargesRes] = await Promise.all([
            getHotelRooms(getBusinessId()),
            getHotelReservations(getBusinessId()),
            getAllFolioCharges(getBusinessId())
          ])
          if (roomsRes.success) setHotelRooms(roomsRes.data || [])
          if (reservationsRes.success) setHotelReservations(reservationsRes.data || [])
          if (chargesRes.success) setHotelFolioCharges(chargesRes.data || [])
        } catch (error) {
          console.error('Error al cargar datos de hotel:', error)
        }
      }

    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setIsLoading(false)
      setLoadedRange(dateRange)
    }
  }

  // ===== Seguridad por ubicación para COMPRAS =====
  // Las compras no guardan branchId; su sucursal se deriva del almacén (warehouseId).
  // Si solo usáramos canAccess() (que filtra por branchId) un usuario restringido por
  // SUCURSAL no quedaría filtrado. Replicamos el enfoque de CashFlow.jsx:
  // construimos el Set de almacenes permitidos (por sucursal y/o almacén) y filtramos
  // las compras contra él. Compra sin almacén = Sucursal Principal.
  const locationRestricted = !isBusinessOwner && !isAdmin &&
    ((allowedBranches?.length > 0) || (allowedWarehouses?.length > 0))

  const allowedWarehouseIds = useMemo(() => {
    if (!locationRestricted) return null
    const branchRestricted = allowedBranches?.length > 0
    const whRestricted = allowedWarehouses?.length > 0
    return new Set(
      warehouses
        .filter(w => {
          const branchOk = !branchRestricted ? true : (!w.branchId ? hasMainBranchAccess : allowedBranches.includes(w.branchId))
          const whOk = !whRestricted ? true : allowedWarehouses.includes(w.id)
          return branchOk && whOk
        })
        .map(w => w.id)
    )
  }, [warehouses, allowedBranches, allowedWarehouses, hasMainBranchAccess, locationRestricted])

  // ¿El usuario puede ver esta compra según sus permisos? (independiente del filtro de UI)
  const hasPurchaseAccess = useCallback((purchase) => {
    if (!locationRestricted) return true
    const whId = purchase.warehouseId || purchase.items?.[0]?.warehouseId
    if (!whId) return hasMainBranchAccess // compra sin almacén = Sucursal Principal
    return allowedWarehouseIds ? allowedWarehouseIds.has(whId) : true
  }, [locationRestricted, allowedWarehouseIds, hasMainBranchAccess])

  // Función para calcular el costo de un item
  // Aplica `presentationFactor` para que vender por presentación (caja/pack/etc.)
  // no descalibre el costo: `product.cost` está en unidad base, `quantity` está
  // en la unidad de la presentación → multiplicar por el factor da el costo real.
  const calculateItemCost = useCallback((item) => {
    const productId = item.productId || item.id
    const quantity = item.quantity || 0
    const factor = item.presentationFactor || 1

    // Costo congelado al momento de la venta (Fase 2): es el más fiable — no se
    // ve afectado por ediciones posteriores del producto NI por recálculos de
    // receta. Tiene prioridad sobre todo. Ya viene por unidad de `quantity`
    // (incluye el factor de presentación) → no multiplicar por factor.
    if (typeof item.costAtSale === 'number') {
      return item.costAtSale * quantity
    }
    // Fallback receta (ventas previas a Fase 2): costo de la receta actual.
    const recipe = recipes.find(r => r.productId === productId)
    if (recipe) {
      return (recipe.totalCost || 0) * quantity * factor
    }
    // Fallback final: costo ACTUAL del producto en catálogo.
    const product = products.find(p => p.id === productId)
    return (product?.cost || 0) * quantity * factor
  }, [products, recipes])

  // Detecta si un item se agregó como "producto personalizado" en el POS
  // (no existe en el catálogo). Convención del POS: `id: custom-{ts}` para
  // productos libres y `id: appointment-...` para citas veterinarias.
  // Estos items no tienen `cost` registrado → no se puede saber el margen real.
  const isCustomItem = useCallback((item) => {
    const id = item.productId || item.id
    return typeof id === 'string' && (id.startsWith('custom-') || id.startsWith('appointment-'))
  }, [])

  // Filtrar facturas por rango de fecha y calcular costos
  const filteredInvoices = useMemo(() => {
    const now = new Date()
    let filterDate = new Date()

    // Primero filtrar facturas para evitar duplicados:
    // - Excluir notas de venta que ya fueron convertidas a boleta/factura (para no duplicar ingresos)
    // - Excluir documentos anulados (notas de venta, boletas, facturas)
    // - Filtrar por sucursal si está seleccionada
    const validInvoices = invoices.filter(invoice => {
      // Seguridad (defensa adicional): respetar siempre los permisos de ubicación del
      // usuario, sin importar el dropdown de sucursal (que arranca en 'all').
      if (!canAccess(invoice)) return false
      // Comprobantes archivados manualmente desde Ventas: no aparecen en reportes ni totales
      if (invoice.archived === true) {
        return false
      }
      // Si es una nota de venta ya convertida a comprobante, no contar (se cuenta la boleta/factura)
      if (invoice.convertedTo) {
        return false
      }
      // Si el documento está anulado o en proceso de anulación SUNAT, no contar
      // Nota: rechazados por SUNAT (sunatStatus === 'rejected') SÍ se cuentan porque la venta ocurrió
      if (invoice.status === 'cancelled' || invoice.status === 'voided' || invoice.sunatStatus === 'voiding' || invoice.sunatStatus === 'voided') {
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
      let hasCustomItems = false
      let hasCatalogItems = false
      invoice.items?.forEach(item => {
        if (isCustomItem(item)) {
          hasCustomItems = true
        } else {
          hasCatalogItems = true
        }
        totalCost += calculateItemCost(item)
      })
      const profit = (invoice.total || 0) - totalCost
      const profitMargin = invoice.total > 0 ? (profit / invoice.total) * 100 : 0
      // Banderas para la UI: si TODO es personalizado no hay costo registrado;
      // si el margen es muy negativo probablemente el `cost` del producto está
      // descalibrado (cambio de unidad / costo editado a mano / presentación mal).
      const allItemsCustom = hasCustomItems && !hasCatalogItems
      const marginUnreliable = !allItemsCustom && profitMargin < -100
      return {
        ...invoice,
        totalCost,
        profit,
        profitMargin,
        allItemsCustom,
        marginUnreliable,
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
          const invoiceDate = getInvoiceDate(invoice)
          if (!invoiceDate) return false
          return invoiceDate >= startDate && invoiceDate <= endDate
        })
        .map(addCostCalculations)
    }

    switch (dateRange) {
      case 'today':
        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        break
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        // Del 1ero del mes actual hasta hoy
        filterDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        break
      case 'quarter':
        // Últimos 3 meses completos desde el 1ero
        filterDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
        break
      case 'year':
        // Del 1 de enero del año actual hasta hoy
        filterDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
        break
      case 'all':
        return validInvoices.map(addCostCalculations)
      default:
        return validInvoices.map(addCostCalculations)
    }

    return validInvoices
      .filter(invoice => {
        const invoiceDate = getInvoiceDate(invoice)
        if (!invoiceDate) return false
        return invoiceDate >= filterDate
      })
      .map(addCostCalculations)
  }, [invoices, dateRange, customStartDate, customEndDate, calculateItemCost, isCustomItem, filterBranch, canAccess])

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
        case 'today':
          // Ayer
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
          break
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
        const invoiceDate = getInvoiceDate(invoice)
        if (!invoiceDate) return false
        // Excluir anuladas y en proceso de anulación (rechazadas SÍ cuentan)
        if (invoice.status === 'cancelled' || invoice.status === 'voided' || invoice.sunatStatus === 'voiding' || invoice.sunatStatus === 'voided') return false
        if (invoice.convertedTo) return false
        return invoiceDate >= startDate && invoiceDate <= endDate
      })
      .reduce((sum, inv) => sum + getDocumentTotalInBase(inv), 0)
  }, [invoices, dateRange, customStartDate, customEndDate])

  // Calcular estadísticas generales
  // Multi-divisa: las agregaciones siempre se calculan en PEN base usando
  // el TC congelado de cada documento. Si la factura es PEN, getDocumentTotalInBase
  // devuelve el total tal cual; si es USD, lo multiplica por su TC.
  const stats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + getDocumentTotalInBase(inv), 0)
    const paidRevenue = filteredInvoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + getDocumentTotalInBase(inv), 0)
    const pendingRevenue = filteredInvoices
      .filter(inv => inv.status === 'pending')
      .reduce((sum, inv) => sum + getDocumentTotalInBase(inv), 0)

    const totalInvoices = filteredInvoices.length
    const facturas = filteredInvoices.filter(inv => inv.documentType === 'factura').length
    const boletas = filteredInvoices.filter(inv => inv.documentType === 'boleta').length
    const notasVenta = filteredInvoices.filter(inv => inv.documentType === 'nota_venta').length

    const avgTicket = totalInvoices > 0 ? totalRevenue / totalInvoices : 0

    // Calcular utilidad total
    let totalCost = 0
    filteredInvoices.forEach(invoice => {
      invoice.items?.forEach(item => {
        const productId = item.productId || item.id
        const quantity = item.quantity || 0
        const factor = item.presentationFactor || 1

        // Costo congelado al momento de la venta (Fase 2): prioridad sobre todo
        if (typeof item.costAtSale === 'number') {
          totalCost += item.costAtSale * quantity
        } else {
          const recipe = recipes.find(r => r.productId === productId)
          if (recipe) {
            // Fallback receta: costo calculado de ingredientes
            totalCost += (recipe.totalCost || 0) * quantity * factor
          } else {
            // Fallback final: costo actual del producto en catálogo
            const product = products.find(p => p.id === productId)
            totalCost += (product?.cost || 0) * quantity * factor
          }
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
      notasVenta,
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
          const productData = products.find(p => p.id === productId)
          productSales[key] = {
            name: itemName,
            productId: productId,
            // SKU del producto; si no tiene, cae al código de barras (como el
            // reporte detallado de ventas). Busca en el item y en el maestro.
            sku: item.sku || productData?.sku || item.code || productData?.code || '',
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
        const factor = item.presentationFactor || 1
        if (typeof item.costAtSale === 'number') {
          // Costo congelado al momento de la venta (Fase 2): prioridad sobre todo
          itemCost = item.costAtSale * quantity
        } else {
          const recipe = recipes.find(r => r.productId === productId)
          if (recipe) {
            // Fallback receta (productos elaborados)
            itemCost = (recipe.totalCost || 0) * quantity * factor
          } else {
            // Fallback final: costo actual del producto
            const product = products.find(p => p.id === productId)
            itemCost = (product?.cost || 0) * quantity * factor
          }
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

  // Evolución del producto seleccionado por período (POR DÍA o POR MES según el
  // rango, con el MISMO criterio que el gráfico general salesByPeriod): rangos
  // cortos (hoy/semana/mes/custom<=60d) -> por día; el resto -> por mes. Rellena
  // todos los períodos del rango (0 donde no se vendió) para ver bien la curva.
  const productPeriodData = useMemo(() => {
    if (!productChartName) return []
    const now = new Date()
    const periodsData = {}
    let groupBy = 'month'
    const dKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const mKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const dLabel = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const mLabel = (d) => d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
    const addBucket = (key, label) => { if (!periodsData[key]) periodsData[key] = { period: label, ventas: 0, cantidad: 0 } }

    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) return []
      const startDate = parseLocalDate(customStartDate)
      const endDate = parseLocalDate(customEndDate)
      const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
      if (diffDays <= 60) {
        groupBy = 'day'
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) { const x = new Date(d); addBucket(dKey(x), dLabel(x)) }
      } else {
        const c = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        while (c <= last) { addBucket(mKey(c), mLabel(c)); c.setMonth(c.getMonth() + 1) }
      }
    } else if (dateRange === 'today') {
      groupBy = 'day'
      const x = new Date(now.getFullYear(), now.getMonth(), now.getDate()); addBucket(dKey(x), dLabel(x))
    } else if (dateRange === 'week') {
      groupBy = 'day'
      for (let i = 6; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); addBucket(dKey(x), dLabel(x)) }
    } else if (dateRange === 'month') {
      groupBy = 'day'
      const today = now.getDate()
      for (let i = 1; i <= today; i++) { const x = new Date(now.getFullYear(), now.getMonth(), i); addBucket(dKey(x), dLabel(x)) }
    } else if (dateRange === 'quarter') {
      for (let i = 2; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); addBucket(mKey(x), mLabel(x)) }
    } else if (dateRange === 'year') {
      for (let i = 11; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); addBucket(mKey(x), mLabel(x)) }
    } else {
      // 'all': meses con actividad
      invoices.forEach(invoice => { const d = getInvoiceDate(invoice); if (d) addBucket(mKey(d), mLabel(d)) })
    }

    // Sumar las ventas del producto seleccionado en cada período (descuento global
    // distribuido proporcionalmente, igual que topProducts).
    filteredInvoices.forEach(invoice => {
      const d = getInvoiceDate(invoice); if (!d) return
      const key = groupBy === 'day' ? dKey(d) : mKey(d)
      if (!periodsData[key]) return
      const invoiceSubtotal = invoice.items?.reduce((s, it) => s + (it.subtotal || ((it.quantity || 0) * (it.unitPrice || it.price || 0))), 0) || 0
      const invoiceTotal = invoice.total || invoiceSubtotal
      const discountFactor = invoiceSubtotal > 0 ? invoiceTotal / invoiceSubtotal : 1
      invoice.items?.forEach(item => {
        if ((item.name || item.description) !== productChartName) return
        const qty = item.quantity || 0
        const itemSubtotal = item.subtotal || (qty * (item.unitPrice || item.price || 0))
        periodsData[key].ventas = Number((periodsData[key].ventas + itemSubtotal * discountFactor).toFixed(2))
        periodsData[key].cantidad += qty
      })
    })

    return Object.entries(periodsData).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [filteredInvoices, productChartName, dateRange, customStartDate, customEndDate, invoices])

  // Resultados del buscador de producto del gráfico. Limitado a 50 para que
  // funcione fluido en negocios con miles de productos.
  const productChartResults = useMemo(() => {
    const q = productChartSearch.trim().toLowerCase()
    const base = q ? topProducts.filter(p => (p.name || '').toLowerCase().includes(q)) : topProducts
    return base.slice(0, 50)
  }, [topProducts, productChartSearch])

  // Cierra el dropdown del buscador al hacer click fuera. Si el usuario escribió
  // algo pero no eligió, revierte el texto al producto seleccionado.
  useEffect(() => {
    if (!productChartOpen) return
    const onClick = (e) => {
      if (productChartRef.current && !productChartRef.current.contains(e.target)) {
        setProductChartOpen(false)
        setProductChartSearch(productChartName)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [productChartOpen, productChartName])

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
        const factor = item.presentationFactor || 1
        if (typeof item.costAtSale === 'number') {
          itemCost = item.costAtSale * quantity
        } else {
          const recipe = recipes.find(r => r.productId === productId)
          if (recipe) {
            itemCost = (recipe.totalCost || 0) * quantity * factor
          } else if (product) {
            itemCost = (product.cost || 0) * quantity * factor
          }
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

  // Resuelve el nombre de marca de un producto. Prefiere brandId (marca
  // administrada en la tabla productBrands). Fallback al texto libre
  // product.marca para productos legacy todavía no migrados. Si no hay
  // producto o no tiene marca, devuelve 'Sin marca' como categoría virtual.
  // Hoisteado al componente para que el drill-down de marca lo reuse.
  const getBrandName = useCallback((product) => {
    if (!product) return 'Sin marca'
    if (product.brandId) {
      const brand = productBrands.find(b => b.id === product.brandId)
      if (brand) return brand.name
    }
    const raw = String(product.marca || '').trim()
    return raw || 'Sin marca'
  }, [productBrands])

  // Ventas por marca (mismo patrón que ventas por categoría).
  const salesByBrand = useMemo(() => {
    const brandStats = {}

    filteredInvoices.forEach(invoice => {
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
        const itemSubtotal = item.subtotal || (quantity * itemPrice)
        const itemRevenue = itemSubtotal * discountFactor

        const product = products.find(p => p.id === productId)
        const brandName = getBrandName(product)

        if (!brandStats[brandName]) {
          brandStats[brandName] = {
            name: brandName,
            quantity: 0,
            revenue: 0,
            cost: 0,
            itemCount: 0,
          }
        }

        brandStats[brandName].quantity += quantity
        brandStats[brandName].revenue = Number((brandStats[brandName].revenue + itemRevenue).toFixed(2))
        brandStats[brandName].itemCount += 1

        let itemCost = 0
        const factor = item.presentationFactor || 1
        if (typeof item.costAtSale === 'number') {
          itemCost = item.costAtSale * quantity
        } else {
          const recipe = recipes.find(r => r.productId === productId)
          if (recipe) {
            itemCost = (recipe.totalCost || 0) * quantity * factor
          } else if (product) {
            itemCost = (product.cost || 0) * quantity * factor
          }
        }
        brandStats[brandName].cost = Number((brandStats[brandName].cost + itemCost).toFixed(2))
      })
    })

    return Object.values(brandStats)
      .map(b => ({
        ...b,
        profit: Number((b.revenue - b.cost).toFixed(2)),
        profitMargin: b.revenue > 0 ? ((b.revenue - b.cost) / b.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredInvoices, products, recipes, getBrandName])

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
      // Redondear a 2 decimales para evitar errores de punto flotante.
      // Multi-divisa: sumar en PEN base con TC congelado de cada factura.
      customerStats[key].totalSpent = Number((customerStats[key].totalSpent + getDocumentTotalInBase(invoice)).toFixed(2))
    })

    return Object.values(customerStats)
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
      // Sin límite - mostrar todos los clientes
  }, [filteredInvoices])

  // Ventas por zona/dirección
  const salesByZone = useMemo(() => {
    const zoneStats = {}

    filteredInvoices.forEach(invoice => {
      const address = invoice.customer?.address || invoice.customerAddress || ''
      if (!address || address.trim() === '') return

      // Extraer distrito/zona de la dirección
      // Intentamos obtener la parte más relevante (último segmento después de coma suele ser distrito)
      const parts = address.split(',').map(p => p.trim()).filter(Boolean)
      // Usar el último segmento significativo como zona (generalmente distrito o ciudad)
      let zone = parts.length > 1 ? parts[parts.length - 1] : parts[0]
      // Si el último segmento es muy corto (como "Lima"), usar los dos últimos
      if (parts.length > 2 && zone.length < 5) {
        zone = `${parts[parts.length - 2]}, ${zone}`
      }
      zone = zone.trim()
      if (!zone) return

      if (!zoneStats[zone]) {
        zoneStats[zone] = {
          zone,
          ordersCount: 0,
          totalRevenue: 0,
          customers: new Set(),
        }
      }

      zoneStats[zone].ordersCount += 1
      zoneStats[zone].totalRevenue = Number((zoneStats[zone].totalRevenue + getDocumentTotalInBase(invoice)).toFixed(2))
      const custId = invoice.customer?.documentNumber || invoice.customerDocumentNumber || invoice.customer?.name
      if (custId) zoneStats[zone].customers.add(custId)
    })

    return Object.values(zoneStats)
      .map(z => ({ ...z, uniqueCustomers: z.customers.size }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
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
          notasVenta: 0,
          notasCredito: 0,
          notasDebito: 0,
        }
      }

      sellers[sellerId].salesCount += 1
      sellers[sellerId].totalRevenue += getDocumentTotalInBase(invoice)

      if (invoice.documentType === 'factura') sellers[sellerId].facturas += 1
      else if (invoice.documentType === 'boleta') sellers[sellerId].boletas += 1
      else if (invoice.documentType === 'nota_venta') sellers[sellerId].notasVenta += 1
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
      // Multi-divisa: cada `payment.amount` está en la moneda de la factura
      // padre. Convertimos a PEN con el TC congelado para agregaciones.
      const toBase = (amt) => convertToBase(amt || 0, invoice.currency, invoice.exchangeRate)
      // Priorizar paymentHistory (ventas al crédito o parciales pagadas)
      if (invoice.paymentHistory && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
        invoice.paymentHistory.forEach(payment => {
          const method = payment.method || 'Efectivo'
          const amount = toBase(payment.amount)

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
          const amount = toBase(payment.amount)

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
        const amount = getDocumentTotalInBase(invoice)

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
    } else if (dateRange === 'today') {
      groupBy = 'day'
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      periodsData[key] = {
        period: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        revenue: 0,
        count: 0,
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
      // Mes calendárico: del 1ro del mes hasta hoy
      const today = now.getDate()
      for (let i = 1; i <= today; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i)
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
        const invoiceDate = getInvoiceDate(invoice)
        if (!invoiceDate) return
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
      const invoiceDate = getInvoiceDate(invoice)
      if (!invoiceDate) return

      let key
      if (groupBy === 'day') {
        key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}`
      } else {
        key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
      }

      if (periodsData[key]) {
        periodsData[key].revenue = Number((periodsData[key].revenue + getDocumentTotalInBase(invoice)).toFixed(2))
        periodsData[key].count += 1
      }
    })

    return Object.entries(periodsData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [filteredInvoices, dateRange, customStartDate, customEndDate, invoices])

  // Ventas por hora del día
  const salesByHour = useMemo(() => {
    const hours = {}
    for (let h = 0; h < 24; h++) {
      hours[h] = { hora: `${String(h).padStart(2, '0')}:00`, ventas: 0, total: 0 }
    }
    filteredInvoices.forEach(inv => {
      const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : (inv.createdAt ? new Date(inv.createdAt) : null)
      if (!date) return
      const hour = date.getHours()
      hours[hour].ventas += 1
      hours[hour].total += getDocumentTotalInBase(inv)
    })
    return Object.values(hours).filter(h => h.ventas > 0)
  }, [filteredInvoices])

  // Datos para gráfico de torta de tipos de documentos
  const documentTypesData = useMemo(() => {
    return [
      { name: 'Facturas', value: stats.facturas, color: COLORS[0] },
      { name: 'Boletas', value: stats.boletas, color: COLORS[1] },
      { name: 'Notas de Venta', value: stats.notasVenta, color: COLORS[2] },
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

  // Datos para charts del tab Marcas:
  // - top10BrandsChartData: barras horizontales con las 10 marcas top
  // - brandsPieData: top 6 marcas + "Otros" agrupando el resto (mejor lectura)
  const top10BrandsChartData = useMemo(() => {
    return salesByBrand.slice(0, 10).map((brand, index) => ({
      name: brand.name && brand.name.length > 14 ? brand.name.substring(0, 14) + '…' : (brand.name || 'Sin marca'),
      fullName: brand.name || 'Sin marca',
      ventas: brand.revenue,
      cantidad: brand.quantity,
      color: COLORS[index % COLORS.length],
    }))
  }, [salesByBrand])

  const brandsPieData = useMemo(() => {
    if (salesByBrand.length === 0) return []
    const top = salesByBrand.slice(0, 6)
    const rest = salesByBrand.slice(6)
    const otherRevenue = rest.reduce((s, b) => s + (b.revenue || 0), 0)
    const data = top.map((b, i) => ({
      name: b.name || 'Sin marca',
      value: Number((b.revenue || 0).toFixed(2)),
      color: COLORS[i % COLORS.length],
    }))
    if (otherRevenue > 0) {
      data.push({
        name: `Otros (${rest.length})`,
        value: Number(otherRevenue.toFixed(2)),
        color: '#9ca3af',
      })
    }
    return data
  }, [salesByBrand])

  // Totales agregados para los KPIs del tab Marcas
  const brandsTotals = useMemo(() => {
    const totalRevenue = salesByBrand.reduce((s, b) => s + (b.revenue || 0), 0)
    const totalUnits = salesByBrand.reduce((s, b) => s + (b.quantity || 0), 0)
    const totalProfit = salesByBrand.reduce((s, b) => s + (b.profit || 0), 0)
    return {
      count: salesByBrand.length,
      topBrand: salesByBrand[0] || null,
      totalRevenue,
      totalUnits,
      totalProfit,
      avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    }
  }, [salesByBrand])

  // Drill-down de marca: data completa de la marca seleccionada en el detalle.
  // Filtra topProducts por marca matcheada vía product master (productId).
  // Calcula KPIs propios (revenue/units/profit/top/peor margen) y arma el dataset
  // del chart top 5 productos. Si la marca no tiene ventas en el rango, todo
  // queda en cero (la UI muestra estado vacío).
  const selectedBrandData = useMemo(() => {
    if (!selectedBrandName) return null
    const brandSummary = salesByBrand.find(b => b.name === selectedBrandName) || null
    const productsOfBrand = topProducts.filter(p => {
      const productMaster = products.find(pm => pm.id === p.productId)
      return getBrandName(productMaster) === selectedBrandName
    })
    const totalRevenue = productsOfBrand.reduce((s, p) => s + (p.revenue || 0), 0)
    const totalUnits = productsOfBrand.reduce((s, p) => s + (p.quantity || 0), 0)
    const totalCost = productsOfBrand.reduce((s, p) => s + (p.cost || 0), 0)
    const totalProfit = totalRevenue - totalCost
    const topProduct = productsOfBrand[0] || null  // ya viene ordenado por revenue desc en topProducts
    const top5ChartData = productsOfBrand.slice(0, 5).map((p, i) => ({
      name: p.name && p.name.length > 14 ? p.name.substring(0, 14) + '…' : (p.name || 'Producto'),
      fullName: p.name || 'Producto',
      ventas: p.revenue,
      cantidad: p.quantity,
      color: COLORS[i % COLORS.length],
    }))
    return {
      brandName: selectedBrandName,
      brandSummary,        // entrada de salesByBrand (puede ser null si la marca quedó sin ventas tras un cambio de rango)
      products: productsOfBrand,
      totalRevenue,
      totalUnits,
      totalCost,
      totalProfit,
      avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      topProduct,
      top5ChartData,
      productCount: productsOfBrand.length,
    }
  }, [selectedBrandName, salesByBrand, topProducts, products, getBrandName])

  // ========== CÁLCULOS DE GASTOS ==========

  // Filtrar gastos por rango de fecha
  const filteredExpenses = useMemo(() => {
    const now = new Date()
    let filterDate = new Date()

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
      case 'today':
        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        break
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        // Del 1ero del mes actual hasta hoy
        filterDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        break
      case 'quarter':
        // Últimos 3 meses completos desde el 1ero
        filterDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
        break
      case 'year':
        // Del 1 de enero del año actual hasta hoy
        filterDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
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
    let filterDate = new Date()

    // Seguridad usuarios secundarios: las compras se derivan por almacén → sucursal.
    // Saneamos primero por permisos (warehouseId ∈ allowedWarehouseIds) y luego por fecha.
    const accessiblePurchases = purchases.filter(hasPurchaseAccess)

    // Para fechas personalizadas
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return accessiblePurchases
      }
      const startDate = parseLocalDate(customStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = parseLocalDate(customEndDate)
      endDate.setHours(23, 59, 59, 999)

      return accessiblePurchases.filter(purchase => {
        if (!purchase.createdAt) return false
        const purchaseDate = purchase.createdAt.toDate ? purchase.createdAt.toDate() : new Date(purchase.createdAt)
        return purchaseDate >= startDate && purchaseDate <= endDate
      })
    }

    switch (dateRange) {
      case 'today':
        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        break
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        // Del 1ero del mes actual hasta hoy
        filterDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        break
      case 'quarter':
        // Últimos 3 meses completos desde el 1ero
        filterDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
        break
      case 'year':
        // Del 1 de enero del año actual hasta hoy
        filterDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
        break
      case 'all':
        return accessiblePurchases
      default:
        return accessiblePurchases
    }

    return accessiblePurchases.filter(purchase => {
      if (!purchase.createdAt) return false
      const purchaseDate = purchase.createdAt.toDate ? purchase.createdAt.toDate() : new Date(purchase.createdAt)
      return purchaseDate >= filterDate
    })
  }, [purchases, dateRange, customStartDate, customEndDate, hasPurchaseAccess])

  // Estadísticas de compras (costo de ventas) — en PEN base.
  const purchaseStats = useMemo(() => {
    const totalPurchases = filteredPurchases.reduce((sum, p) => sum + getDocumentTotalInBase(p), 0)
    const purchaseCount = filteredPurchases.length
    return {
      total: totalPurchases,
      count: purchaseCount
    }
  }, [filteredPurchases])

  // Estadísticas de gastos
  const expenseStats = useMemo(() => {
    // Multi-divisa: convertir gastos USD a PEN base con su TC congelado
    const expenseInBase = (e) => {
      if (e.currency === 'USD') return e.amountInBase || convertToBase(e.amount, 'USD', e.exchangeRate)
      return e.amount || 0
    }
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + expenseInBase(e), 0)

    // Por categoría (en PEN base)
    const byCategory = filteredExpenses.reduce((acc, expense) => {
      const cat = expense.category || 'otros'
      if (!acc[cat]) {
        acc[cat] = { total: 0, count: 0 }
      }
      acc[cat].total += expenseInBase(expense)
      acc[cat].count += 1
      return acc
    }, {})

    // Por método de pago (en PEN base)
    const byPaymentMethod = filteredExpenses.reduce((acc, expense) => {
      const method = expense.paymentMethod || 'efectivo'
      if (!acc[method]) {
        acc[method] = { total: 0, count: 0 }
      }
      acc[method].total += expenseInBase(expense)
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
      // Mes calendárico: del 1ro del mes hasta hoy
      const today = now.getDate()
      for (let i = 1; i <= today; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i)
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
        periodsData[key].gastos = Number((periodsData[key].gastos + (expense.currency === 'USD' ? (expense.amountInBase || convertToBase(expense.amount, 'USD', expense.exchangeRate)) : (expense.amount || 0))).toFixed(2))
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

      let periodStart = new Date(filterDate)
      switch (dateRange) {
        case 'today':
          periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
          break
        case 'week':
          periodStart.setDate(now.getDate() - 7)
          break
        case 'month':
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
          break
        case 'quarter':
          periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
          break
        case 'year':
          periodStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
          break
        case 'all':
          return true
        default:
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      }
      return movementDate >= periodStart
    }

    // Función para filtrar por sucursal
    const filterByBranch = (movement) => {
      // Seguridad (defensa adicional): respetar siempre los permisos de ubicación del usuario.
      if (!canAccess(movement)) return false
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
  }, [financialMovements, cashMovements, dateRange, customStartDate, customEndDate, filterBranch, canAccess])

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
    if (filterBranch === 'main') return businessSettings?.mainBranchName || 'Sucursal Principal'
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

  // Exportar el reporte de VENDEDORES a Excel: hoja "Resumen" (por vendedor) +
  // hoja "Detalle de Ventas" (cada comprobante con su vendedor).
  const exportSellersReport = async () => {
    const branchLabel = getBranchLabel()
    const DOC_LABELS = {
      factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de Venta',
      nota_credito: 'Nota de Crédito', nota_debito: 'Nota de Débito',
    }

    // Hoja 1: Resumen por vendedor
    const resumen = [
      { 'Vendedor': 'Sucursal:', 'Email': branchLabel || 'Todas', 'N° Ventas': '', 'Ingresos': '', 'Facturas': '', 'Boletas': '', 'Notas de Venta': '', 'Notas de Crédito': '', 'Notas de Débito': '' },
      { 'Vendedor': '', 'Email': '', 'N° Ventas': '', 'Ingresos': '', 'Facturas': '', 'Boletas': '', 'Notas de Venta': '', 'Notas de Crédito': '', 'Notas de Débito': '' },
      ...sellerStats.map(s => ({
        'Vendedor': s.name,
        'Email': s.email || '',
        'N° Ventas': s.salesCount,
        'Ingresos': Math.round((s.totalRevenue || 0) * 100) / 100,
        'Facturas': s.facturas,
        'Boletas': s.boletas,
        'Notas de Venta': s.notasVenta,
        'Notas de Crédito': s.notasCredito,
        'Notas de Débito': s.notasDebito,
      })),
    ]
    resumen.push({
      'Vendedor': 'TOTAL', 'Email': '',
      'N° Ventas': sellerStats.reduce((a, s) => a + (s.salesCount || 0), 0),
      'Ingresos': Math.round(sellerStats.reduce((a, s) => a + (s.totalRevenue || 0), 0) * 100) / 100,
      'Facturas': '', 'Boletas': '', 'Notas de Venta': '', 'Notas de Crédito': '', 'Notas de Débito': '',
    })

    // Hoja 2: Detalle de cada venta con su vendedor
    const detalle = (filteredInvoices || []).map(inv => ({
      'Fecha': typeof inv.emissionDate === 'string'
        ? inv.emissionDate
        : (inv.emissionDate?.toDate?.() || inv.createdAt?.toDate?.() || new Date()).toLocaleDateString('es-PE'),
      'Comprobante': `${inv.series || ''}-${String(inv.correlativeNumber || inv.number || '').padStart(8, '0')}`,
      'Tipo': DOC_LABELS[inv.documentType] || inv.documentType || '',
      'Cliente': inv.customerName || inv.customer?.name || 'Cliente General',
      'Vendedor': inv.createdByName || inv.createdByEmail || 'Sin asignar',
      'Total': Math.round((getDocumentTotalInBase(inv) || 0) * 100) / 100,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen Vendedores')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle de Ventas')

    const dateRangeText = {
      week: 'ultima_semana', month: 'ultimo_mes', quarter: 'ultimo_trimestre',
      year: 'ultimo_año', all: 'todo',
    }[dateRange] || 'periodo'

    await exportExcelFile(wb, `reporte_vendedores_${dateRangeText}.xlsx`)
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
                {hasMainBranchAccess && <option value="main">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: 'today', label: 'Hoy' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Este mes' },
              { value: 'quarter', label: 'Trimestre' },
              { value: 'year', label: 'Este año' },
              { value: 'all', label: 'Todo' },
              { value: 'custom', label: 'Personalizado' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  dateRange === option.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
            {dateRange === 'custom' && (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm w-[130px]"
                />
                <span className="text-gray-400 text-sm">—</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm w-[130px]"
                />
              </>
            )}
          </div>
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
          onClick={() => setSelectedReport('brands')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'brands'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <Tag className="w-4 h-4 inline-block mr-2" />
          Marcas
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
          onClick={() => setSelectedReport('zones')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
            selectedReport === 'zones'
              ? 'bg-primary-600 text-white border border-primary-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          <MapPin className="w-4 h-4 inline-block mr-2" />
          Zonas
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
        {/* Tab Hotel - solo visible en modo hotel */}
        {businessMode === 'hotel' && (
          <button
            onClick={() => setSelectedReport('hotel')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm ${
              selectedReport === 'hotel'
                ? 'bg-cyan-600 text-white border border-cyan-700'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            <BedDouble className="w-4 h-4 inline-block mr-2" />
            Hotel
          </button>
        )}
      </div>

      {/* Resumen General */}
      {selectedReport === 'overview' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            {!hidePrivateData && (
            <button
              onClick={async () => await exportGeneralReport({ stats, salesByMonth: salesByPeriod, topProducts, topCustomers, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte General (Excel)
            </button>
            )}
          </div>

          {/* KPIs principales */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3">
            <Card>
              <CardContent className="p-3 xl:p-4">
                <p className="text-xs font-medium text-gray-500">Ingresos Totales</p>
                <p className="text-base lg:text-lg xl:text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(stats.totalRevenue)}
                </p>
                {stats.revenueGrowth !== 0 && (
                  <div className="flex items-center mt-1">
                    {stats.revenueGrowth > 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5 text-green-600 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-600 mr-0.5" />
                    )}
                    <span className={`text-xs font-medium ${stats.revenueGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(stats.revenueGrowth).toFixed(1)}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 xl:p-4">
                <p className="text-xs font-medium text-gray-500">Costo Total</p>
                <p className="text-base lg:text-lg xl:text-2xl font-bold text-red-600 mt-1">
                  {formatCurrency(stats.totalCost)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 xl:p-4">
                <p className="text-xs font-medium text-gray-500">Utilidad Total</p>
                <p className="text-base lg:text-lg xl:text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(stats.totalProfit)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Margen: {stats.profitMargin.toFixed(1)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 xl:p-4">
                <p className="text-xs font-medium text-gray-500">Comprobantes</p>
                <p className="text-base lg:text-lg xl:text-2xl font-bold text-gray-900 mt-1">{stats.totalInvoices}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Badge variant="primary" className="text-[10px]">{stats.facturas} F</Badge>
                  <Badge className="text-[10px]">{stats.boletas} B</Badge>
                  {stats.notasVenta > 0 && <Badge variant="warning" className="text-[10px]">{stats.notasVenta} NV</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 xl:p-4">
                <p className="text-xs font-medium text-gray-500">Ticket Promedio</p>
                <p className="text-base lg:text-lg xl:text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(stats.avgTicket)}
                </p>
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
                  {dateRange === 'month' && ' (Este Mes)'}
                  {dateRange === 'quarter' && ' (Último Trimestre)'}
                  {dateRange === 'year' && ' (Este Año)'}
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
            {!hidePrivateData && (
            <button
              onClick={async () => await exportSalesReport({ stats, salesByMonth: salesByPeriod, filteredInvoices, dateRange, paymentMethodStats, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Ventas (Excel)
            </button>
            )}
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

          {/* Ventas por Hora del Día */}
          {salesByHour.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ventas por Hora del Día</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={salesByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, name) => [
                        name === 'total' ? `S/ ${value.toFixed(2)}` : value,
                        name === 'total' ? 'Ingresos' : 'Cantidad'
                      ]}
                      labelFormatter={(label) => `Hora: ${label}`}
                    />
                    <Bar dataKey="ventas" fill="#6366f1" name="ventas" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" fill="#10b981" name="total" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Últimas Ventas</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {[...filteredInvoices].sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
                    return dateB - dateA
                  }).slice(0, 20).map(invoice => {
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
                        <Badge variant={invoice.documentType === 'factura' ? 'primary' : invoice.documentType === 'nota_venta' ? 'warning' : 'default'}>
                          {invoice.documentType === 'factura' ? 'Factura' : invoice.documentType === 'nota_venta' ? 'N. Venta' : 'Boleta'}
                        </Badge>
                        <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'pending' ? 'warning' : 'default'}>
                          {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                        </Badge>
                        <Badge variant="default">{paymentMethods}</Badge>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-gray-500">
                          {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : '-'}
                        </span>
                        <div className="flex items-center gap-3">
                          {invoice.allItemsCustom ? (
                            <span className="text-gray-400" title="Venta con productos personalizados (sin costo registrado en el catálogo).">s/c</span>
                          ) : invoice.marginUnreliable ? (
                            <span
                              className="text-red-600 font-medium flex items-center gap-1"
                              title="Margen sospechoso. Posibles causas: cambiaste la unidad o el costo del producto después de la venta, o el costo del catálogo está descalibrado. Revisa el costo del producto."
                            >
                              <span aria-hidden="true">⚠️</span>
                              {(invoice.profitMargin || 0).toFixed(1)}%
                            </span>
                          ) : (
                            <>
                              <span className="text-green-600">+{formatCurrency(invoice.profit || 0)}</span>
                              <span className={`font-medium ${(invoice.profitMargin || 0) >= 30 ? 'text-green-600' : (invoice.profitMargin || 0) >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {(invoice.profitMargin || 0).toFixed(1)}%
                              </span>
                            </>
                          )}
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
                    {[...filteredInvoices].sort((a, b) => {
                      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0)
                      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
                      return dateB - dateA
                    }).slice(0, 20).map(invoice => {
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
                            {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={invoice.documentType === 'factura' ? 'primary' : invoice.documentType === 'nota_venta' ? 'warning' : 'default'}>
                              {invoice.documentType === 'factura' ? 'Factura' : invoice.documentType === 'nota_venta' ? 'N. Venta' : 'Boleta'}
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
                            {invoice.allItemsCustom
                              ? <span className="text-gray-400" title="Productos personalizados sin costo registrado">—</span>
                              : formatCurrency(invoice.totalCost || 0)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {invoice.allItemsCustom
                              ? <span className="text-gray-400">—</span>
                              : formatCurrency(invoice.profit || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {invoice.allItemsCustom ? (
                              <span className="text-gray-400" title="Venta con productos personalizados (sin costo registrado en el catálogo).">s/c</span>
                            ) : invoice.marginUnreliable ? (
                              <span
                                className="font-medium text-red-600 inline-flex items-center gap-1"
                                title="Margen sospechoso. Posibles causas: cambiaste la unidad o el costo del producto después de la venta, o el costo del catálogo está descalibrado. Revisa el costo del producto."
                              >
                                <span aria-hidden="true">⚠️</span>
                                {(invoice.profitMargin || 0).toFixed(1)}%
                              </span>
                            ) : (
                              <span className={`font-medium ${
                                (invoice.profitMargin || 0) >= 30
                                  ? 'text-green-600'
                                  : (invoice.profitMargin || 0) >= 15
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}>
                                {(invoice.profitMargin || 0).toFixed(1)}%
                              </span>
                            )}
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
            {!hidePrivateData && (
            <button
              onClick={async () => await exportProductsReport({ topProducts, salesByCategory, salesByBrand, products, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Productos (Excel)
            </button>
            )}
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

          {/* Evolución por mes de un producto (selector + toggle Ventas/Cantidad) */}
          <Card>
            <CardHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary-600" />
                  <CardTitle>Evolución de ventas</CardTitle>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {/* Buscador libre de producto: escribí y elegí (como en Compras) */}
                  <div className="relative flex-1 sm:max-w-md" ref={productChartRef}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={productChartSearch}
                      onChange={(e) => { setProductChartSearch(e.target.value); setProductChartOpen(true) }}
                      onFocus={(e) => { setProductChartOpen(true); e.target.select() }}
                      placeholder="Buscar producto por nombre..."
                      className="w-full text-sm border border-gray-300 rounded-lg pl-9 pr-3 py-2 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    {productChartOpen && productChartSearch.trim() && (
                      <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        {productChartResults.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">No se encontró ningún producto</div>
                        ) : (
                          productChartResults.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); setProductChartName(p.name); setProductChartSearch(p.name); setProductChartOpen(false) }}
                              className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 ${p.name === productChartName ? 'bg-primary-50' : ''}`}
                            >
                              <span className="block text-sm text-gray-900">{p.name}</span>
                              {p.sku && <span className="block text-xs text-gray-400">{p.sku}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 self-start sm:self-auto flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setProductChartMetric('revenue')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${productChartMetric === 'revenue' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      Ventas (S/)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductChartMetric('quantity')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${productChartMetric === 'quantity' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      Cantidad
                    </button>
                  </div>
                </div>
                {productChartName && (
                  <p className="text-sm text-gray-600">
                    Mostrando: <span className="font-semibold text-gray-900">{productChartName}</span>
                    <span className="text-gray-400"> · por día o por mes según el rango de fecha de arriba</span>
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!productChartName ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-center text-sm text-gray-500 gap-2">
                  <Search className="w-6 h-6 text-gray-300" />
                  Buscá y elegí un producto arriba para ver su evolución por mes.
                </div>
              ) : productPeriodData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-sm text-gray-500">
                  No hay ventas de este producto en el período seleccionado.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={productPeriodData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorProductoMes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="period" stroke="#6b7280" fontSize={12} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      formatter={(value) => productChartMetric === 'revenue'
                        ? [`S/ ${Number(value).toFixed(2)}`, 'Ventas']
                        : [`${Number(value)} u.`, 'Cantidad']}
                      labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Area
                      type="monotone"
                      dataKey={productChartMetric === 'revenue' ? 'ventas' : 'cantidad'}
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#colorProductoMes)"
                      dot={{ fill: '#3b82f6', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabla de productos */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>Todos los Productos Vendidos ({topProducts.length})</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setProductPage(0) }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const filtered = productSearch.trim()
                  ? topProducts.filter(p =>
                      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                      p.sku?.toLowerCase().includes(productSearch.toLowerCase())
                    )
                  : topProducts
                const totalPages = Math.ceil(filtered.length / PRODUCTS_PER_PAGE)
                const paginated = filtered.slice(productPage * PRODUCTS_PER_PAGE, (productPage + 1) * PRODUCTS_PER_PAGE)

                return (
                  <>
                    {/* Mobile Cards */}
                    <div className="lg:hidden space-y-3">
                      {paginated.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">
                          {productSearch ? 'No se encontraron productos' : 'No hay datos de productos en este período'}
                        </p>
                      ) : (
                        paginated.map((product, i) => {
                          const globalIndex = productPage * PRODUCTS_PER_PAGE + i
                          return (
                            <div key={globalIndex} className="bg-white border rounded-lg px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${globalIndex === 0 ? 'bg-yellow-100 text-yellow-700' : globalIndex === 1 ? 'bg-gray-200 text-gray-700' : globalIndex === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {globalIndex + 1}
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-900">{product.name}</span>
                                    {product.sku && <span className="block text-xs text-gray-400">SKU: {product.sku}</span>}
                                  </div>
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
                          )
                        })
                      )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Posición</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">Ingresos</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                            <TableHead className="text-right">Utilidad</TableHead>
                            <TableHead className="text-right">Margen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginated.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                                {productSearch ? 'No se encontraron productos' : 'No hay datos de productos en este período'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginated.map((product, i) => {
                              const globalIndex = productPage * PRODUCTS_PER_PAGE + i
                              return (
                                <TableRow key={globalIndex}>
                                  <TableCell>
                                    <div
                                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                        globalIndex === 0
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : globalIndex === 1
                                          ? 'bg-gray-200 text-gray-700'
                                          : globalIndex === 2
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {globalIndex + 1}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-gray-500 text-sm">{product.sku || '-'}</TableCell>
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
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <span className="text-sm text-gray-500">
                          {productPage * PRODUCTS_PER_PAGE + 1}-{Math.min((productPage + 1) * PRODUCTS_PER_PAGE, filtered.length)} de {filtered.length} productos
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setProductPage(p => Math.max(0, p - 1))}
                            disabled={productPage === 0}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-medium px-2">{productPage + 1} / {totalPages}</span>
                          <button
                            onClick={() => setProductPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={productPage >= totalPages - 1}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
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

          {/* Tabla de ventas por marca */}
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Marca</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {salesByBrand.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de marcas en este período</p>
                ) : (
                  salesByBrand.map((brand, index) => (
                    <div key={index} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{brand.name}</span>
                        <span className="font-bold text-gray-900">{formatCurrency(brand.revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm">
                        <span className="text-gray-500">{brand.itemCount} ventas · {brand.quantity.toFixed(0)} uds</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${brand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            +{formatCurrency(brand.profit)}
                          </span>
                          <span className={`font-medium ${brand.profitMargin >= 30 ? 'text-green-600' : brand.profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {brand.profitMargin.toFixed(1)}%
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
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesByBrand.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No hay datos de marcas en este período
                        </TableCell>
                      </TableRow>
                    ) : (
                      salesByBrand.map((brand, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{brand.name}</TableCell>
                          <TableCell className="text-right">{brand.itemCount}</TableCell>
                          <TableCell className="text-right">{brand.quantity.toFixed(0)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(brand.revenue)}
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {formatCurrency(brand.cost)}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${brand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(brand.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${
                              brand.profitMargin >= 30
                                ? 'text-green-600'
                                : brand.profitMargin >= 15
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {brand.profitMargin.toFixed(1)}%
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

      {/* Reporte de Marcas — DETALLE DE UNA MARCA (drill-down) */}
      {selectedReport === 'brands' && selectedBrandName && selectedBrandData && (
        <>
          {/* Header con back button + selector de marca + export */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setSelectedBrandName(null); setBrandDetailSearch(''); setBrandDetailPage(0) }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                title="Volver a la lista de marcas"
              >
                <ChevronLeft className="w-4 h-4" />
                Todas las marcas
              </button>
              <div>
                <p className="text-xs text-gray-500">Detalle de marca</p>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-600" />
                  {selectedBrandData.brandName}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Selector para cambiar de marca sin volver a la lista */}
              <select
                value={selectedBrandName}
                onChange={(e) => { setSelectedBrandName(e.target.value); setBrandDetailSearch(''); setBrandDetailPage(0) }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                title="Cambiar marca"
              >
                {salesByBrand.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              {!hidePrivateData && (
              <button
                onClick={async () => await exportBrandDetailReport({ brandData: selectedBrandData, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
                disabled={selectedBrandData.products.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Exportar Excel
              </button>
              )}
            </div>
          </div>

          {/* KPIs de la marca */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Ingresos</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedBrandData.totalRevenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Unidades vendidas</p>
                    <p className="text-xl font-bold text-gray-900">{selectedBrandData.totalUnits.toFixed(0)}</p>
                    <p className="text-xs text-gray-500">{selectedBrandData.productCount} producto{selectedBrandData.productCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Utilidad bruta</p>
                    <p className={`text-xl font-bold ${selectedBrandData.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatCurrency(selectedBrandData.totalProfit)}
                    </p>
                    <p className={`text-xs font-medium ${
                      selectedBrandData.avgMargin >= 30 ? 'text-green-600'
                      : selectedBrandData.avgMargin >= 15 ? 'text-yellow-600'
                      : 'text-red-600'
                    }`}>Margen {selectedBrandData.avgMargin.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Award className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Producto top</p>
                    <p className="text-base font-bold text-gray-900 truncate" title={selectedBrandData.topProduct?.name || '-'}>
                      {selectedBrandData.topProduct?.name || '-'}
                    </p>
                    {selectedBrandData.topProduct && (
                      <p className="text-xs text-gray-500">{formatCurrency(selectedBrandData.topProduct.revenue)}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top 5 productos de la marca (chart) */}
          <Card>
            <CardHeader>
              <CardTitle>Top 5 productos de {selectedBrandData.brandName}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedBrandData.top5ChartData.length === 0 ? (
                <p className="text-center py-8 text-gray-500">
                  Esta marca no tiene ventas en el período seleccionado
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={selectedBrandData.top5ChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="ventas" name="Ingresos" radius={[8, 8, 0, 0]}>
                      {selectedBrandData.top5ChartData.map((entry, index) => (
                        <Cell key={`bd-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabla completa de productos de la marca con búsqueda + paginación */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>Productos de la marca ({selectedBrandData.products.length})</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={brandDetailSearch}
                    onChange={(e) => { setBrandDetailSearch(e.target.value); setBrandDetailPage(0) }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const filtered = brandDetailSearch.trim()
                  ? selectedBrandData.products.filter(p =>
                      p.name?.toLowerCase().includes(brandDetailSearch.toLowerCase()) ||
                      p.sku?.toLowerCase().includes(brandDetailSearch.toLowerCase())
                    )
                  : selectedBrandData.products
                const totalPages = Math.ceil(filtered.length / BRAND_DETAIL_PER_PAGE)
                const paginated = filtered.slice(brandDetailPage * BRAND_DETAIL_PER_PAGE, (brandDetailPage + 1) * BRAND_DETAIL_PER_PAGE)
                const brandTotal = selectedBrandData.totalRevenue

                return (
                  <>
                    {/* Mobile cards */}
                    <div className="lg:hidden space-y-3">
                      {paginated.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">
                          {brandDetailSearch ? 'No se encontraron productos' : 'Esta marca no tiene ventas en el período'}
                        </p>
                      ) : (
                        paginated.map((p, i) => {
                          const globalIndex = brandDetailPage * BRAND_DETAIL_PER_PAGE + i
                          const pct = brandTotal > 0 ? (p.revenue / brandTotal) * 100 : 0
                          return (
                            <div key={globalIndex} className="bg-white border rounded-lg px-4 py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${globalIndex === 0 ? 'bg-yellow-100 text-yellow-700' : globalIndex === 1 ? 'bg-gray-200 text-gray-700' : globalIndex === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {globalIndex + 1}
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-900">{p.name}</span>
                                    {p.sku && <span className="block text-xs text-gray-400">SKU: {p.sku}</span>}
                                  </div>
                                </div>
                                <span className="font-bold text-gray-900">{formatCurrency(p.revenue)}</span>
                              </div>
                              <div className="flex items-center justify-between mt-2 text-sm">
                                <span className="text-gray-500">{p.quantity.toFixed(0)} uds · {pct.toFixed(1)}%</span>
                                <div className="flex items-center gap-3">
                                  <span className={`font-medium ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    +{formatCurrency(p.profit)}
                                  </span>
                                  <span className={`font-medium ${p.profitMargin >= 30 ? 'text-green-600' : p.profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {p.profitMargin.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Posición</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Producto</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                            <TableHead className="text-right">Ingresos</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                            <TableHead className="text-right">Utilidad</TableHead>
                            <TableHead className="text-right">Margen</TableHead>
                            <TableHead className="text-right">% Marca</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginated.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                                {brandDetailSearch ? 'No se encontraron productos' : 'Esta marca no tiene ventas en el período'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginated.map((p, i) => {
                              const globalIndex = brandDetailPage * BRAND_DETAIL_PER_PAGE + i
                              const pct = brandTotal > 0 ? (p.revenue / brandTotal) * 100 : 0
                              return (
                                <TableRow key={globalIndex}>
                                  <TableCell>
                                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                      globalIndex === 0 ? 'bg-yellow-100 text-yellow-700'
                                      : globalIndex === 1 ? 'bg-gray-200 text-gray-700'
                                      : globalIndex === 2 ? 'bg-orange-100 text-orange-700'
                                      : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {globalIndex + 1}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-gray-500 text-sm">{p.sku || '-'}</TableCell>
                                  <TableCell className="font-medium">{p.name}</TableCell>
                                  <TableCell className="text-right">{p.quantity.toFixed(2)}</TableCell>
                                  <TableCell className="text-right font-semibold">{formatCurrency(p.revenue)}</TableCell>
                                  <TableCell className="text-right text-gray-600">{formatCurrency(p.cost)}</TableCell>
                                  <TableCell className={`text-right font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(p.profit)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`font-medium ${
                                      p.profitMargin >= 30 ? 'text-green-600'
                                      : p.profitMargin >= 15 ? 'text-yellow-600'
                                      : 'text-red-600'
                                    }`}>
                                      {p.profitMargin.toFixed(1)}%
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-gray-700">{pct.toFixed(1)}%</TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <span className="text-sm text-gray-500">
                          {brandDetailPage * BRAND_DETAIL_PER_PAGE + 1}-{Math.min((brandDetailPage + 1) * BRAND_DETAIL_PER_PAGE, filtered.length)} de {filtered.length} productos
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBrandDetailPage(p => Math.max(0, p - 1))}
                            disabled={brandDetailPage === 0}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-medium px-2">{brandDetailPage + 1} / {totalPages}</span>
                          <button
                            onClick={() => setBrandDetailPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={brandDetailPage >= totalPages - 1}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Marcas — LISTA (vista por defecto, sin marca seleccionada) */}
      {selectedReport === 'brands' && !selectedBrandName && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            {!hidePrivateData && (
            <button
              onClick={async () => await exportBrandsReport({ salesByBrand, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              disabled={salesByBrand.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Marcas (Excel)
            </button>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Tag className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Marcas con ventas</p>
                    <p className="text-2xl font-bold text-gray-900">{brandsTotals.count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Award className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Marca top</p>
                    <p className="text-base font-bold text-gray-900 truncate" title={brandsTotals.topBrand?.name || '-'}>
                      {brandsTotals.topBrand?.name || '-'}
                    </p>
                    {brandsTotals.topBrand && (
                      <p className="text-xs text-gray-500">{formatCurrency(brandsTotals.topBrand.revenue)}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Ingresos totales</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(brandsTotals.totalRevenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Unidades vendidas</p>
                    <p className="text-xl font-bold text-gray-900">{brandsTotals.totalUnits.toFixed(0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts: Bar top 10 + Pie distribución */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 marcas por ingresos</CardTitle>
              </CardHeader>
              <CardContent>
                {top10BrandsChartData.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos de marcas en este período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={top10BrandsChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={90} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="ventas" name="Ingresos" radius={[8, 8, 0, 0]}>
                        {top10BrandsChartData.map((entry, index) => (
                          <Cell key={`b-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Distribución de ventas por marca</CardTitle>
              </CardHeader>
              <CardContent>
                {brandsPieData.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay datos en este período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <RePieChart>
                      <Pie
                        data={brandsPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => entry.name}
                      >
                        {brandsPieData.map((entry, index) => (
                          <Cell key={`pie-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </RePieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla completa con búsqueda + paginación + ranking */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>Todas las marcas ({salesByBrand.length})</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar marca..."
                    value={brandSearch}
                    onChange={(e) => { setBrandSearch(e.target.value); setBrandPage(0) }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const filtered = brandSearch.trim()
                  ? salesByBrand.filter(b => b.name?.toLowerCase().includes(brandSearch.toLowerCase()))
                  : salesByBrand
                const totalPages = Math.ceil(filtered.length / BRANDS_PER_PAGE)
                const paginated = filtered.slice(brandPage * BRANDS_PER_PAGE, (brandPage + 1) * BRANDS_PER_PAGE)
                const totalRevenue = brandsTotals.totalRevenue

                return (
                  <>
                    {/* Mobile cards */}
                    <div className="lg:hidden space-y-3">
                      {paginated.length === 0 ? (
                        <p className="text-center py-8 text-gray-500">
                          {brandSearch ? 'No se encontraron marcas' : 'No hay datos de marcas en este período'}
                        </p>
                      ) : (
                        paginated.map((brand, i) => {
                          const globalIndex = brandPage * BRANDS_PER_PAGE + i
                          const pct = totalRevenue > 0 ? (brand.revenue / totalRevenue) * 100 : 0
                          return (
                            <button
                              key={globalIndex}
                              type="button"
                              onClick={() => { setSelectedBrandName(brand.name); setBrandDetailSearch(''); setBrandDetailPage(0) }}
                              className="w-full text-left bg-white border rounded-lg px-4 py-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${globalIndex === 0 ? 'bg-yellow-100 text-yellow-700' : globalIndex === 1 ? 'bg-gray-200 text-gray-700' : globalIndex === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {globalIndex + 1}
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-900">{brand.name}</span>
                                    <span className="block text-xs text-gray-400">{pct.toFixed(1)}% del total · Ver detalle →</span>
                                  </div>
                                </div>
                                <span className="font-bold text-gray-900">{formatCurrency(brand.revenue)}</span>
                              </div>
                              <div className="flex items-center justify-between mt-2 text-sm">
                                <span className="text-gray-500">{brand.itemCount} ventas · {brand.quantity.toFixed(0)} uds</span>
                                <div className="flex items-center gap-3">
                                  <span className={`font-medium ${brand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    +{formatCurrency(brand.profit)}
                                  </span>
                                  <span className={`font-medium ${brand.profitMargin >= 30 ? 'text-green-600' : brand.profitMargin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {brand.profitMargin.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Posición</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead className="text-right">Ventas</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                            <TableHead className="text-right">Ingresos</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                            <TableHead className="text-right">Utilidad</TableHead>
                            <TableHead className="text-right">Margen</TableHead>
                            <TableHead className="text-right">% Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginated.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                                {brandSearch ? 'No se encontraron marcas' : 'No hay datos de marcas en este período'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginated.map((brand, i) => {
                              const globalIndex = brandPage * BRANDS_PER_PAGE + i
                              const pct = totalRevenue > 0 ? (brand.revenue / totalRevenue) * 100 : 0
                              return (
                                <TableRow
                                  key={globalIndex}
                                  onClick={() => { setSelectedBrandName(brand.name); setBrandDetailSearch(''); setBrandDetailPage(0) }}
                                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                                  title={`Ver detalle de ${brand.name}`}
                                >
                                  <TableCell>
                                    <div
                                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                                        globalIndex === 0
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : globalIndex === 1
                                          ? 'bg-gray-200 text-gray-700'
                                          : globalIndex === 2
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {globalIndex + 1}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-medium text-blue-700">{brand.name}</TableCell>
                                  <TableCell className="text-right">{brand.itemCount}</TableCell>
                                  <TableCell className="text-right">{brand.quantity.toFixed(0)}</TableCell>
                                  <TableCell className="text-right font-semibold">{formatCurrency(brand.revenue)}</TableCell>
                                  <TableCell className="text-right text-gray-600">{formatCurrency(brand.cost)}</TableCell>
                                  <TableCell className={`text-right font-semibold ${brand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(brand.profit)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className={`font-medium ${
                                      brand.profitMargin >= 30
                                        ? 'text-green-600'
                                        : brand.profitMargin >= 15
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}>
                                      {brand.profitMargin.toFixed(1)}%
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-gray-700">{pct.toFixed(1)}%</TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <span className="text-sm text-gray-500">
                          {brandPage * BRANDS_PER_PAGE + 1}-{Math.min((brandPage + 1) * BRANDS_PER_PAGE, filtered.length)} de {filtered.length} marcas
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBrandPage(p => Math.max(0, p - 1))}
                            disabled={brandPage === 0}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-medium px-2">{brandPage + 1} / {totalPages}</span>
                          <button
                            onClick={() => setBrandPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={brandPage >= totalPages - 1}
                            className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </CardContent>
          </Card>
        </>
      )}

      {/* Reporte de Clientes */}
      {selectedReport === 'customers' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            {!hidePrivateData && (
            <button
              onClick={async () => await exportCustomersReport({ topCustomers, customers, filteredInvoices, dateRange, customStartDate, customEndDate, branchLabel: getBranchLabel() })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Clientes (Excel)
            </button>
            )}
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

      {/* Reporte por Zonas */}
      {selectedReport === 'zones' && (
        <>
          {/* Gráfico de Top 10 Zonas - horizontal */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Zonas por Ingresos</CardTitle>
            </CardHeader>
            <CardContent>
              {salesByZone.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No hay datos de zonas</p>
                  <p className="text-sm mt-1">Las zonas se obtienen de la dirección registrada en los comprobantes. Asegúrate de que tus clientes tengan dirección.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={salesByZone.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="zone" type="category" tick={{ fontSize: 11 }} width={150} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="totalRevenue" fill={COLORS[2]} name="Total Vendido" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Tabla de zonas */}
          {salesByZone.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Detalles por Zona</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Mobile Cards */}
                <div className="lg:hidden space-y-3">
                  {salesByZone.map((zone, index) => (
                    <div key={zone.zone} className="bg-white border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-200 text-gray-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-gray-900">{zone.zone}</span>
                        </div>
                        <span className="font-bold text-gray-900">{formatCurrency(zone.totalRevenue)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                        <span>{zone.uniqueCustomers} cliente{zone.uniqueCustomers !== 1 ? 's' : ''}</span>
                        <span>{zone.ordersCount} pedido{zone.ordersCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Posición</TableHead>
                        <TableHead>Zona / Distrito</TableHead>
                        <TableHead className="text-right">Clientes</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Total Vendido</TableHead>
                        <TableHead className="text-right">Ticket Promedio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesByZone.map((zone, index) => (
                        <TableRow key={zone.zone}>
                          <TableCell>
                            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700'
                                : index === 1 ? 'bg-gray-200 text-gray-700'
                                : index === 2 ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {index + 1}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              {zone.zone}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-center px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full">
                              <span className="text-sm font-semibold">{zone.uniqueCustomers}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full">
                              <span className="text-sm font-semibold">{zone.ordersCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(zone.totalRevenue)}
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {formatCurrency(zone.ordersCount > 0 ? zone.totalRevenue / zone.ordersCount : 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mapa de Calor de Perú */}
          {salesByZone.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Mapa de Ventas por Departamento</CardTitle>
              </CardHeader>
              <CardContent>
                <PeruHeatMap salesByZone={salesByZone} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Reporte por Vendedores */}
      {selectedReport === 'sellers' && (
        <>
          {/* Botón de exportación */}
          <div className="flex justify-end">
            <button
              onClick={exportSellersReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Vendedores (Excel)
            </button>
          </div>

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
                        {seller.notasVenta > 0 && <Badge variant="warning">{seller.notasVenta} NV</Badge>}
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
                      <TableHead className="text-right">N. Venta</TableHead>
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
                            <Badge variant="warning">{seller.notasVenta}</Badge>
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
            {!hidePrivateData && (
            <button
              onClick={exportExpensesReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Gastos (Excel)
            </button>
            )}
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
                  {dateRange === 'month' && ' (Este Mes)'}
                  {dateRange === 'quarter' && ' (Último Trimestre)'}
                  {dateRange === 'year' && ' (Este Año)'}
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
            {!hidePrivateData && (
            <button
              onClick={exportProfitabilityReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar Reporte de Rentabilidad (Excel)
            </button>
            )}
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
                {dateRange === 'month' && ' (Este Mes)'}
                {dateRange === 'quarter' && ' (Último Trimestre)'}
                {dateRange === 'year' && ' (Este Año)'}
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

      {/* Reporte Hotel */}
      {selectedReport === 'hotel' && businessMode === 'hotel' && (() => {
        const totalRooms = hotelRooms.length
        const occupiedRooms = hotelRooms.filter(r => r.status === 'occupied').length
        const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0

        // ===== Rango del período (calculado una sola vez) =====
        const now = new Date()
        let periodStart = null
        let periodEnd = null
        if (dateRange === 'custom') {
          if (customStartDate && customEndDate) {
            periodStart = parseLocalDate(customStartDate); periodStart.setHours(0, 0, 0, 0)
            periodEnd = parseLocalDate(customEndDate); periodEnd.setHours(23, 59, 59, 999)
          }
        } else if (dateRange !== 'all') {
          switch (dateRange) {
            case 'today':
              periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
              periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
              break
            case 'week':
              periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
              periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
              break
            case 'quarter':
              periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
              periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
              break
            case 'year':
              periodStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
              periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
              break
            case 'month':
            default:
              periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
              periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
          }
        }
        // ¿La fecha ISO (YYYY-MM-DD) cae dentro del período elegido?
        const inPeriod = (dateStr) => {
          if (!dateStr) return false
          if (!periodStart || !periodEnd) return true // 'all' o custom sin fechas
          const d = new Date(dateStr + 'T00:00:00')
          return d >= periodStart && d <= periodEnd
        }

        // Reservas del período (por fecha de check-in) — solo para el card de estados
        // y el KPI "Reservas Período". El dinero y las noches se calculan POR NOCHE abajo.
        const filteredRes = hotelReservations.filter(res => inPeriod(res.checkIn || res.checkInDate))
        const completedRes = filteredRes.filter(r => r.status === 'checked_out')

        const statusCounts = {
          confirmed: filteredRes.filter(r => r.status === 'confirmed').length,
          checked_in: filteredRes.filter(r => r.status === 'checked_in').length,
          checked_out: completedRes.length,
          cancelled: filteredRes.filter(r => r.status === 'cancelled').length,
          no_show: filteredRes.filter(r => r.status === 'no_show').length,
        }

        // ===== Base POR NOCHE: cada noche cuenta en SU fecha =====
        // Fuente primaria: cargos del folio (room_night lleva la fecha de cada noche;
        // room_hourly la del check-in). Los consumos (productos/servicios) NO entran aquí:
        // se muestran aparte. Las reservas que aún no generaron cargos (futuras/confirmadas
        // o con tarifa 0) se proyectan desde sus fechas, para que "Este mes" incluya lo
        // reservado por venir.
        const resById = {}
        hotelReservations.forEach(r => { resById[r.id] = r })

        const nightEntries = []
        const chargedResIds = new Set()
        const seenNightKeys = new Set()
        hotelFolioCharges.forEach(c => {
          if (c.chargeType !== 'room_night' && c.chargeType !== 'room_hourly') return
          const res = resById[c.reservationId]
          if (res && (res.status === 'cancelled' || res.status === 'no_show')) return
          // Reprogramación: ignorar noches SIN facturar que quedaron fuera del rango
          // actual de la reserva (cargos huérfanos de fechas viejas).
          if (res && c.chargeType === 'room_night' && !c.invoiceId) {
            const ci = res.checkIn || res.checkInDate
            const co = res.checkOut || res.checkOutDate
            if (ci && co && (c.date < ci || c.date >= co)) return
          }
          // Dedupe defensivo: datos viejos con la misma noche duplicada cuentan UNA vez.
          const key = `${c.reservationId}_${c.chargeType}_${c.date}`
          if (seenNightKeys.has(key)) return
          seenNightKeys.add(key)
          chargedResIds.add(c.reservationId)
          nightEntries.push({
            date: c.date,
            roomId: c.roomId || res?.roomId || null,
            roomNumber: c.roomNumber || res?.roomNumber || '',
            reservationId: c.reservationId,
            amount: Number(c.amount) || 0,
            isNight: c.chargeType === 'room_night',
          })
        })

        // Reservas activas sin cargos aún → proyectar sus noches (cada una en su fecha).
        hotelReservations.forEach(res => {
          if (res.status === 'cancelled' || res.status === 'no_show') return
          if (chargedResIds.has(res.id)) return
          const ci = res.checkIn || res.checkInDate
          const co = res.checkOut || res.checkOutDate
          if (!ci) return
          if (res.pricingMode === 'hourly') {
            nightEntries.push({ date: ci, roomId: res.roomId || null, roomNumber: res.roomNumber || '', reservationId: res.id, amount: Number(res.totalAmount || res.total) || 0, isNight: false })
            return
          }
          if (!co) return
          const dates = []
          const cur = new Date(ci + 'T12:00:00')
          const end = new Date(co + 'T12:00:00')
          while (cur < end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
          if (dates.length === 0) return
          const resTotal = Number(res.totalAmount || res.total) || 0
          const perNight = resTotal > 0 ? resTotal / dates.length : (Number(res.ratePerNight) || 0)
          dates.forEach(d => nightEntries.push({ date: d, roomId: res.roomId || null, roomNumber: res.roomNumber || '', reservationId: res.id, amount: perNight, isNight: true }))
        })

        const periodEntries = nightEntries.filter(e => inPeriod(e.date))

        // Hospedaje del período (SOLO habitación, sin consumos)
        const totalRoomRevenue = periodEntries.reduce((s, e) => s + e.amount, 0)
        const totalNights = periodEntries.filter(e => e.isNight).length
        const adr = totalNights > 0 ? totalRoomRevenue / totalNights : 0
        const revpar = totalRooms > 0 ? totalRoomRevenue / totalRooms : 0

        // Consumos / productos del período (cargos que no son habitación, por su fecha).
        const consumoTotal = hotelFolioCharges.reduce((s, c) => {
          if (c.chargeType === 'room_night' || c.chargeType === 'room_hourly') return s
          const res = resById[c.reservationId]
          if (res && (res.status === 'cancelled' || res.status === 'no_show')) return s
          return inPeriod(c.date) ? s + (Number(c.amount) || 0) : s
        }, 0)

        // Totales del período (card azul + filas "Total" de las tablas)
        const periodResIds = new Set(periodEntries.map(e => e.reservationId))
        const totalReservationsCount = periodResIds.size
        const totalReservationsAmount = totalRoomRevenue
        const activeRes = filteredRes.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
        const totalReservationsPaid = activeRes.reduce((s, r) => s + (r.amountPaid || 0), 0)
        const totalReservationsPending = Math.max(0, (totalRoomRevenue + consumoTotal) - totalReservationsPaid)

        // Ingresos por tipo de habitación (desde las noches del período)
        const ROOM_TYPE_LABELS = { simple: 'Simple', doble: 'Doble', matrimonial: 'Matrimonial', suite: 'Suite', familiar: 'Familiar' }
        const roomById = {}
        hotelRooms.forEach(rm => { roomById[rm.id] = rm })
        const revenueByRoomType = (() => {
          const map = {}
          periodEntries.forEach(e => {
            const room = roomById[e.roomId]
            const label = ROOM_TYPE_LABELS[room?.type] || 'Otros'
            if (!map[label]) map[label] = { type: label, resIds: new Set(), nights: 0, revenue: 0 }
            map[label].resIds.add(e.reservationId)
            if (e.isNight) map[label].nights += 1
            map[label].revenue += e.amount
          })
          return Object.values(map)
            .map(r => ({ type: r.type, reservations: r.resIds.size, nights: r.nights, revenue: r.revenue }))
            .sort((a, b) => b.revenue - a.revenue)
        })()
        const roomTypeNightsTotal = totalNights

        // Ingresos por habitación INDIVIDUAL (cada cabaña por su nombre), desde las
        // noches del período: el conteo de noches por cabaña sale EXACTO (una fila por
        // noche real, atribuida a su habitación y a su fecha).
        const revenueByRoom = (() => {
          const map = {}
          periodEntries.forEach(e => {
            const room = roomById[e.roomId]
            const key = e.roomId || e.roomNumber || 'sin-hab'
            const name = (room?.name || '').trim()
            const number = room?.number || e.roomNumber || ''
            const label = name || (number ? `Hab. ${number}` : 'Sin habitación')
            if (!map[key]) map[key] = { key, label, resIds: new Set(), nights: 0, revenue: 0 }
            map[key].resIds.add(e.reservationId)
            if (e.isNight) map[key].nights += 1
            map[key].revenue += e.amount
          })
          return Object.values(map)
            .map(r => ({ key: r.key, label: r.label, reservations: r.resIds.size, nights: r.nights, revenue: r.revenue }))
            .sort((a, b) => b.revenue - a.revenue)
        })()

        return (
          <>
            {/* Hospedaje del período (cada noche cuenta en su fecha) + consumos APARTE */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Hospedaje del período</p>
                    <p className="text-3xl font-bold text-blue-700">{formatCurrency(totalReservationsAmount)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {totalReservationsCount} {totalReservationsCount === 1 ? 'reserva' : 'reservas'} · {totalNights} {totalNights === 1 ? 'noche' : 'noches'} · cada noche cuenta en su fecha
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Consumos / Productos</p>
                      <p className="text-lg font-bold text-purple-600">{formatCurrency(consumoTotal)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Total general</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(totalReservationsAmount + consumoTotal)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Cobrado</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(totalReservationsPaid)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Pendiente</p>
                      <p className="text-lg font-bold text-amber-600">{formatCurrency(totalReservationsPending)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500">Ocupación Actual</p>
                  <p className="text-2xl font-bold text-cyan-600">{occupancyRate}%</p>
                  <p className="text-xs text-gray-400">{occupiedRooms}/{totalRooms} hab.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500">Tarifa Promedio (ADR)</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(adr)}</p>
                  <p className="text-xs text-gray-400">por noche</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500">RevPAR</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(revpar)}</p>
                  <p className="text-xs text-gray-400">ingreso/hab.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500">Ingresos Habitaciones</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRoomRevenue)}</p>
                  <p className="text-xs text-gray-400">{totalNights} noches del período</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-gray-500">Reservas Período</p>
                  <p className="text-2xl font-bold text-blue-600">{filteredRes.length}</p>
                  <p className="text-xs text-gray-400">{completedRes.length} completadas</p>
                </CardContent>
              </Card>
            </div>

            {/* Estado de reservas */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Reservas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Confirmadas', count: statusCounts.confirmed, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Check-in', count: statusCounts.checked_in, color: 'bg-green-100 text-green-700' },
                    { label: 'Check-out', count: statusCounts.checked_out, color: 'bg-gray-100 text-gray-700' },
                    { label: 'Canceladas', count: statusCounts.cancelled, color: 'bg-red-100 text-red-700' },
                    { label: 'No Show', count: statusCounts.no_show, color: 'bg-yellow-100 text-yellow-700' },
                  ].map(item => (
                    <div key={item.label} className={`rounded-lg p-3 text-center ${item.color}`}>
                      <p className="text-2xl font-bold">{item.count}</p>
                      <p className="text-xs font-medium">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Costo / ingreso total por tipo de habitación */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por Tipo de Habitación</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueByRoomType.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay reservas en este período</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    {/* Gráfico de barras horizontal */}
                    <ResponsiveContainer width="100%" height={Math.max(180, revenueByRoomType.length * 56)}>
                      <BarChart data={revenueByRoomType} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis type="category" dataKey="type" width={90} />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="revenue" name="Ingresos" radius={[0, 4, 4, 0]}>
                          {revenueByRoomType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Tabla */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-center">Reservas</TableHead>
                            <TableHead className="text-center">Noches</TableHead>
                            <TableHead className="text-right">Ingreso total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenueByRoomType.map((row) => (
                            <TableRow key={row.type}>
                              <TableCell className="font-medium">{row.type}</TableCell>
                              <TableCell className="text-center">{row.reservations}</TableCell>
                              <TableCell className="text-center">{row.nights}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(row.revenue)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-gray-50 font-bold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center">{totalReservationsCount}</TableCell>
                            <TableCell className="text-center">{roomTypeNightsTotal}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totalReservationsAmount)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ingresos por habitación individual (cada cabaña por su nombre) */}
            <Card>
              <CardHeader>
                <CardTitle>Ingresos por Habitación</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueByRoom.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No hay reservas en este período</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    {/* Gráfico de barras horizontal */}
                    <ResponsiveContainer width="100%" height={Math.max(180, revenueByRoom.length * 48)}>
                      <BarChart data={revenueByRoom} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis type="category" dataKey="label" width={110} />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="revenue" name="Ingresos" radius={[0, 4, 4, 0]}>
                          {revenueByRoom.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Tabla */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Habitación</TableHead>
                            <TableHead className="text-center">Reservas</TableHead>
                            <TableHead className="text-center">Noches</TableHead>
                            <TableHead className="text-right">Ingreso total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenueByRoom.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium">{row.label}</TableCell>
                              <TableCell className="text-center">{row.reservations}</TableCell>
                              <TableCell className="text-center">{row.nights}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(row.revenue)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-gray-50 font-bold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center">{totalReservationsCount}</TableCell>
                            <TableCell className="text-center">{roomTypeNightsTotal}</TableCell>
                            <TableCell className="text-right">{formatCurrency(totalReservationsAmount)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Estado de habitaciones */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Habitaciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Disponibles', count: hotelRooms.filter(r => r.status === 'available').length, color: 'bg-green-500' },
                    { label: 'Ocupadas', count: occupiedRooms, color: 'bg-red-500' },
                    { label: 'Limpieza', count: hotelRooms.filter(r => r.status === 'cleaning').length, color: 'bg-yellow-500' },
                    { label: 'Mantenimiento', count: hotelRooms.filter(r => r.status === 'maintenance').length, color: 'bg-gray-500' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-4 h-4 rounded-full ${item.color}`} />
                      <div>
                        <p className="text-lg font-bold text-gray-900">{item.count}</p>
                        <p className="text-xs text-gray-500">{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mini mapa de habitaciones */}
                <div className="flex flex-wrap gap-1.5">
                  {hotelRooms
                    .sort((a, b) => (a.number || '').localeCompare(b.number || '', undefined, { numeric: true }))
                    .map(room => (
                      <div
                        key={room.id}
                        className={`w-12 h-10 rounded flex items-center justify-center text-xs font-bold text-white ${
                          room.status === 'available' ? 'bg-green-500'
                            : room.status === 'occupied' ? 'bg-red-500'
                            : room.status === 'cleaning' ? 'bg-yellow-500'
                            : 'bg-gray-500'
                        }`}
                        title={`${room.number} - ${room.status}`}
                      >
                        {room.number}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Tabla de reservas recientes */}
            <Card>
              <CardHeader>
                <CardTitle>Reservas del Período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Hab.</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead className="text-center">Noches</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">No hay reservas en este período</TableCell>
                        </TableRow>
                      ) : (
                        filteredRes
                          .sort((a, b) => (b.checkIn || '').localeCompare(a.checkIn || ''))
                          .slice(0, 30)
                          .map(res => (
                            <TableRow key={res.id}>
                              <TableCell className="font-medium">{res.guestName}</TableCell>
                              <TableCell>{res.roomNumber}</TableCell>
                              <TableCell className="text-sm">{res.checkIn ? new Date(res.checkIn + 'T00:00:00').toLocaleDateString('es-PE') : '-'}</TableCell>
                              <TableCell className="text-sm">{res.checkOut ? new Date(res.checkOut + 'T00:00:00').toLocaleDateString('es-PE') : '-'}</TableCell>
                              <TableCell className="text-center">{res.nights || '-'}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(res.totalAmount || 0)}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  res.status === 'checked_in' ? 'success'
                                    : res.status === 'confirmed' ? 'primary'
                                    : res.status === 'checked_out' ? 'default'
                                    : res.status === 'cancelled' ? 'danger'
                                    : 'warning'
                                }>
                                  {res.status === 'confirmed' ? 'Confirmada'
                                    : res.status === 'checked_in' ? 'Check-in'
                                    : res.status === 'checked_out' ? 'Check-out'
                                    : res.status === 'cancelled' ? 'Cancelada'
                                    : 'No Show'}
                                </Badge>
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
        )
      })()}
    </div>
  )
}

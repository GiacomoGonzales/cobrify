import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileText,
  Package,
  DollarSign,
  Plus,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Store,
  Eye,
  EyeOff,
  Receipt,
  ShoppingBag,
  Trophy,
  CreditCard,
  Award,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getAggregateFromServer, sum } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAppContext } from '@/hooks/useAppContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Alert from '@/components/ui/Alert'
import SalesChart from '@/components/charts/SalesChart'
import MonthlyDailySalesChart from '@/components/charts/MonthlyDailySalesChart'
import YearlyMonthlyChart from '@/components/charts/YearlyMonthlyChart'
import PaymentMethodsPieChart from '@/components/charts/PaymentMethodsPieChart'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getDocumentTotalInBase, isMultiCurrencyEnabled, normalizeCurrency } from '@/utils/currency'
import { getRecentInvoices, getProducts } from '@/services/firestoreService'
import { useBranding } from '@/contexts/BrandingContext'
import { getActiveBranches } from '@/services/branchService'
import { getTables } from '@/services/tableService'
import { useLocationAccess } from '@/utils/locationAccess'
import HotelDashboard from '@/components/hotel/HotelDashboard'

export default function Dashboard() {
  const { user, isDemoMode, demoData, getBusinessId, isAdmin, isBusinessOwner, filterBranchesByAccess, businessMode, hasMainBranchAccess, businessSettings, allowedBranches, allowedWarehouses } = useAppContext()
  // Filtro de seguridad por ubicación (sucursal/almacén) para usuarios secundarios.
  // Mismo helper compartido que usa Ventas/InvoiceList — usa allowedBranches/allowedWarehouses.
  const canAccess = useLocationAccess()
  // ¿El usuario está restringido a ciertas sucursales/almacenes? (owner/admin nunca lo están)
  const restringido = !isBusinessOwner && !isAdmin && ((allowedBranches?.length > 0) || (allowedWarehouses?.length > 0))
  // Multi-divisa: solo si el negocio activó la flag en Configuración.
  const dashMultiCurrencyOn = isMultiCurrencyEnabled(businessSettings)
  const { branding } = useBranding()
  const location = useLocation()
  const [invoices, setInvoices] = useState([])
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('all')
  const [showAmounts, setShowAmounts] = useState(() => localStorage.getItem('dashboard_show_amounts') === 'true')
  const [openTablesAmount, setOpenTablesAmount] = useState(0) // Suma de mesas ocupadas (modo restaurante)
  // Aggregates mensuales del gráfico de 12 meses (Fase B: server-side, no descarga
  // miles de invoices, solo 12 queries de sum).
  const [monthlyYearData, setMonthlyYearData] = useState([])
  const [monthlyYearLoading, setMonthlyYearLoading] = useState(false)
  // Si los aggregates fallan (índice faltante de Firestore o similar), marcamos
  // un error suave para que la UI muestre un mensaje claro en vez del chart vacío.
  const [monthlyYearError, setMonthlyYearError] = useState(false)

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
      if (location.pathname.startsWith('/demologistics')) return '/demologistics'
      return '/demo'
    }
    return '/app'
  }

  const routePrefix = getRoutePrefix()

  useEffect(() => {
    loadDashboardData()
    loadBranches()
    loadMonthlyAggregates()
    // allowedBranches/allowedWarehouses en deps: si cambian los permisos del usuario
    // secundario, recargamos para re-saturar facturas y recomputar el gráfico de 12 meses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode, allowedBranches, allowedWarehouses])

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

  // Cargar aggregates mensuales para el gráfico de 12 meses.
  // Server-side: 12 queries paralelas de sum('total'), no descarga los invoices.
  // En demo mode computa desde demoData.invoices en memoria.
  const loadMonthlyAggregates = async () => {
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const today = new Date()
    const peruDate = today.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [currentYear, currentMonth] = peruDate.split('-').map(Number)

    // Construir las 12 ventanas de mes (de 11 atrás hasta el actual)
    const windows = []
    for (let i = 11; i >= 0; i--) {
      let m = currentMonth - i
      let y = currentYear
      while (m <= 0) { m += 12; y -= 1 }
      const monthStart = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00-05:00`)
      const nextMonth = m === 12 ? 1 : m + 1
      const nextYear = m === 12 ? y + 1 : y
      const monthEnd = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00-05:00`)
      const label = m === 1 || i === 11
        ? `${monthNames[m - 1]} ${String(y).slice(-2)}`
        : monthNames[m - 1]
      // year/monthNum se conservan crudos (no derivados de monthStart.getMonth())
      // para evitar desfases por la timezone del browser.
      windows.push({ monthStart, monthEnd, label, year: y, monthNum: m })
    }

    // En demo: computar desde demoData.invoices
    if (isDemoMode && demoData?.invoices) {
      const data = windows.map(w => {
        const ventas = (demoData.invoices || []).reduce((sum, inv) => {
          const invDate = inv.emissionDate
            ? new Date(inv.emissionDate + 'T12:00:00')
            : inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
          if (!invDate) return sum
          if (invDate >= w.monthStart && invDate < w.monthEnd) {
            return sum + (Number(inv.total) || 0)
          }
          return sum
        }, 0)
        return { month: w.label, year: w.year, monthNum: w.monthNum, ventas }
      })
      setMonthlyYearData(data)
      return
    }

    if (!user?.uid) return
    const businessId = getBusinessId()
    if (!businessId) return

    // OPCIÓN A — Usuario secundario restringido a ciertas sucursales/almacenes:
    // el aggregate server-side sum('total') NO se puede filtrar por ubicación, así que
    // traemos las facturas de los últimos 12 meses y sumamos en el cliente SOLO las que
    // pasan canAccess. Más caro en reads, pero correcto. Owner/admin y usuarios sin
    // restricción siguen usando el aggregate (rápido) en el bloque de abajo.
    if (restringido) {
      // El inicio de la ventana más antigua (11 meses atrás) es nuestra fecha "desde".
      const since = windows[0].monthStart
      setMonthlyYearLoading(true)
      setMonthlyYearError(false)
      try {
        const result = await getRecentInvoices(businessId, since)
        if (!result.success) throw new Error(result.error || 'getRecentInvoices falló')
        // Mismo cálculo de fecha que la rama demo (emissionDate → mediodía, sino createdAt)
        // para bucketear coherente con monthStart/monthEnd.
        const invoicesIn12m = (result.data || []).filter(canAccess)
        const data = windows.map(w => {
          const ventas = invoicesIn12m.reduce((acc, inv) => {
            const invDate = inv.emissionDate
              ? new Date(inv.emissionDate + 'T12:00:00')
              : inv.createdAt?.toDate?.() || (inv.createdAt ? new Date(inv.createdAt) : null)
            if (!invDate) return acc
            if (invDate >= w.monthStart && invDate < w.monthEnd) {
              return acc + (Number(inv.total) || 0)
            }
            return acc
          }, 0)
          return { month: w.label, year: w.year, monthNum: w.monthNum, ventas }
        })
        setMonthlyYearData(data)
      } catch (error) {
        console.warn('⚠️ No se pudo calcular el gráfico de 12 meses (usuario restringido):', error)
        setMonthlyYearData([])
        setMonthlyYearError(true)
      } finally {
        setMonthlyYearLoading(false)
      }
      return
    }

    setMonthlyYearLoading(true)
    setMonthlyYearError(false)
    try {
      // 12 queries en paralelo: server-side sum('total') por mes.
      // Cada aggregation cobra 1 read por cada 1000 documentos en el rango
      // (mucho más barato que descargar todos los invoices).
      // Requiere índice compuesto (createdAt ASC, total ASC) sobre `invoices`.
      const queries = windows.map(w =>
        getAggregateFromServer(
          query(
            collection(db, 'businesses', businessId, 'invoices'),
            where('createdAt', '>=', w.monthStart),
            where('createdAt', '<', w.monthEnd)
          ),
          { totalSum: sum('total') }
        )
      )
      const results = await Promise.all(queries)
      const data = results.map((res, idx) => ({
        month: windows[idx].label,
        year: windows[idx].year,
        monthNum: windows[idx].monthNum,
        ventas: res.data().totalSum || 0,
      }))
      setMonthlyYearData(data)
    } catch (error) {
      // El error más común es "failed-precondition" cuando falta el índice
      // compuesto (createdAt + total). Está definido en firestore.indexes.json:
      // deploy con `firebase deploy --only firestore:indexes` y espera 1-10 min.
      console.warn(
        '⚠️ Aggregates mensuales no disponibles. ' +
        'Verifica que el índice (createdAt, total) sobre `invoices` esté creado. ' +
        'Deploy: firebase deploy --only firestore:indexes'
      )
      setMonthlyYearData([])
      setMonthlyYearError(true)
    } finally {
      setMonthlyYearLoading(false)
    }
  }

  // Helper: Obtener medianoche de hoy en hora Perú (UTC-5)
  // useCallback con [] → referencia estable, no invalida useMemos.
  const getStartOfTodayPeru = useCallback(() => {
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) // 'YYYY-MM-DD'
    return new Date(peruDate + 'T00:00:00-05:00')
  }, [])

  // Helper: Obtener inicio del mes actual en hora Perú
  const getStartOfMonthPeru = useCallback(() => {
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [year, month] = peruDate.split('-')
    return new Date(`${year}-${month}-01T00:00:00-05:00`)
  }, [])

  // Helper: Obtener inicio del día N días atrás en hora Perú
  const getDaysAgo = useCallback((days) => {
    const today = (() => {
      const now = new Date()
      const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      return new Date(peruDate + 'T00:00:00-05:00')
    })()
    return new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
  }, [])

  const loadDashboardData = async () => {
    if (isDemoMode && demoData) {
      // Load demo data
      setInvoices(demoData.invoices || [])
      setProducts(demoData.products || [])
      // El monto de mesas abiertas se calcula en el useEffect dedicado (respeta filterBranch).
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

      // If we need to hide data, don't load anything
      if (shouldHideData) {
        setInvoices([])
        setProducts([])
        setIsLoading(false)
        return
      }

      // Cargar facturas desde 2 meses atrás (inicio del mes anterior).
      // Suficiente para: 7 días (gráfico semanal), mes actual (gráfico diario,
      // top productos/clientes/pagos) y mes anterior (comparación %).
      // El gráfico de 12 meses NO se computa aquí — usa server-side aggregations
      // separadas (mucho más livianas que descargar miles de invoices).
      const twoMonthsAgo = new Date()
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
      twoMonthsAgo.setDate(1)
      twoMonthsAgo.setHours(0, 0, 0, 0)
      const sinceDate = twoMonthsAgo

      const [invoicesResult, productsResult] = await Promise.all([
        getRecentInvoices(businessId, sinceDate),
        getProducts(businessId),
      ])

      if (invoicesResult.success) {
        // Filtrar por sucursales/almacenes permitidos del usuario (seguridad de usuarios secundarios).
        // Sanea el estado base → KPIs, gráficos, top productos/clientes/pagos lo respetan.
        setInvoices((invoicesResult.data || []).filter(canAccess))
      }
      if (productsResult.success) {
        setProducts(productsResult.data || [])
      }

      // El monto de mesas abiertas (modo restaurante) se calcula en un useEffect
      // aparte que depende de filterBranch, para que respete el selector de sede
      // y los permisos de ubicación del usuario.
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Monto de mesas abiertas (solo modo restaurante).
  // En un efecto aparte que depende de filterBranch para que el monto respete el
  // selector de sede del Dashboard. Además aplica canAccess (permisos de ubicación):
  // un usuario restringido nunca suma mesas de sedes fuera de allowedBranches, y si
  // no tiene acceso a la Principal, las mesas sin branchId tampoco se cuentan.
  useEffect(() => {
    if (businessMode !== 'restaurant') {
      setOpenTablesAmount(0)
      return
    }

    // Misma semántica que branchFilteredInvoices para el selector de sede:
    // 'all' = todas, 'main' = sin branchId (Principal), <id> = esa sede.
    const matchesBranch = (t) =>
      filterBranch === 'all'
        ? true
        : filterBranch === 'main'
          ? !t.branchId
          : t.branchId === filterBranch

    const sumOpen = (list) =>
      (list || [])
        .filter(t => canAccess(t) && matchesBranch(t) && t.status === 'occupied')
        .reduce((acc, t) => acc + (t.amount || 0), 0)

    // Modo demo: usar las mesas de demoData
    if (isDemoMode) {
      setOpenTablesAmount(Array.isArray(demoData?.tables) ? sumOpen(demoData.tables) : 0)
      return
    }

    if (!user?.uid) return

    let cancelled = false
    const loadOpenTablesAmount = async () => {
      try {
        const result = await getTables(getBusinessId())
        if (cancelled) return
        setOpenTablesAmount(result.success ? sumOpen(result.data) : 0)
      } catch (error) {
        if (!cancelled) {
          console.error('Error al cargar monto de mesas abiertas:', error)
          setOpenTablesAmount(0)
        }
      }
    }
    loadOpenTablesAmount()
    return () => { cancelled = true }
    // canAccess es un closure recreado cada render; se omite de deps a propósito
    // (lee de allowedBranches, que sí está en deps). Mismo patrón que el resto del archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isDemoMode, demoData, businessMode, filterBranch, allowedBranches])

  // Helper to get date from invoice - usa fecha de emisión si existe, sino createdAt
  const getInvoiceDate = useCallback((inv) => {
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
  }, [])

  // === Filtrado por sucursal (memoized) ===
  // `invoices` ya viene saneado por permisos de ubicación (loadDashboardData), pero
  // re-filtramos por canAccess como red de seguridad (idempotente para usuarios sin
  // restricción).
  const branchFilteredInvoices = useMemo(() => {
    const base = invoices.filter(canAccess)
    return filterBranch === 'all'
      ? base
      : filterBranch === 'main'
        ? base.filter(inv => !inv.branchId)
        : base.filter(inv => inv.branchId === filterBranch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, filterBranch])

  // === Filtrado de facturas válidas (memoized) ===
  // Excluye notas de crédito/débito, notas de venta convertidas, anuladas y
  // archivadas. Solo se recomputa cuando cambian las facturas o el filtro.
  const validInvoicesForSales = useMemo(() => {
    return branchFilteredInvoices.filter(inv => {
      if (inv.documentType === 'nota_credito' || inv.documentType === 'nota_debito') return false
      if (inv.documentType === 'nota_venta' && inv.convertedTo) return false
      if (inv.status === 'cancelled' || inv.status === 'voided' ||
          inv.status === 'pending_cancellation' || inv.status === 'partial_refund_pending') return false
      if (inv.sunatStatus === 'voiding' || inv.sunatStatus === 'voided') return false
      if (inv.archived === true) return false
      return true
    })
  }, [branchFilteredInvoices])

  // === Stats del día (memoized: un solo pase calcula hoy + ayer) ===
  const todayStats = useMemo(() => {
    const todayStart = getStartOfTodayPeru()
    const yesterdayStart = getDaysAgo(1)
    const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

    let todaySales = 0
    let todaySalesUSD = 0
    let yesterdaySales = 0

    for (const inv of validInvoicesForSales) {
      const invDate = getInvoiceDate(inv)
      if (!invDate) continue
      const totalBase = getDocumentTotalInBase(inv)
      if (invDate >= todayStart) {
        todaySales += totalBase
        if (normalizeCurrency(inv.currency) === 'USD') {
          todaySalesUSD += Number(inv.total) || 0
        }
      } else if (invDate >= yesterdayStart && invDate <= yesterdayEnd) {
        yesterdaySales += totalBase
      }
    }
    return { todaySales, todaySalesUSD, yesterdaySales }
  }, [validInvoicesForSales, getStartOfTodayPeru, getDaysAgo, getInvoiceDate])

  const todaysSales = todayStats.todaySales
  const todaysSalesUSD = todayStats.todaySalesUSD
  const yesterdaySales = todayStats.yesterdaySales
  const todayChange = yesterdaySales > 0
    ? ((todaysSales - yesterdaySales) / yesterdaySales * 100).toFixed(1)
    : todaysSales > 0 ? '+100.0' : '0.0'

  // === Stats del mes (memoized, single-pass) ===
  // UN SOLO recorrido de las facturas calcula:
  //   monthSales, monthSalesUSD, monthSalesCount, avgTicketMonth,
  //   dailyMonthData (bucket por día), avgDailyMonth,
  //   topProducts (aggregando items), topCustomers (por cliente),
  //   paymentMethodsData (por método de pago).
  // Esto reemplaza ~60 iteraciones anteriores con UNA sola.
  const monthStats = useMemo(() => {
    const monthStart = getStartOfMonthPeru()
    const dailyMap = {}
    const productMap = {}
    const customerMap = {}
    const paymentMap = {}
    let monthSales = 0
    let monthSalesUSD = 0
    let monthCount = 0

    for (const inv of validInvoicesForSales) {
      const invDate = getInvoiceDate(inv)
      if (!invDate || invDate < monthStart) continue

      const totalBase = getDocumentTotalInBase(inv)
      const currency = normalizeCurrency(inv.currency)

      monthSales += totalBase
      if (currency === 'USD') monthSalesUSD += Number(inv.total) || 0
      monthCount++

      // Bucket por día del mes (1..N)
      const day = invDate.getDate()
      dailyMap[day] = (dailyMap[day] || 0) + totalBase

      // Top productos (aggrega items)
      const items = inv.items || []
      for (let j = 0; j < items.length; j++) {
        const item = items[j]
        const key = item.productId || item.name || 'sin-nombre'
        let entry = productMap[key]
        if (!entry) {
          entry = { name: item.name || 'Producto sin nombre', quantity: 0, total: 0 }
          productMap[key] = entry
        }
        const qty = Number(item.quantity) || 0
        entry.quantity += qty
        entry.total += Number(item.total) || qty * (Number(item.price) || 0)
      }

      // Top clientes
      const customer = inv.customer
      if (customer) {
        const ckey = customer.documentNumber || customer.name || customer.businessName
        if (ckey) {
          let centry = customerMap[ckey]
          if (!centry) {
            centry = {
              name: customer.businessName || customer.name || 'Cliente sin nombre',
              document: customer.documentNumber || '',
              total: 0,
              count: 0,
            }
            customerMap[ckey] = centry
          }
          centry.total += totalBase
          centry.count += 1
        }
      }

      // Métodos de pago (split o legacy)
      if (Array.isArray(inv.payments) && inv.payments.length > 0) {
        const rate = Number(inv.exchangeRate) || 1
        const isUSD = currency === 'USD'
        for (let k = 0; k < inv.payments.length; k++) {
          const p = inv.payments[k]
          const method = p.method || 'Otro'
          const amount = Number(p.amount) || 0
          paymentMap[method] = (paymentMap[method] || 0) + (isUSD ? amount * rate : amount)
        }
      } else if (inv.paymentMethod) {
        paymentMap[inv.paymentMethod] = (paymentMap[inv.paymentMethod] || 0) + totalBase
      }
    }

    // Construir dailyMonthData (1..N días del mes)
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [year, month, dayStr] = peruDate.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const todayDay = dayStr
    const dailyMonthData = []
    for (let d = 1; d <= daysInMonth; d++) {
      dailyMonthData.push({ day: d, ventas: dailyMap[d] || 0, isFuture: d > todayDay })
    }
    // Promedio solo con días CERRADOS: excluye el día en curso (todayDay), que
    // recién empieza y arrastraría el promedio hacia abajo.
    const closedDays = Math.max(todayDay - 1, 0)
    let closedDaysSales = 0
    for (let d = 1; d <= closedDays; d++) closedDaysSales += (dailyMap[d] || 0)
    const avgDailyMonth = closedDays > 0 ? closedDaysSales / closedDays : 0

    // Top 5 productos / clientes ordenados
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
    const topCustomers = Object.values(customerMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    // Métodos de pago con porcentaje
    const paymentsTotal = Object.values(paymentMap).reduce((s, v) => s + v, 0)
    const paymentMethodsData = Object.entries(paymentMap)
      .map(([name, value]) => ({
        name,
        value,
        percent: paymentsTotal > 0 ? (value / paymentsTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)

    return {
      monthSales,
      monthSalesUSD,
      monthCount,
      avgTicketMonth: monthCount > 0 ? monthSales / monthCount : 0,
      dailyMonthData,
      avgDailyMonth,
      topProducts,
      topCustomers,
      paymentMethodsData,
    }
  }, [validInvoicesForSales, getStartOfMonthPeru, getInvoiceDate])

  // === Chart 12 meses ajustado con datos validados ===
  // El aggregate server-side sum('total') incluye TODO: notas de crédito/débito,
  // anuladas, notas de venta convertidas, archivadas, y suma USD sin convertir.
  // Para los meses ya cargados localmente (~3 meses) reemplazamos el valor con
  // el total validado (mismo cálculo que "Ventas del Mes"). Meses más antiguos
  // siguen mostrando el aggregate — aproximado pero barato en reads.
  const monthlyYearDataAdjusted = useMemo(() => {
    if (!monthlyYearData.length) return monthlyYearData
    const localTotals = new Map()
    for (const inv of validInvoicesForSales) {
      const date = getInvoiceDate(inv)
      if (!date) continue
      // Año/mes en hora Perú — debe coincidir con cómo se arman los buckets.
      const peruYmd = date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const [yStr, mStr] = peruYmd.split('-')
      const key = `${parseInt(yStr, 10)}-${parseInt(mStr, 10)}`
      localTotals.set(key, (localTotals.get(key) || 0) + getDocumentTotalInBase(inv))
    }
    return monthlyYearData.map(entry => {
      if (entry.year == null || entry.monthNum == null) return entry
      const key = `${entry.year}-${entry.monthNum}`
      return localTotals.has(key) ? { ...entry, ventas: localTotals.get(key) } : entry
    })
  }, [monthlyYearData, validInvoicesForSales, getInvoiceDate])

  const monthSales = monthStats.monthSales
  const monthSalesUSD = monthStats.monthSalesUSD
  const monthSalesCount = monthStats.monthCount
  const avgTicketMonth = monthStats.avgTicketMonth
  const dailyMonthData = monthStats.dailyMonthData
  const avgDailyMonth = monthStats.avgDailyMonth
  const topProducts = monthStats.topProducts
  const topCustomers = monthStats.topCustomers
  const paymentMethodsData = monthStats.paymentMethodsData

  // === Ventas mes ANTERIOR (memoized) ===
  const prevMonthSales = useMemo(() => {
    const now = new Date()
    const peruDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const [year, month] = peruDate.split('-').map(Number)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevMonthStart = new Date(`${prevYear}-${String(prevMonth).padStart(2, '0')}-01T00:00:00-05:00`)
    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00-05:00`)

    let total = 0
    for (const inv of validInvoicesForSales) {
      const invDate = getInvoiceDate(inv)
      if (!invDate) continue
      if (invDate >= prevMonthStart && invDate < monthStart) {
        total += getDocumentTotalInBase(inv)
      }
    }
    return total
  }, [validInvoicesForSales, getInvoiceDate])

  const monthChange = prevMonthSales > 0
    ? ((monthSales - prevMonthSales) / prevMonthSales * 100).toFixed(1)
    : monthSales > 0 ? '+100.0' : '0.0'

  // === Ventas de los últimos 7 días (memoized, single-pass con map por día) ===
  const salesData = useMemo(() => {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const fourteenDaysAgo = getDaysAgo(13) // 14 días = de hoy hasta 13 atrás
    const todayEnd = new Date(getStartOfTodayPeru().getTime() + 24 * 60 * 60 * 1000 - 1)
    // Bucketear por clave 'YYYY-MM-DD' en zona Perú
    const dayMap = {}
    for (const inv of validInvoicesForSales) {
      const invDate = getInvoiceDate(inv)
      if (!invDate || invDate < fourteenDaysAgo || invDate > todayEnd) continue
      const key = invDate.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      dayMap[key] = (dayMap[key] || 0) + getDocumentTotalInBase(inv)
    }
    const data = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = getDaysAgo(i)
      const prevDayStart = getDaysAgo(i + 7)
      const dayKey = dayStart.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const prevDayKey = prevDayStart.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      data.push({
        name: dayNames[dayStart.getDay()],
        ventas: dayMap[dayKey] || 0,
        ventasAnterior: dayMap[prevDayKey] || 0,
      })
    }
    return data
  }, [validInvoicesForSales, getDaysAgo, getStartOfTodayPeru, getInvoiceDate])

  // === Productos con stock bajo (memoized) ===
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const threshold = Number.isFinite(Number(p.minStock)) && Number(p.minStock) >= 0
        ? Number(p.minStock)
        : 3
      if (p.hasVariants && p.variants?.length > 0) {
        const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
        return totalStock <= threshold
      }
      return p.stock !== null && p.stock <= threshold
    })
  }, [products])

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
      // Multi-divisa: línea info "+ $ X USD" si hubo ventas USD hoy
      usdSubtitle: dashMultiCurrencyOn && todaysSalesUSD > 0 && showAmounts
        ? `+ ${formatCurrency(todaysSalesUSD, 'USD')} USD (incluido en el total)`
        : null,
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
      usdSubtitle: dashMultiCurrencyOn && monthSalesUSD > 0 && showAmounts
        ? `+ ${formatCurrency(monthSalesUSD, 'USD')} USD (incluido en el total)`
        : null,
      icon: TrendingUp,
      change: prevMonthSales > 0
        ? (monthSales >= prevMonthSales ? `+${monthChange}% vs mes anterior` : `${monthChange}% vs mes anterior`)
        : (monthSales > 0 ? 'Primer mes con ventas' : 'Sin ventas aún'),
      changeType: prevMonthSales > 0
        ? (monthSales >= prevMonthSales ? 'positive' : 'negative')
        : 'positive',
      isSalesAmount: true,
    },
    {
      title: 'Ticket Promedio (mes)',
      value: showAmounts ? formatCurrency(avgTicketMonth) : hiddenAmount,
      icon: Receipt,
      change: monthSalesCount > 0 ? `Sobre ${monthSalesCount} venta${monthSalesCount !== 1 ? 's' : ''}` : 'Sin ventas',
      changeType: 'positive',
      isSalesAmount: true,
    },
    {
      title: 'N° Ventas (mes)',
      subtitle: monthRangeLabel,
      value: monthSalesCount,
      icon: ShoppingBag,
      change: monthSalesCount > 0 ? 'Comprobantes emitidos' : 'Sin ventas',
      changeType: 'positive',
    },
  ]

  // Últimas 5 facturas (memoized)
  const recentInvoices = useMemo(() => {
    return [...invoices]
      .sort((a, b) => {
        const dateA = getInvoiceDate(a)
        const dateB = getInvoiceDate(b)
        if (!dateA || !dateB) return 0
        return dateB - dateA
      })
      .slice(0, 5)
  }, [invoices, getInvoiceDate])

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
    <div className="relative space-y-6 animate-fade-in">
      {/* Degradado tenue de fondo (mismo lenguaje visual que login/landing), solo decorativo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-4 inset-x-0 h-72 -z-10"
        style={{
          background:
            'radial-gradient(46% 90% at 12% 0%, rgba(37, 99, 235, 0.07), transparent 70%), radial-gradient(40% 80% at 60% 0%, rgba(6, 182, 212, 0.06), transparent 70%), radial-gradient(36% 70% at 95% 0%, rgba(59, 130, 246, 0.05), transparent 70%)',
        }}
      />
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
                {hasMainBranchAccess && <option value="main">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
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

      {/* Stats Grid — el icono queda en la esquina superior derecha (alineado
          al título), tamaño fijo, sin competir por el ancho con el valor.
          `items-start` evita que se mueva según la cantidad de líneas de cada
          card; `flex-shrink-0` lo blinda contra valores largos. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">{stat.title}</p>
                    {stat.isSalesAmount && (
                      <button
                        onClick={toggleShowAmounts}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}
                      >
                        {showAmounts ? (
                          <Eye className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                        )}
                      </button>
                    )}
                  </div>
                  {stat.subtitle && (
                    <p className="text-xs text-primary-600 mt-0.5">{stat.subtitle}</p>
                  )}
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-2 truncate">{stat.value}</p>
                  {stat.usdSubtitle && (
                    <p className="text-xs text-emerald-700 mt-0.5 font-medium">{stat.usdSubtitle}</p>
                  )}
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
                {/* Ícono suelto (sin chip), mismo patrón que las stat cards de Inventario */}
                <stat.icon
                  className={`w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 ${
                    stat.changeType === 'danger'
                      ? 'text-red-600'
                      : stat.changeType === 'warning'
                      ? 'text-yellow-600'
                      : 'text-primary-600'
                  }`}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos principales: mes actual día por día + últimos 12 meses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ventas del mes</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Día por día — {monthRangeLabel}</p>
            </div>
          </CardHeader>
          <CardContent>
            <MonthlyDailySalesChart data={dailyMonthData} avgDaily={avgDailyMonth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Últimos 12 meses</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Curva de crecimiento del negocio</p>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyYearLoading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : monthlyYearError ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-center px-4">
                <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                <p className="text-sm text-gray-700 font-medium">Gráfico no disponible</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  Necesita un índice de Firestore que se está creando.
                  Vuelve a recargar en unos minutos.
                </p>
              </div>
            ) : (
              <YearlyMonthlyChart data={monthlyYearDataAdjusted} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico semanal (comparativa 7 días vs semana anterior) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ventas de los últimos 7 días</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Comparado con la semana anterior</p>
          </div>
        </CardHeader>
        <CardContent>
          <SalesChart data={salesData} />
        </CardContent>
      </Card>

      {/* Análisis del mes: Top productos / Métodos de pago / Top clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 5 productos más vendidos del mes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-gray-500" />
              <CardTitle>Top productos del mes</CardTitle>
            </div>
            <p className="text-xs text-gray-500 mt-1">Por unidades vendidas</p>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                Sin ventas este mes
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.quantity} und · {showAmounts ? formatCurrency(p.total) : 'S/ ****'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Métodos de pago */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <CardTitle>Métodos de pago</CardTitle>
            </div>
            <p className="text-xs text-gray-500 mt-1">Cómo te pagaron este mes</p>
          </CardHeader>
          <CardContent>
            <PaymentMethodsPieChart data={paymentMethodsData} />
          </CardContent>
        </Card>

        {/* Top 5 clientes del mes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gray-500" />
              <CardTitle>Top clientes del mes</CardTitle>
            </div>
            <p className="text-xs text-gray-500 mt-1">Por monto comprado</p>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                Sin clientes identificados este mes
              </div>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {c.count} compra{c.count !== 1 ? 's' : ''} · {showAmounts ? formatCurrency(c.total) : 'S/ ****'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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

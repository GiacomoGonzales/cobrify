import React, { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useLocationAccess } from '@/utils/locationAccess'
import { useHidePrivateData } from '@/hooks/useHidePrivateData'
import { useToast } from '@/contexts/ToastContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { matchesSearchQuery } from '@/lib/utils'
import Button from '@/components/ui/Button'
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS
} from '@/services/expenseService'
import { getActiveBranches } from '@/services/branchService'
import { isMultiCurrencyEnabled, normalizeCurrency, convertToBase } from '@/utils/currency'
import { getRateForDate } from '@/services/exchangeRateService'
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Calendar,
  X,
  Edit2,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  DollarSign,
  TrendingDown,
  Package,
  Truck,
  Users,
  FileText,
  Wrench,
  Megaphone,
  Building,
  MoreHorizontal,
  MoreVertical,
  Zap,
  AlertTriangle,
  Store
} from 'lucide-react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import ExpenseCategoriesManager from '@/components/ExpenseCategoriesManager'
import { Tag } from 'lucide-react'

// Mapeo nombre lucide → componente. Se usa al renderizar el icono que el negocio
// asoció a su categoría custom (la categoría guarda solo el nombre del icono).
const ICON_COMPONENTS = {
  Zap, Building, Package, ShoppingBag: Package, Truck, Users, FileText,
  Wrench, Megaphone, CreditCard: Building, MoreHorizontal,
  Receipt, DollarSign, TrendingDown, Calendar, Filter, Search
}

function getCategoryIconComponent(category) {
  if (!category) return MoreHorizontal
  return ICON_COMPONENTS[category.icon] || MoreHorizontal
}

/**
 * Devuelve clases Tailwind para el badge en base al color hex de la categoría.
 * Convertimos hex a estilo inline porque Tailwind no puede generar clases dinámicamente.
 */
function getCategoryBadgeStyle(category) {
  const color = category?.color || '#64748B'
  return {
    backgroundColor: `${color}1A`, // 10% opacity
    color: color,
    borderColor: `${color}33`,     // 20% opacity
  }
}

// Datos demo de gastos
const DEMO_EXPENSES = [
  {
    id: 'demo-expense-1',
    amount: 350.00,
    description: 'Pago de luz del mes',
    category: 'servicios',
    date: new Date(),
    paymentMethod: 'transferencia',
    reference: 'REC-001234',
    supplier: 'Luz del Sur',
    notes: ''
  },
  {
    id: 'demo-expense-2',
    amount: 1200.00,
    description: 'Compra de insumos para cocina',
    category: 'proveedores',
    date: new Date(Date.now() - 86400000 * 2),
    paymentMethod: 'efectivo',
    reference: 'F001-00456',
    supplier: 'Distribuidora San Juan',
    notes: 'Arroz, aceite, condimentos'
  },
  {
    id: 'demo-expense-3',
    amount: 180.00,
    description: 'Servicio de agua',
    category: 'servicios',
    date: new Date(Date.now() - 86400000 * 5),
    paymentMethod: 'transferencia',
    reference: 'REC-78945',
    supplier: 'Sedapal',
    notes: ''
  },
  {
    id: 'demo-expense-4',
    amount: 450.00,
    description: 'Mantenimiento de equipos',
    category: 'mantenimiento',
    date: new Date(Date.now() - 86400000 * 7),
    paymentMethod: 'efectivo',
    reference: '',
    supplier: 'Técnico Luis',
    notes: 'Reparación de congeladora'
  },
  {
    id: 'demo-expense-5',
    amount: 85.00,
    description: 'Transporte de mercadería',
    category: 'transporte',
    date: new Date(Date.now() - 86400000 * 3),
    paymentMethod: 'efectivo',
    reference: '',
    supplier: 'Taxi carga',
    notes: ''
  },
]

// Obtener fecha local en formato YYYY-MM-DD (sin usar toISOString que convierte a UTC)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function Expenses() {
  const { user, isDemoMode, hasMainBranchAccess, businessSettings, allowedBranches, allowedWarehouses, filterBranchesByAccess } = useAppContext()
  // Seguridad: el usuario secundario solo ve gastos de sus sucursales habilitadas
  const canAccess = useLocationAccess()
  const hidePrivateData = useHidePrivateData()
  const expenseMultiCurrencyOn = isMultiCurrencyEnabled(businessSettings)
  const toast = useToast()
  const { isOffline } = useOnlineStatus()

  // Estados
  const [expenses, setExpenses] = useState([])
  // Gastos de los últimos 6 meses (independiente del filtro de fecha del listado)
  // → necesario para el gráfico de evolución mensual del tab Resumen.
  const [last6MonthsExpenses, setLast6MonthsExpenses] = useState([])
  const [expenseCategories, setExpenseCategories] = useState(DEFAULT_EXPENSE_CATEGORIES)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')

  // Sucursales
  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState('all') // 'all', 'main', or branch.id
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: getLocalDateString()
  })
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  // ID idempotente generado al abrir el modal de creación.
  // Garantiza que múltiples submits del MISMO formulario apunten al mismo doc
  // (sobreescriben en lugar de duplicar). Evita gastos repetidos cuando el
  // usuario hace click varias veces sin internet y la SDK encola los writes.
  const [clientRequestId, setClientRequestId] = useState(null)

  // Mobile menu states
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })
  const [visibleCount, setVisibleCount] = useState(20)
  const ITEMS_PER_PAGE = 20

  // Form state
  const [form, setForm] = useState({
    amount: '',
    description: '',
    category: 'otros',
    date: getLocalDateString(),
    paymentMethod: 'efectivo',
    reference: '',
    supplier: '',
    notes: '',
    branchId: '', // '' = gasto general/corporativo
    // Multi-divisa: solo se usa si la flag está activa
    currency: 'PEN',
    exchangeRate: 1,
  })
  const [loadingExpenseRate, setLoadingExpenseRate] = useState(false)
  const [expenseRateSource, setExpenseRateSource] = useState(null)

  // Cargar gastos y sucursales
  useEffect(() => {
    if (user?.uid) {
      loadExpenses()
      loadBranches()
      loadCategories()
    }
  }, [user?.uid, dateRange, allowedBranches, allowedWarehouses])

  async function loadCategories() {
    if (isDemoMode) {
      setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES)
      return
    }
    try {
      const result = await getExpenseCategories(user.uid)
      if (result.success && Array.isArray(result.data)) {
        setExpenseCategories(result.data)
      }
    } catch (error) {
      console.error('Error al cargar categorías de gastos:', error)
    }
  }

  // Helper: lookup de categoría por id (incluye archivadas para lookups históricos)
  const getCategoryById = (id) =>
    expenseCategories.find(c => c.id === id) || { id, name: id || 'Otros', color: '#64748B', icon: 'MoreHorizontal' }

  async function loadBranches() {
    if (isDemoMode) return
    try {
      const result = await getActiveBranches(user.uid)
      if (result.success) {
        setBranches(filterBranchesByAccess ? filterBranchesByAccess(result.data || []) : (result.data || []))
      }
    } catch (error) {
      console.error('Error al cargar sucursales:', error)
    }
  }

  async function loadExpenses() {
    setLoading(true)
    try {
      // MODO DEMO: Usar datos simulados
      if (isDemoMode) {
        console.log('🎭 MODO DEMO: Cargando gastos simulados...')
        await new Promise(resolve => setTimeout(resolve, 500))
        setExpenses(DEMO_EXPENSES)
        setLast6MonthsExpenses(DEMO_EXPENSES)
        setLoading(false)
        return
      }

      const data = await getExpenses(user.uid, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      })
      setExpenses((data || []).filter(canAccess))
    } catch (error) {
      toast.error('Error al cargar los gastos')
    } finally {
      setLoading(false)
    }
  }

  // Cargar gastos de los últimos 6 meses para el gráfico de evolución.
  // Independiente del filtro de fecha del listado. Se invoca al cambiar de
  // usuario y cada vez que se carga el listado (para que el chart se sincronice
  // tras crear/editar/eliminar un gasto).
  async function loadLast6MonthsExpenses() {
    if (!user?.uid || isDemoMode) return
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - 5, 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    try {
      const data = await getExpenses(user.uid, {
        startDate: getLocalDateString(start),
        endDate: getLocalDateString(end),
      })
      setLast6MonthsExpenses((data || []).filter(canAccess))
    } catch (err) {
      console.error('Error cargando gastos 6 meses:', err)
    }
  }

  useEffect(() => {
    loadLast6MonthsExpenses()
  }, [user?.uid, isDemoMode, expenses.length])

  // Filtrar y ordenar gastos
  const filteredExpenses = useMemo(() => {
    let result = [...expenses]

    // Filtro de búsqueda (insensible a acentos/tildes y mayúsculas)
    if (searchTerm) {
      result = result.filter(e => matchesSearchQuery(searchTerm, e.description, e.supplier, e.reference))
    }

    // Filtro de categoría
    if (categoryFilter !== 'all') {
      result = result.filter(e => e.category === categoryFilter)
    }

    // Filtro de método de pago
    if (paymentMethodFilter !== 'all') {
      result = result.filter(e => e.paymentMethod === paymentMethodFilter)
    }

    // Filtro de sucursal
    if (branchFilter !== 'all') {
      if (branchFilter === 'main') {
        // Sucursal principal (sin branchId)
        result = result.filter(e => !e.branchId || e.branchId === '' || e.branchId === 'main')
      } else {
        // Sucursal específica
        result = result.filter(e => e.branchId === branchFilter)
      }
    }

    // Ordenar
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (aVal instanceof Date) aVal = aVal.getTime()
      if (bVal instanceof Date) bVal = bVal.getTime()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [expenses, searchTerm, categoryFilter, paymentMethodFilter, branchFilter, sortField, sortDirection])

  const displayedExpenses = filteredExpenses.slice(0, visibleCount)
  const hasMore = filteredExpenses.length > visibleCount

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [searchTerm, categoryFilter, paymentMethodFilter, branchFilter, sortField, sortDirection])

  // Helper para obtener nombre de sucursal
  const getBranchName = (branchId) => {
    if (!branchId || branchId === '' || branchId === 'main') return businessSettings?.mainBranchName || 'Sucursal Principal'
    const branch = branches.find(b => b.id === branchId)
    return branch?.name || businessSettings?.mainBranchName || 'Sucursal Principal'
  }

  // Tab activo: 'list' (lista de gastos) o 'summary' (resumen con gráficos)
  const [activeTab, setActiveTab] = useState('list')

  // Modal de gestión de categorías de gasto
  const [showCategoriesModal, setShowCategoriesModal] = useState(false)

  // Atajos para setear rango de fechas rápido
  function applyDateShortcut(shortcut) {
    const today = new Date()
    let start, end
    switch (shortcut) {
      case 'today':
        start = end = new Date(today)
        break
      case 'week': {
        const dow = today.getDay() || 7 // domingo = 7
        start = new Date(today); start.setDate(today.getDate() - (dow - 1))
        end = new Date(start); end.setDate(start.getDate() + 6)
        break
      }
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        break
      case 'prevMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        end = new Date(today.getFullYear(), today.getMonth(), 0)
        break
      case 'year':
        start = new Date(today.getFullYear(), 0, 1)
        end = new Date(today.getFullYear(), 11, 31)
        break
      default:
        return
    }
    setDateRange({ startDate: getLocalDateString(start), endDate: getLocalDateString(end) })
  }

  // Calcular totales. Multi-divisa: sumar todo en PEN base (los gastos
  // USD se convierten con su TC congelado). totalUSD se acumula aparte
  // para mostrar "+ $X USD" como subtítulo en la card.
  const totals = useMemo(() => {
    let total = 0
    let totalUSD = 0
    const byCategory = {}
    filteredExpenses.forEach(e => {
      const isUSD = e.currency === 'USD'
      const inBase = isUSD ? (e.amountInBase || convertToBase(e.amount, 'USD', e.exchangeRate)) : (e.amount || 0)
      total += inBase
      if (isUSD) totalUSD += (e.amount || 0)
      const cat = e.category || 'otros'
      byCategory[cat] = (byCategory[cat] || 0) + inBase
    })
    return { total, totalUSD, byCategory, count: filteredExpenses.length }
  }, [filteredExpenses])

  // Top categoría del periodo + promedio diario + datos para gráficos
  const extraMetrics = useMemo(() => {
    // Top categoría por monto
    const sortedByAmount = Object.entries(totals.byCategory)
      .sort((a, b) => b[1] - a[1])
    const topEntry = sortedByAmount[0]
    const topCategory = topEntry
      ? { ...getCategoryById(topEntry[0]), amount: topEntry[1], pct: totals.total > 0 ? (topEntry[1] / totals.total) * 100 : 0 }
      : null

    // Promedio diario: total / (días del rango seleccionado, mínimo 1)
    let daysInRange = 1
    try {
      const start = new Date(dateRange.startDate + 'T12:00')
      const end = new Date(dateRange.endDate + 'T12:00')
      const ms = end - start
      daysInRange = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
    } catch (e) { /* default 1 */ }
    const dailyAvg = totals.total / daysInRange

    // Datos para gráfico de torta (categoría → amount + color)
    const pieData = sortedByAmount.map(([catId, amount]) => {
      const c = getCategoryById(catId)
      return { name: c.name, value: amount, color: c.color || '#64748B' }
    })

    return { topCategory, dailyAvg, daysInRange, pieData }
  }, [totals, dateRange, expenseCategories])

  // Gastos por mes (últimos 6 meses) — usa last6MonthsExpenses, que se carga
  // aparte del listado para no depender del filtro de fecha del usuario.
  const monthlyChart = useMemo(() => {
    const now = new Date()
    const buckets = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '').toUpperCase(),
        total: 0,
      })
    }
    last6MonthsExpenses.forEach(e => {
      const ed = e.date instanceof Date ? e.date : new Date(e.date)
      const key = `${ed.getFullYear()}-${ed.getMonth()}`
      const bucket = buckets.find(b => b.key === key)
      if (bucket) {
        const isUSD = e.currency === 'USD'
        const inBase = isUSD ? (e.amountInBase || convertToBase(e.amount, 'USD', e.exchangeRate)) : (e.amount || 0)
        bucket.total += inBase
      }
    })
    return buckets
  }, [last6MonthsExpenses])

  // Handlers
  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  function openCreateModal() {
    setEditingExpense(null)
    setForm({
      amount: '',
      description: '',
      category: 'otros',
      date: getLocalDateString(),
      paymentMethod: 'efectivo',
      reference: '',
      supplier: '',
      notes: '',
      branchId: '',
      currency: 'PEN',
      exchangeRate: 1,
    })
    setExpenseRateSource(null)
    // Generar ID único para esta sesión de "nuevo gasto" → idempotencia ante duplicados.
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `expense_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    setClientRequestId(newId)
    setShowModal(true)
  }

  function openEditModal(expense) {
    setEditingExpense(expense)
    const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date)
    setForm({
      amount: expense.amount.toString(),
      description: expense.description || '',
      category: expense.category || 'otros',
      date: getLocalDateString(expenseDate),
      paymentMethod: expense.paymentMethod || 'efectivo',
      reference: expense.reference || '',
      supplier: expense.supplier || '',
      notes: expense.notes || '',
      branchId: expense.branchId || '',
      // Multi-divisa: restaurar moneda y TC si existían
      currency: normalizeCurrency(expense.currency),
      exchangeRate: Number(expense.exchangeRate) > 0 ? Number(expense.exchangeRate) : 1,
    })
    setExpenseRateSource(expense.exchangeRate ? 'manual' : null)
    setShowModal(true)
  }

  // Trae TC del día al cambiar a USD en el formulario
  async function fetchExpenseRate() {
    if (loadingExpenseRate) return
    setLoadingExpenseRate(true)
    try {
      const result = await getRateForDate(new Date())
      if (result && Number.isFinite(result.sell) && result.sell > 0) {
        setForm(prev => ({ ...prev, exchangeRate: Number(result.sell.toFixed(4)) }))
        setExpenseRateSource(result.source)
        if (result.source === 'sbs') toast.success(`TC: S/ ${result.sell.toFixed(4)} (SBS)`)
      } else {
        toast.error('No se pudo obtener el TC. Ingrésalo manualmente.')
      }
    } catch {
      toast.error('No se pudo obtener el TC.')
    } finally {
      setLoadingExpenseRate(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // MODO DEMO: No permitir guardar
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setShowModal(false)
      return
    }

    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (!form.description.trim()) {
      toast.error('Ingresa una descripción')
      return
    }

    // Multi-divisa: validar TC si es USD
    if (expenseMultiCurrencyOn && form.currency === 'USD') {
      const rate = parseFloat(form.exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error('Ingresa un tipo de cambio válido para USD')
        return
      }
    }

    setSaving(true)
    try {
      const expenseData = {
        ...form,
        amount: parseFloat(form.amount),
        createdBy: user.email || user.uid,
        // Multi-divisa: solo enviar currency/exchangeRate si la flag está
        // activa Y el usuario eligió USD. Lo demás queda PEN implícito.
        currency: (expenseMultiCurrencyOn && form.currency === 'USD') ? 'USD' : 'PEN',
        exchangeRate: form.currency === 'USD' ? (parseFloat(form.exchangeRate) || 1) : 1,
      }

      if (editingExpense) {
        await updateExpense(user.uid, editingExpense.id, expenseData)
        toast.success(isOffline ? 'Cambios encolados · se sincronizarán al reconectar' : 'Gasto actualizado')
      } else {
        // Pasar clientRequestId para idempotencia: múltiples submits del mismo
        // formulario sobrescriben el mismo doc en lugar de crear duplicados.
        await createExpense(user.uid, { ...expenseData, clientRequestId })
        toast.success(isOffline ? 'Gasto encolado · se sincronizará al reconectar' : 'Gasto registrado')
      }

      setShowModal(false)
      setClientRequestId(null)
      loadExpenses()
    } catch (error) {
      toast.error('Error al guardar el gasto')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(expenseId) {
    // MODO DEMO: No permitir eliminar
    if (isDemoMode) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      setShowDeleteConfirm(null)
      return
    }

    setDeleting(true)
    try {
      await deleteExpense(user.uid, expenseId)
      toast.success('Gasto eliminado')
      setShowDeleteConfirm(null)
      loadExpenses()
    } catch (error) {
      toast.error('Error al eliminar el gasto')
    } finally {
      setDeleting(false)
    }
  }

  function exportToExcel() {
    const data = filteredExpenses.map(e => ({
      'Fecha': e.date instanceof Date ? e.date.toLocaleDateString('es-PE') : new Date(e.date).toLocaleDateString('es-PE'),
      'Descripción': e.description,
      'Categoría': getCategoryById(e.category).name,
      'Proveedor': e.supplier || '-',
      'Referencia': e.reference || '-',
      'Método de Pago': EXPENSE_PAYMENT_METHODS.find(m => m.id === e.paymentMethod)?.name || e.paymentMethod,
      'Monto': e.amount
    }))

    // Agregar fila de total
    data.push({
      'Fecha': '',
      'Descripción': 'TOTAL',
      'Categoría': '',
      'Proveedor': '',
      'Referencia': '',
      'Método de Pago': '',
      'Monto': totals.total
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos')

    const fileName = `gastos_${dateRange.startDate}_${dateRange.endDate}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success('Reporte exportado')
  }

  function formatDate(date) {
    if (!date) return '-'
    const d = date instanceof Date ? date : new Date(date)
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp className="w-4 h-4" /> :
      <ChevronDown className="w-4 h-4" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-500">Registro y control de gastos del negocio</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={loadExpenses}
            disabled={loading}
            title="Recargar"
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCategoriesModal(true)}
            title="Gestionar categorías"
            className="flex-1 sm:flex-none"
          >
            <Tag className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Categorías</span>
          </Button>
          {!hidePrivateData && (
            <Button variant="success" onClick={exportToExcel} className="flex-1 sm:flex-none">
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
          )}
          <Button variant="danger" onClick={openCreateModal} className="flex-1 sm:flex-none">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Nuevo Gasto</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Gastos</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totals.total)}</p>
              {expenseMultiCurrencyOn && totals.totalUSD > 0 && (
                <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                  + {formatCurrency(totals.totalUSD, 'USD')} USD
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Receipt className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Registros</p>
              <p className="text-xl font-bold text-gray-900">{totals.count}</p>
            </div>
          </div>
        </div>

        {/* Top categoría del periodo (dinámica) */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            {extraMetrics.topCategory ? (
              <>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${extraMetrics.topCategory.color}1A`, color: extraMetrics.topCategory.color }}
                >
                  {(() => {
                    const Icon = getCategoryIconComponent(extraMetrics.topCategory)
                    return <Icon className="w-6 h-6" />
                  })()}
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Top: {extraMetrics.topCategory.name}</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(extraMetrics.topCategory.amount)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{extraMetrics.topCategory.pct.toFixed(0)}% del total</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                  <MoreHorizontal className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Top categoría</p>
                  <p className="text-xl font-bold text-gray-400">—</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Promedio diario */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Promedio diario</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(extraMetrics.dailyAvg)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{extraMetrics.daysInRange} día{extraMetrics.daysInRange > 1 ? 's' : ''} del periodo</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Lista | Resumen */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'list'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Receipt className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Lista de gastos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingDown className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Resumen
          </button>
        </nav>
      </div>

      {activeTab === 'list' && (<>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        {/* Búsqueda */}
        <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 shadow-sm">
          <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por descripción, proveedor o referencia..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 text-sm border-none bg-transparent focus:ring-0 focus:outline-none"
          />
        </div>

        {/* Rango de fechas + atajos */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">Período:</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="flex-1 sm:flex-none px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="flex-1 sm:flex-none px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
          {/* Atajos rápidos */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'today', label: 'Hoy' },
              { key: 'week', label: 'Esta semana' },
              { key: 'month', label: 'Este mes' },
              { key: 'prevMonth', label: 'Mes anterior' },
              { key: 'year', label: 'Año' },
            ].map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => applyDateShortcut(s.key)}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros adicionales */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 font-medium">Filtros:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            {/* Category Filter */}
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-auto">
              <Receipt className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer flex-1"
              >
                <option value="all">Todas las categorías</option>
                {expenseCategories.filter(c => !c.archived).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Branch Filter */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-auto">
                <Store className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <select
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                  className="text-sm border-none bg-transparent focus:ring-0 focus:outline-none cursor-pointer flex-1"
                >
                  <option value="all">Todas las sucursales</option>
                  {hasMainBranchAccess && <option value="main">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-500">
          Mostrando {filteredExpenses.length} de {expenses.length} gastos
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando gastos...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No hay gastos registrados</p>
            <button
              onClick={openCreateModal}
              className="mt-3 text-red-600 hover:text-red-700 font-medium"
            >
              Registrar primer gasto
            </button>
          </div>
        ) : (
          <>
            {displayedExpenses.map(expense => {
              const categoryObj = getCategoryById(expense.category)
              const CategoryIcon = getCategoryIconComponent(categoryObj)
              const categoryStyle = getCategoryBadgeStyle(categoryObj)
              return (
                <div key={expense.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 relative">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{expense.description}</p>
                      {expense.reference && <p className="text-xs text-gray-500">Ref: {expense.reference}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-600 flex items-center gap-1.5">
                        {formatCurrency(expense.amount, expense.currency)}
                        {expense.currency === 'USD' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD</span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (openMenuId === expense.id) {
                            setOpenMenuId(null)
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const spaceBelow = window.innerHeight - rect.bottom
                            setMenuPosition({
                              top: rect.bottom + window.scrollY,
                              right: window.innerWidth - rect.right,
                              openUpward: spaceBelow < 120
                            })
                            setOpenMenuId(expense.id)
                          }
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={categoryStyle}>
                      <CategoryIcon className="w-3 h-3" />
                      {categoryObj.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {EXPENSE_PAYMENT_METHODS.find(m => m.id === expense.paymentMethod)?.name || expense.paymentMethod}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
                    <span>{formatDate(expense.date)}</span>
                    <div className="flex items-center gap-2">
                      {expense.supplier && <span>{expense.supplier}</span>}
                      {branches.length > 0 && (
                        <span className="text-xs text-blue-600">
                          <Store className="w-3 h-3 inline mr-0.5" />
                          {getBranchName(expense.branchId)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Floating Menu */}
                  {openMenuId === expense.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                      <div
                        className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]"
                        style={{
                          top: menuPosition.openUpward ? 'auto' : menuPosition.top,
                          bottom: menuPosition.openUpward ? `${window.innerHeight - menuPosition.top + 40}px` : 'auto',
                          right: menuPosition.right
                        }}
                      >
                        <button
                          onClick={() => { openEditModal(expense); setOpenMenuId(null) }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" /> Editar
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(expense.id); setOpenMenuId(null) }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            {/* Mobile Total */}
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">TOTAL:</span>
                <span className="font-bold text-red-600 text-lg">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Fecha <SortIcon field="date" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center gap-1">
                    Descripción <SortIcon field="description" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proveedor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Método
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Monto <SortIcon field="amount" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Cargando gastos...</p>
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No hay gastos registrados</p>
                    <button
                      onClick={openCreateModal}
                      className="mt-3 text-red-600 hover:text-red-700 font-medium"
                    >
                      Registrar primer gasto
                    </button>
                  </td>
                </tr>
              ) : (
                displayedExpenses.map(expense => {
                  const categoryObj = getCategoryById(expense.category)
                  const CategoryIcon = getCategoryIconComponent(categoryObj)
                  const categoryStyle = getCategoryBadgeStyle(categoryObj)

                  return (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(expense.date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{expense.description}</p>
                        {expense.reference && (
                          <p className="text-xs text-gray-500">Ref: {expense.reference}</p>
                        )}
                        {branches.length > 0 && (
                          <p className="text-xs text-blue-600 mt-0.5">
                            <Store className="w-3 h-3 inline mr-1" />
                            {getBranchName(expense.branchId)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border" style={categoryStyle}>
                          <CategoryIcon className="w-3 h-3" />
                          {categoryObj.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {expense.supplier || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {EXPENSE_PAYMENT_METHODS.find(m => m.id === expense.paymentMethod)?.name || expense.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-red-600 inline-flex items-center gap-1.5 justify-end">
                          {formatCurrency(expense.amount, expense.currency)}
                          {expense.currency === 'USD' && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">USD</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(expense)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(expense.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">
                    TOTAL:
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-red-600 text-lg">
                      {formatCurrency(totals.total)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
            className="text-sm text-gray-600 hover:text-primary-600 transition-colors py-2 px-4 hover:bg-gray-50 rounded-lg"
          >
            Ver más gastos ({filteredExpenses.length - visibleCount} restantes)
          </button>
        </div>
      )}
      </>)}

      {/* Tab: Resumen */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Gráfico de torta por categoría */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Gastos por categoría</h3>
            {extraMetrics.pieData.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">
                No hay datos en el periodo seleccionado.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                <CategoryPieChart data={extraMetrics.pieData} total={totals.total} formatCurrency={formatCurrency} />
                <div className="space-y-2">
                  {extraMetrics.pieData.map((d, idx) => {
                    const pct = totals.total > 0 ? (d.value / totals.total) * 100 : 0
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700 truncate">{d.name}</span>
                            <span className="font-semibold text-gray-900 ml-2">{formatCurrency(d.value)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Evolución últimos 6 meses */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Evolución últimos 6 meses</h3>
            <MonthlyBarChart data={monthlyChart} formatCurrency={formatCurrency} />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowModal(false)} />
          <div className="min-h-full flex items-center justify-center p-4 relative">
            <div className="bg-white rounded-2xl w-full max-w-lg my-8 relative" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white rounded-t-2xl p-6 border-b border-gray-200 flex items-center justify-between z-10">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isOffline && (
                <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex items-start gap-2">
                  <Receipt className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Sin conexión a internet. El gasto se guardará en este dispositivo y se enviará al servidor cuando vuelvas a estar online.
                  </span>
                </div>
              )}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Monto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    {form.currency === 'USD' ? '$' : 'S/'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-lg"
                    required
                  />
                </div>
              </div>

              {/* Multi-divisa: selector de moneda + TC (solo si flag activa) */}
              {expenseMultiCurrencyOn && (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Moneda del gasto</label>
                  <div className="flex gap-2">
                    {['PEN', 'USD'].map(ccy => (
                      <button
                        key={ccy}
                        type="button"
                        onClick={async () => {
                          setForm({ ...form, currency: ccy })
                          // Auto-fetch TC al pasar a USD por primera vez
                          if (ccy === 'USD' && (!form.exchangeRate || form.exchangeRate <= 1)) {
                            await fetchExpenseRate()
                          }
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          form.currency === ccy
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {ccy === 'PEN' ? 'S/ Soles' : '$ Dólares'}
                      </button>
                    ))}
                  </div>
                  {form.currency === 'USD' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700">TC (PEN por USD)</label>
                        {expenseRateSource === 'sbs' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">SBS</span>
                        )}
                        {expenseRateSource === 'cache' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-medium">Cache</span>
                        )}
                        {expenseRateSource === 'manual' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">Manual</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={form.exchangeRate}
                          onChange={e => {
                            setForm({ ...form, exchangeRate: parseFloat(e.target.value) || 0 })
                            setExpenseRateSource('manual')
                          }}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={fetchExpenseRate}
                          disabled={loadingExpenseRate}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {loadingExpenseRate ? '...' : 'SBS'}
                        </button>
                      </div>
                      {form.amount && parseFloat(form.amount) > 0 && form.exchangeRate > 0 && (
                        <p className="text-[11px] text-gray-500">
                          ≈ S/ {(parseFloat(form.amount) * parseFloat(form.exchangeRate)).toFixed(2)} al TC actual
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción *
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Ej: Pago de luz del mes"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>

              {/* Categoría y Fecha */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría
                  </label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    {expenseCategories.filter(c => !c.archived).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Sucursal */}
              {branches.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Store className="w-4 h-4 inline mr-1" />
                    Sucursal
                  </label>
                  <select
                    value={form.branchId}
                    onChange={e => setForm({ ...form, branchId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    {hasMainBranchAccess && <option value="">{businessSettings?.mainBranchName || 'Sucursal Principal'}</option>}
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Selecciona a qué sucursal corresponde este gasto
                  </p>
                </div>
              )}

              {/* Método de pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Método de Pago
                </label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_PAYMENT_METHODS.map(method => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setForm({ ...form, paymentMethod: method.id })}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.paymentMethod === method.id
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-red-300'
                      }`}
                    >
                      {method.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Proveedor y Referencia */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={e => setForm({ ...form, supplier: e.target.value })}
                    placeholder="Nombre del proveedor"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={e => setForm({ ...form, reference: e.target.value })}
                    placeholder="Nro. factura, recibo"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      {editingExpense ? 'Actualizar' : 'Registrar'}
                    </>
                  )}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowDeleteConfirm(null)} />
          <div className="min-h-full flex items-center justify-center p-4 relative">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
              ¿Eliminar gasto?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Gestión de categorías de gasto */}
      {showCategoriesModal && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={async () => {
            setShowCategoriesModal(false)
            await loadCategories()
          }} />
          <div className="min-h-full flex items-center justify-center p-4 relative">
            <div className="bg-white rounded-2xl w-full max-w-3xl my-8 relative" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white rounded-t-2xl p-5 border-b border-gray-200 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-gray-500" />
                    Categorías de Gastos
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">Personaliza las categorías que usarás al registrar gastos.</p>
                </div>
                <button
                  onClick={async () => {
                    setShowCategoriesModal(false)
                    await loadCategories()
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <ExpenseCategoriesManager />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

/**
 * Gráfico de torta SVG sin librerías — suficiente para 3-15 categorías.
 * Cada slice se dibuja con un path Arc.
 */
function CategoryPieChart({ data, total, formatCurrency }) {
  if (!data || data.length === 0 || total === 0) return null
  const size = 200
  const radius = 90
  const cx = size / 2
  const cy = size / 2
  let cumulative = 0
  const slices = data.map((d, idx) => {
    const pct = d.value / total
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2
    cumulative += pct
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2
    const x1 = cx + radius * Math.cos(startAngle)
    const y1 = cy + radius * Math.sin(startAngle)
    const x2 = cx + radius * Math.cos(endAngle)
    const y2 = cy + radius * Math.sin(endAngle)
    const largeArc = pct > 0.5 ? 1 : 0
    // Edge case: si solo hay 1 categoría con 100%, dibujar círculo completo
    if (data.length === 1) {
      return { path: `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`, color: d.color, key: idx }
    }
    return {
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color,
      key: idx,
    }
  })
  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map(s => (
            <path key={s.key} d={s.path} fill={s.color} stroke="white" strokeWidth="2" />
          ))}
          {/* Círculo interior para look "donut" */}
          <circle cx={cx} cy={cy} r={radius * 0.55} fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-base font-bold text-gray-900">{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Gráfico de barras SVG sin librerías — últimos 6 meses.
 */
function MonthlyBarChart({ data, formatCurrency }) {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const width = 600
  const height = 220
  const padding = { top: 20, right: 10, bottom: 30, left: 10 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const barWidth = chartW / data.length * 0.6
  const gap = chartW / data.length * 0.4
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full max-w-3xl mx-auto">
        {data.map((d, idx) => {
          const barHeight = (d.total / maxVal) * chartH
          const x = padding.left + idx * (barWidth + gap) + gap / 2
          const y = padding.top + chartH - barHeight
          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill="#EF4444"
                opacity="0.85"
                rx="4"
              />
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10"
                fill="#374151"
                fontWeight="600"
              >
                {d.total > 0 ? formatCurrency(d.total).replace(/\s/g, '') : ''}
              </text>
              <text
                x={x + barWidth / 2}
                y={padding.top + chartH + 18}
                textAnchor="middle"
                fontSize="11"
                fill="#6B7280"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Button from '@/components/ui/Button'
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS
} from '@/services/expenseService'
import { getActiveBranches } from '@/services/branchService'
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

// Mapeo de iconos por categoría
const CATEGORY_ICONS = {
  servicios: Zap,
  proveedores: Package,
  transporte: Truck,
  personal: Users,
  impuestos: FileText,
  mantenimiento: Wrench,
  marketing: Megaphone,
  bancarios: Building,
  otros: MoreHorizontal
}

// Colores por categoría
const CATEGORY_COLORS = {
  servicios: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  proveedores: 'bg-blue-100 text-blue-700 border-blue-200',
  transporte: 'bg-green-100 text-green-700 border-green-200',
  personal: 'bg-purple-100 text-purple-700 border-purple-200',
  impuestos: 'bg-red-100 text-red-700 border-red-200',
  mantenimiento: 'bg-orange-100 text-orange-700 border-orange-200',
  marketing: 'bg-pink-100 text-pink-700 border-pink-200',
  bancarios: 'bg-gray-100 text-gray-700 border-gray-200',
  otros: 'bg-slate-100 text-slate-700 border-slate-200'
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
  const { user, isDemoMode } = useAppContext()
  const toast = useToast()

  // Estados
  const [expenses, setExpenses] = useState([])
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

  // Mobile menu states
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, openUpward: false })

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
    branchId: '' // '' = gasto general/corporativo
  })

  // Cargar gastos y sucursales
  useEffect(() => {
    if (user?.uid) {
      loadExpenses()
      loadBranches()
    }
  }, [user?.uid, dateRange])

  async function loadBranches() {
    if (isDemoMode) return
    try {
      const result = await getActiveBranches(user.uid)
      if (result.success) {
        setBranches(result.data || [])
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
        setLoading(false)
        return
      }

      const data = await getExpenses(user.uid, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      })
      setExpenses(data)
    } catch (error) {
      toast.error('Error al cargar los gastos')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar y ordenar gastos
  const filteredExpenses = useMemo(() => {
    let result = [...expenses]

    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(e =>
        e.description?.toLowerCase().includes(search) ||
        e.supplier?.toLowerCase().includes(search) ||
        e.reference?.toLowerCase().includes(search)
      )
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

  // Helper para obtener nombre de sucursal
  const getBranchName = (branchId) => {
    if (!branchId || branchId === '' || branchId === 'main') return 'Sucursal Principal'
    const branch = branches.find(b => b.id === branchId)
    return branch?.name || 'Sucursal Principal'
  }

  // Calcular totales
  const totals = useMemo(() => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
    const byCategory = filteredExpenses.reduce((acc, e) => {
      const cat = e.category || 'otros'
      acc[cat] = (acc[cat] || 0) + e.amount
      return acc
    }, {})

    return { total, byCategory, count: filteredExpenses.length }
  }, [filteredExpenses])

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
      branchId: ''
    })
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
      branchId: expense.branchId || ''
    })
    setShowModal(true)
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

    setSaving(true)
    try {
      const expenseData = {
        ...form,
        amount: parseFloat(form.amount),
        createdBy: user.email || user.uid
      }

      if (editingExpense) {
        await updateExpense(user.uid, editingExpense.id, expenseData)
        toast.success('Gasto actualizado')
      } else {
        await createExpense(user.uid, expenseData)
        toast.success('Gasto registrado')
      }

      setShowModal(false)
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
      'Categoría': EXPENSE_CATEGORIES.find(c => c.id === e.category)?.name || e.category,
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
          <Button variant="success" onClick={exportToExcel} className="flex-1 sm:flex-none">
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
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

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Servicios</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totals.byCategory.servicios || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Proveedores</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totals.byCategory.proveedores || 0)}</p>
            </div>
          </div>
        </div>
      </div>

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

        {/* Rango de fechas */}
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
                {EXPENSE_CATEGORIES.map(cat => (
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
                  <option value="main">Sucursal Principal</option>
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
            {filteredExpenses.map(expense => {
              const CategoryIcon = CATEGORY_ICONS[expense.category] || MoreHorizontal
              const categoryColor = CATEGORY_COLORS[expense.category] || CATEGORY_COLORS.otros
              return (
                <div key={expense.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 relative">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{expense.description}</p>
                      {expense.reference && <p className="text-xs text-gray-500">Ref: {expense.reference}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-600">{formatCurrency(expense.amount)}</span>
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
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${categoryColor}`}>
                      <CategoryIcon className="w-3 h-3" />
                      {EXPENSE_CATEGORIES.find(c => c.id === expense.category)?.name || expense.category}
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
                filteredExpenses.map(expense => {
                  const CategoryIcon = CATEGORY_ICONS[expense.category] || MoreHorizontal
                  const categoryColor = CATEGORY_COLORS[expense.category] || CATEGORY_COLORS.otros

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
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${categoryColor}`}>
                          <CategoryIcon className="w-3 h-3" />
                          {EXPENSE_CATEGORIES.find(c => c.id === expense.category)?.name || expense.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {expense.supplier || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {EXPENSE_PAYMENT_METHODS.find(m => m.id === expense.paymentMethod)?.name || expense.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-red-600">
                          {formatCurrency(expense.amount)}
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

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Monto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">S/</span>
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
                    {EXPENSE_CATEGORIES.map(cat => (
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
                    <option value="">Sucursal Principal</option>
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
    </div>
  )
}

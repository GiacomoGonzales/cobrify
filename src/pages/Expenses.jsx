import React, { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS
} from '@/services/expenseService'
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
  Zap,
  AlertTriangle
} from 'lucide-react'
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

export default function Expenses() {
  const { user, isDemoMode } = useAppContext()
  const toast = useToast()

  // Estados
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [form, setForm] = useState({
    amount: '',
    description: '',
    category: 'otros',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'efectivo',
    reference: '',
    supplier: '',
    notes: ''
  })

  // Cargar gastos
  useEffect(() => {
    if (user?.uid) {
      loadExpenses()
    }
  }, [user?.uid, dateRange])

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
  }, [expenses, searchTerm, categoryFilter, paymentMethodFilter, sortField, sortDirection])

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
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'efectivo',
      reference: '',
      supplier: '',
      notes: ''
    })
    setShowModal(true)
  }

  function openEditModal(expense) {
    setEditingExpense(expense)
    setForm({
      amount: expense.amount.toString(),
      description: expense.description || '',
      category: expense.category || 'otros',
      date: expense.date instanceof Date
        ? expense.date.toISOString().split('T')[0]
        : new Date(expense.date).toISOString().split('T')[0],
      paymentMethod: expense.paymentMethod || 'efectivo',
      reference: expense.reference || '',
      supplier: expense.supplier || '',
      notes: expense.notes || ''
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
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Gasto
        </button>
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por descripción, proveedor o referencia..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>

          {/* Date Range */}
          <div className="flex gap-2 items-center">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={dateRange.startDate}
              onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Todas las categorías</option>
            {EXPENSE_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={loadExpenses}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Mostrando {filteredExpenses.length} de {expenses.length} gastos
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(expense.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
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
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
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
      )}
    </div>
  )
}

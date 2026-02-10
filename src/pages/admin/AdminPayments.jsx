import React, { useState, useEffect, useMemo } from 'react'
import { getAllPayments, updatePayment, deletePayment } from '@/services/adminStatsService'
import { PLANS } from '@/services/subscriptionService'
import {
  CreditCard,
  Search,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  TrendingUp,
  Filter,
  X,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  Pencil,
  Trash2,
  Save,
  Loader2
} from 'lucide-react'

const PAYMENT_METHODS = {
  yape: { name: 'Yape', color: 'bg-purple-100 text-purple-800' },
  plin: { name: 'Plin', color: 'bg-green-100 text-green-800' },
  transferencia: { name: 'Transferencia', color: 'bg-blue-100 text-blue-800' },
  efectivo: { name: 'Efectivo', color: 'bg-yellow-100 text-yellow-800' },
  tarjeta: { name: 'Tarjeta', color: 'bg-indigo-100 text-indigo-800' },
  otro: { name: 'Otro', color: 'bg-gray-100 text-gray-800' }
}

export default function AdminPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Estados para editar/eliminar
  const [editingPayment, setEditingPayment] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingPayment, setDeletingPayment] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    loadPayments()
  }, [])

  async function loadPayments() {
    setLoading(true)
    try {
      const result = await getAllPayments()
      setPayments(result.payments)
      setTotalAmount(result.totalAmount)
      setTotalCount(result.totalCount)
    } catch (error) {
      console.error('Error loading payments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar pagos
  const filteredPayments = useMemo(() => {
    let result = [...payments]

    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(p =>
        p.email?.toLowerCase().includes(search) ||
        p.businessName?.toLowerCase().includes(search)
      )
    }

    // Filtro de método
    if (methodFilter !== 'all') {
      result = result.filter(p => p.method === methodFilter)
    }

    // Filtro de fecha
    if (dateRange.start) {
      result = result.filter(p => p.date >= new Date(dateRange.start))
    }
    if (dateRange.end) {
      const endDate = new Date(dateRange.end)
      endDate.setHours(23, 59, 59)
      result = result.filter(p => p.date <= endDate)
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
  }, [payments, searchTerm, methodFilter, dateRange, sortField, sortDirection])

  // Estadísticas filtradas
  const filteredStats = useMemo(() => {
    const total = filteredPayments.reduce((sum, p) => sum + p.amount, 0)
    const byMethod = {}

    filteredPayments.forEach(p => {
      const method = p.method || 'otro'
      byMethod[method] = (byMethod[method] || 0) + p.amount
    })

    return { total, count: filteredPayments.length, byMethod }
  }, [filteredPayments])

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  function exportToCSV() {
    const headers = ['Fecha', 'Email', 'Negocio', 'Monto', 'Método', 'Plan', 'Estado', 'Notas']
    const rows = filteredPayments.map(p => [
      p.date?.toLocaleDateString() || 'N/A',
      p.email,
      p.businessName,
      p.amount,
      PAYMENT_METHODS[p.method]?.name || p.method,
      p.planName || PLANS[p.plan]?.name || p.plan,
      p.status,
      p.notes || ''
    ])

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagos_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  function formatDate(date) {
    if (!date) return 'N/A'
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  function clearFilters() {
    setSearchTerm('')
    setMethodFilter('all')
    setDateRange({ start: '', end: '' })
  }

  // Funciones para editar pago
  function openEditModal(payment) {
    setEditingPayment(payment)
    setEditForm({
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      notes: payment.notes || '',
      date: payment.date instanceof Date
        ? payment.date.toISOString().split('T')[0]
        : new Date(payment.date).toISOString().split('T')[0]
    })
  }

  async function handleSaveEdit() {
    if (!editingPayment) return

    setSavingEdit(true)
    try {
      await updatePayment(editingPayment.subscriptionId, editingPayment.paymentIndex, {
        amount: parseFloat(editForm.amount),
        method: editForm.method,
        status: editForm.status,
        notes: editForm.notes,
        date: new Date(editForm.date)
      })
      setEditingPayment(null)
      loadPayments()
    } catch (error) {
      console.error('Error al actualizar pago:', error)
      alert('Error al actualizar el pago: ' + error.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // Funciones para eliminar pago
  function openDeleteConfirm(payment) {
    setDeletingPayment(payment)
    setConfirmDelete(true)
  }

  async function handleDeletePayment() {
    if (!deletingPayment) return

    setSavingEdit(true)
    try {
      await deletePayment(deletingPayment.subscriptionId, deletingPayment.paymentIndex)
      setConfirmDelete(false)
      setDeletingPayment(null)
      loadPayments()
    } catch (error) {
      console.error('Error al eliminar pago:', error)
      alert('Error al eliminar el pago: ' + error.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const hasFilters = searchTerm || methodFilter !== 'all' || dateRange.start || dateRange.end

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp className="w-4 h-4" /> :
      <ChevronDown className="w-4 h-4" />
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-green-100 rounded-lg sm:rounded-xl">
              <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-gray-500">Total</p>
              <p className="text-base sm:text-2xl font-bold text-gray-900 truncate">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-blue-100 rounded-lg sm:rounded-xl">
              <CreditCard className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-gray-500">Pagos</p>
              <p className="text-base sm:text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-indigo-100 rounded-lg sm:rounded-xl">
              <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-gray-500">Filtrado</p>
              <p className="text-base sm:text-2xl font-bold text-gray-900 truncate">{formatCurrency(filteredStats.total)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-purple-100 rounded-lg sm:rounded-xl">
              <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-gray-500">Promedio</p>
              <p className="text-base sm:text-2xl font-bold text-gray-900 truncate">
                {formatCurrency(filteredStats.count > 0 ? filteredStats.total / filteredStats.count : 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          {/* Search + Actions Row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={loadPayments}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-2">
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los métodos</option>
              {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                <option key={key} value={key}>{method.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-none">
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
                className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-400 text-sm">-</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
                className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-xs sm:text-sm text-gray-500">
          Mostrando {filteredPayments.length} de {payments.length} pagos
        </div>
      </div>

      {/* Method breakdown (when filtered) */}
      {Object.keys(filteredStats.byMethod).length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Desglose por método</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(filteredStats.byMethod).map(([method, amount]) => (
              <div
                key={method}
                className={`px-3 py-2 rounded-lg ${PAYMENT_METHODS[method]?.color || 'bg-gray-100 text-gray-800'}`}
              >
                <span className="font-medium">{PAYMENT_METHODS[method]?.name || method}:</span>
                <span className="ml-2">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Loading state */}
        {loading && (
          <div className="px-4 py-12 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando pagos...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredPayments.length === 0 && (
          <div className="px-4 py-12 text-center">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No se encontraron pagos</p>
          </div>
        )}

        {/* Mobile Card View */}
        {!loading && filteredPayments.length > 0 && (
          <div className="sm:hidden divide-y divide-gray-200">
            {filteredPayments.map(payment => (
              <div key={payment.id} className="p-3 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{payment.businessName}</p>
                      <p className="text-xs text-gray-500 truncate">{payment.email}</p>
                    </div>
                  </div>
                  <span className="font-bold text-green-600 text-sm">
                    {formatCurrency(payment.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_METHODS[payment.method]?.color || 'bg-gray-100 text-gray-800'}`}>
                      {PAYMENT_METHODS[payment.method]?.name || payment.method}
                    </span>
                    <span className="text-gray-500">{payment.planName || PLANS[payment.plan]?.name || payment.plan}</span>
                  </div>
                  {payment.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" /> OK
                    </span>
                  ) : payment.status === 'pending' ? (
                    <span className="inline-flex items-center gap-1 text-yellow-600">
                      <Clock className="w-3 h-3" /> Pend.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <AlertCircle className="w-3 h-3" /> {payment.status}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {formatDate(payment.date)}
                </div>
                {payment.notes && (
                  <div className="mt-1 text-xs text-gray-500 truncate">
                    {payment.notes}
                  </div>
                )}
                {/* Botones móvil */}
                <div className="mt-2 flex items-center justify-end gap-2 border-t pt-2">
                  <button
                    onClick={() => openEditModal(payment)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => openDeleteConfirm(payment)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop Table View */}
        {!loading && filteredPayments.length > 0 && (
          <div className="hidden sm:block overflow-x-auto">
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
                    onClick={() => handleSort('businessName')}
                  >
                    <div className="flex items-center gap-1">
                      Cliente <SortIcon field="businessName" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center gap-1">
                      Monto <SortIcon field="amount" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Método
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPayments.map(payment => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(payment.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{payment.businessName}</p>
                          <p className="text-xs text-gray-500">{payment.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-green-600">
                        {formatCurrency(payment.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PAYMENT_METHODS[payment.method]?.color || 'bg-gray-100 text-gray-800'}`}>
                        {PAYMENT_METHODS[payment.method]?.name || payment.method}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {payment.planName || PLANS[payment.plan]?.name || payment.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4" /> Completado
                        </span>
                      ) : payment.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
                          <Clock className="w-4 h-4" /> Pendiente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-600 text-sm">
                          <AlertCircle className="w-4 h-4" /> {payment.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {payment.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(payment)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar pago"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteConfirm(payment)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar pago"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Editar Pago */}
      {editingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Editar Pago</h3>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Info del negocio */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{editingPayment.businessName}</span>
                  <br />
                  <span className="text-xs text-gray-500">{editingPayment.email}</span>
                </p>
              </div>

              {/* Monto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Método */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Método de Pago
                </label>
                <select
                  value={editForm.method}
                  onChange={e => setEditForm({ ...editForm, method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                    <option key={key} value={key}>{method.name}</option>
                  ))}
                </select>
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Estado */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado
                </label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="completed">Completado</option>
                  <option value="pending">Pendiente</option>
                  <option value="failed">Fallido</option>
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setEditingPayment(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmar Eliminación */}
      {confirmDelete && deletingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Eliminar Pago</h3>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    ¿Estás seguro de eliminar este pago?
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p><span className="font-medium">Negocio:</span> {deletingPayment.businessName}</p>
                <p><span className="font-medium">Monto:</span> {formatCurrency(deletingPayment.amount)}</p>
                <p><span className="font-medium">Fecha:</span> {formatDate(deletingPayment.date)}</p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setConfirmDelete(false)
                  setDeletingPayment(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePayment}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

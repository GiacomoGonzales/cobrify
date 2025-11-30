import React, { useState, useEffect, useMemo } from 'react'
import { getAllPayments } from '@/services/adminStatsService'
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
  Building2
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
      PLANS[p.plan]?.name || p.plan,
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

  const hasFilters = searchTerm || methodFilter !== 'all' || dateRange.start || dateRange.end

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp className="w-4 h-4" /> :
      <ChevronDown className="w-4 h-4" />
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-xl">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total recaudado</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total pagos</p>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Filtrado</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(filteredStats.total)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ticket promedio</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(filteredStats.count > 0 ? filteredStats.total / filteredStats.count : 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por email o negocio..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los métodos</option>
              {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                <option key={key} value={key}>{method.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" /> Limpiar
              </button>
            )}

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
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-500">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                    <p className="text-gray-500">Cargando pagos...</p>
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No se encontraron pagos</p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map(payment => (
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
                        {PLANS[payment.plan]?.name || payment.plan}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

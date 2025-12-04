import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore'
import { useAppContext } from '@/hooks/useAppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Home,
  Key,
  Building2,
  Loader2,
  Filter,
  Download,
  ChevronDown,
  CheckCircle,
  UserCheck
} from 'lucide-react'

export default function Commissions() {
  const { getBusinessId } = useAppContext()
  const { user, isBusinessOwner } = useAuth()
  const toast = useToast()

  const [operations, setOperations] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodFilter, setPeriodFilter] = useState('month') // 'month', 'year', 'all'
  const [typeFilter, setTypeFilter] = useState('all')
  const [userAgentId, setUserAgentId] = useState(null) // ID del agente vinculado al usuario
  const [agentName, setAgentName] = useState('')

  useEffect(() => {
    checkUserAgent()
  }, [user])

  useEffect(() => {
    if (user) {
      loadOperations()
    }
  }, [user, userAgentId])

  // Verificar si el usuario actual tiene un agente vinculado
  async function checkUserAgent() {
    if (!user?.uid) return

    try {
      const userDocRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userDocRef)

      if (userSnap.exists()) {
        const userData = userSnap.data()
        if (userData.agentId) {
          setUserAgentId(userData.agentId)
          setAgentName(userData.agentName || '')
        }
      }
    } catch (error) {
      console.log('Error checking user agent:', error.message)
    }
  }

  async function loadOperations() {
    setLoading(true)
    try {
      const businessId = getBusinessId()
      const operationsRef = collection(db, `businesses/${businessId}/operations`)
      const q = query(operationsRef, orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)

      let operationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      }))

      // Only closed operations count for commissions
      operationsData = operationsData.filter(o => o.status === 'cerrada')

      // Si el usuario tiene un agente vinculado, filtrar solo sus operaciones
      if (userAgentId && !isBusinessOwner) {
        operationsData = operationsData.filter(o => o.agentId === userAgentId)
      }

      setOperations(operationsData)
    } catch (error) {
      console.error('Error loading operations:', error)
      toast.error('Error al cargar comisiones')
    } finally {
      setLoading(false)
    }
  }

  // Filter by period
  const filteredOperations = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)

    return operations.filter(op => {
      // Type filter
      if (typeFilter !== 'all' && op.type !== typeFilter) return false

      // Period filter
      if (periodFilter === 'month') {
        return op.createdAt >= startOfMonth
      } else if (periodFilter === 'year') {
        return op.createdAt >= startOfYear
      }
      return true
    })
  }, [operations, periodFilter, typeFilter])

  // Calculate stats
  // Si el usuario es agente, mostrar comisiones del agente, si no, comisiones de inmobiliaria
  const isAgentView = userAgentId && !isBusinessOwner

  const stats = useMemo(() => {
    const ventas = filteredOperations.filter(o => o.type === 'venta')
    const alquileres = filteredOperations.filter(o => o.type === 'alquiler')

    // Si es vista de agente, usar agentCommission, si no commissionAmount
    const getCommission = (o) => isAgentView ? (o.agentCommission || 0) : (o.commissionAmount || 0)

    const totalComisiones = filteredOperations.reduce((sum, o) => sum + getCommission(o), 0)
    const comisionesVenta = ventas.reduce((sum, o) => sum + getCommission(o), 0)
    const comisionesAlquiler = alquileres.reduce((sum, o) => sum + getCommission(o), 0)

    const totalVentas = ventas.reduce((sum, o) => sum + (o.agreedPrice || 0), 0)
    const totalAlquileres = alquileres.reduce((sum, o) => sum + (o.agreedPrice || 0), 0)

    return {
      totalOperaciones: filteredOperations.length,
      cantidadVentas: ventas.length,
      cantidadAlquileres: alquileres.length,
      totalComisiones,
      comisionesVenta,
      comisionesAlquiler,
      totalVentas,
      totalAlquileres,
      promedioComision: filteredOperations.length > 0 ? totalComisiones / filteredOperations.length : 0,
    }
  }, [filteredOperations, isAgentView])

  // Group by month for chart
  const monthlyData = useMemo(() => {
    const months = {}
    const now = new Date()

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      months[key] = { month: date.toLocaleDateString('es-PE', { month: 'short' }), ventas: 0, alquileres: 0, total: 0 }
    }

    const getCommission = (o) => isAgentView ? (o.agentCommission || 0) : (o.commissionAmount || 0)

    operations.forEach(op => {
      const key = `${op.createdAt.getFullYear()}-${String(op.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (months[key]) {
        const commission = getCommission(op)
        months[key].total += commission
        if (op.type === 'venta') {
          months[key].ventas += commission
        } else {
          months[key].alquileres += commission
        }
      }
    })

    return Object.values(months)
  }, [operations, isAgentView])

  function formatPrice(price) {
    if (!price) return 'S/ 0'
    return `S/ ${price.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
  }

  function formatDate(date) {
    if (!date) return '-'
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function exportToCSV() {
    const headers = ['Fecha', 'Propiedad', 'Tipo', 'Precio', 'Comisión %', 'Comisión S/']
    const rows = filteredOperations.map(op => {
      const commission = isAgentView ? op.agentCommission : op.commissionAmount
      const percent = isAgentView ? op.agentCommissionPercent : op.commissionPercent
      return [
        formatDate(op.createdAt),
        op.propertyTitle,
        op.type === 'venta' ? 'Venta' : 'Alquiler',
        op.agreedPrice,
        percent,
        commission
      ]
    })

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const filename = isAgentView ? `mis_comisiones_${new Date().toISOString().split('T')[0]}.csv` : `comisiones_${new Date().toISOString().split('T')[0]}.csv`
    a.download = filename
    a.click()
  }

  // Find max for chart scaling
  const maxMonthlyValue = Math.max(...monthlyData.map(d => d.total), 1)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isAgentView ? 'Mis Comisiones' : 'Comisiones'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAgentView
              ? `Resumen de tus ganancias como agente (${agentName})`
              : 'Resumen de ganancias por operaciones cerradas'}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5" />
          <span>Exportar</span>
        </button>
      </div>

      {/* Banner para agente */}
      {isAgentView && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="font-medium text-cyan-900">Vista de Agente</p>
            <p className="text-sm text-cyan-700">
              Estás viendo únicamente las comisiones de las operaciones donde participaste como agente.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
        >
          <option value="month">Este mes</option>
          <option value="year">Este año</option>
          <option value="all">Todo</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 text-sm"
        >
          <option value="all">Todas</option>
          <option value="venta">Solo Ventas</option>
          <option value="alquiler">Solo Alquileres</option>
        </select>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
          <p className="text-gray-500">Cargando comisiones...</p>
        </div>
      ) : (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-cyan-100 text-sm">Total Comisiones</p>
                  <p className="text-3xl font-bold mt-1">{formatPrice(stats.totalComisiones)}</p>
                  <p className="text-cyan-100 text-sm mt-2">{stats.totalOperaciones} operaciones cerradas</p>
                </div>
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-8 h-8" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Key className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ventas</p>
                  <p className="text-xl font-bold text-gray-900">{stats.cantidadVentas}</p>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Comisiones:</span>
                  <span className="font-semibold text-cyan-600">{formatPrice(stats.comisionesVenta)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Vol. vendido:</span>
                  <span className="font-medium text-gray-700">{formatPrice(stats.totalVentas)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Alquileres</p>
                  <p className="text-xl font-bold text-gray-900">{stats.cantidadAlquileres}</p>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Comisiones:</span>
                  <span className="font-semibold text-orange-600">{formatPrice(stats.comisionesAlquiler)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Vol. alquilado:</span>
                  <span className="font-medium text-gray-700">{formatPrice(stats.totalAlquileres)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chart - Simple Bar Chart */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Comisiones Últimos 6 Meses</h3>
            <div className="h-48 flex items-end justify-between gap-2">
              {monthlyData.map((month, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col items-center justify-end h-40">
                    {/* Alquileres (orange) */}
                    <div
                      className="w-full bg-orange-400 rounded-t transition-all"
                      style={{
                        height: `${(month.alquileres / maxMonthlyValue) * 100}%`,
                        minHeight: month.alquileres > 0 ? '4px' : '0'
                      }}
                    />
                    {/* Ventas (cyan) */}
                    <div
                      className="w-full bg-cyan-500 rounded-t transition-all"
                      style={{
                        height: `${(month.ventas / maxMonthlyValue) * 100}%`,
                        minHeight: month.ventas > 0 ? '4px' : '0'
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-2 capitalize">{month.month}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded" />
                <span className="text-xs text-gray-600">Ventas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-400 rounded" />
                <span className="text-xs text-gray-600">Alquileres</span>
              </div>
            </div>
          </div>

          {/* Recent Operations */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {isAgentView ? 'Mis Operaciones' : 'Operaciones Cerradas'}
              </h3>
            </div>

            {filteredOperations.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">
                  {isAgentView
                    ? 'No tienes operaciones cerradas en este período'
                    : 'No hay operaciones cerradas en este período'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredOperations.slice(0, 10).map(operation => {
                  const commission = isAgentView ? operation.agentCommission : operation.commissionAmount
                  const percent = isAgentView ? operation.agentCommissionPercent : operation.commissionPercent
                  return (
                    <div key={operation.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            operation.type === 'venta' ? 'bg-cyan-100' : 'bg-orange-100'
                          }`}>
                            {operation.type === 'venta' ? (
                              <Key className="w-5 h-5 text-cyan-600" />
                            ) : (
                              <Building2 className="w-5 h-5 text-orange-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{operation.propertyTitle}</p>
                            <p className="text-sm text-gray-500">{formatDate(operation.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatPrice(commission)}</p>
                          <p className="text-xs text-gray-500">{percent}% de {formatPrice(operation.agreedPrice)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {filteredOperations.length > 10 && (
              <div className="p-4 border-t border-gray-200 text-center">
                <span className="text-sm text-gray-500">
                  Mostrando 10 de {filteredOperations.length} operaciones
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

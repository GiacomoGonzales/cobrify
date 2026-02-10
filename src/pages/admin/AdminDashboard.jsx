import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Calendar,
  CreditCard,
  UserPlus,
  Activity,
  FileText,
  Receipt,
  Zap
} from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getAdminStats, getSystemAlerts, getGlobalBillingStats, recalculateGlobalBillingStats } from '@/services/adminStatsService'
import { PLANS } from '@/services/subscriptionService'

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [billingStats, setBillingStats] = useState(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingRecalculating, setBillingRecalculating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      else setLoading(true)

      // Cargar stats principales primero (rápido)
      const [statsData, alertsData] = await Promise.all([
        getAdminStats(),
        getSystemAlerts()
      ])

      setStats(statsData)
      setAlerts(alertsData)
      setLoading(false)
      setRefreshing(false)

      // Cargar estadísticas de facturación en segundo plano (puede demorar)
      setBillingLoading(true)
      try {
        const billingData = await getGlobalBillingStats()
        setBillingStats(billingData)
      } catch (e) {
        console.error('Error al cargar billing stats:', e)
      } finally {
        setBillingLoading(false)
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRecalculateBilling = async () => {
    setBillingRecalculating(true)
    try {
      const result = await recalculateGlobalBillingStats()
      if (result.success && result.stats) {
        setBillingStats({
          ...result.stats,
          calculatedAt: new Date(),
          fromCache: true
        })
      } else {
        // Recargar desde caché después del recálculo
        const billingData = await getGlobalBillingStats()
        setBillingStats(billingData)
      }
    } catch (e) {
      console.error('Error al recalcular:', e)
    } finally {
      setBillingRecalculating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando estadísticas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header con botón refresh */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Resumen General</h2>
          <p className="text-sm text-gray-500 hidden sm:block">Métricas en tiempo real del sistema</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="p-2 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
        >
          <RefreshCw className={`w-5 h-5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline text-sm font-medium">Actualizar</span>
        </button>
      </div>

      {/* Hero Stats - Estadísticas Globales de Facturación */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xl">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white">Facturación Global</h3>
                <p className="text-sm text-white/70">
                  {billingStats?.calculatedAt
                    ? `Actualizado: ${format(billingStats.calculatedAt, "dd/MM/yyyy HH:mm", { locale: es })}`
                    : 'Estadísticas de todo el sistema'}
                </p>
              </div>
            </div>
            <button
              onClick={handleRecalculateBilling}
              disabled={billingRecalculating || billingLoading}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
              title="Recalcular estadísticas"
            >
              <RefreshCw className={`w-5 h-5 text-white ${billingRecalculating ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {billingLoading || billingRecalculating ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3"></div>
                <p className="text-white/70 text-sm">
                  {billingRecalculating ? 'Recalculando estadísticas...' : 'Cargando estadísticas...'}
                </p>
              </div>
            </div>
          ) : billingStats?.needsCalculation ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-white/70 text-sm mb-4">No hay estadísticas en caché</p>
              <button
                onClick={handleRecalculateBilling}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
              >
                Calcular ahora
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                {/* Total Comprobantes */}
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 sm:p-6 border border-white/20">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-lg">
                      <Receipt className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-white/70 font-medium">Comprobantes Emitidos</p>
                      <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                        {billingStats?.totalDocuments?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </div>
                  {billingStats?.documentTypes && billingStats.documentTypes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <div className="flex flex-wrap gap-2">
                        {billingStats.documentTypes.map((docType, idx) => (
                          <span key={idx} className="px-2 py-1 bg-white/20 rounded text-xs text-white">
                            {docType.name}: {docType.count.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Total Facturado */}
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 sm:p-6 border border-white/20">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-lg">
                      <DollarSign className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-white/70 font-medium">Total Facturado</p>
                      <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                        S/ {billingStats?.totalAmount?.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/20">
                    <p className="text-sm text-white/70">
                      Promedio por comprobante: <span className="text-white font-semibold">
                        S/ {billingStats?.totalDocuments > 0
                          ? (billingStats.totalAmount / billingStats.totalDocuments).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '0.00'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Top negocios que más facturan */}
              {billingStats?.topBusinesses && billingStats.topBusinesses.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/20">
                  <p className="text-sm font-medium text-white/80 mb-3">Top Negocios por Facturación</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {billingStats.topBusinesses.slice(0, 3).map((business, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                        <span className="w-6 h-6 flex items-center justify-center bg-white/20 rounded-full text-xs text-white font-bold">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white font-medium truncate">{business.businessName}</p>
                          <p className="text-xs text-white/60">
                            {business.documentCount} docs - S/ {business.totalAmount.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* MRR */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-4 sm:p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">MRR</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-2 truncate">
                S/ {stats?.mrr?.toFixed(2) || '0.00'}
              </p>
              <p className="text-xs text-gray-500 mt-2 hidden sm:block">Ingresos mensuales</p>
            </div>
            <div className="p-3 sm:p-4 bg-gradient-to-br from-emerald-400 to-green-600 rounded-xl sm:rounded-2xl flex-shrink-0 shadow-lg shadow-green-200 group-hover:scale-110 transition-transform duration-300">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
          </div>
        </div>

        {/* Usuarios Activos */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-4 sm:p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Activos</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-2">{stats?.activeUsers || 0}</p>
              <p className="text-xs text-gray-500 mt-2 hidden sm:block">de {stats?.totalUsers || 0} totales</p>
            </div>
            <div className="p-3 sm:p-4 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-xl sm:rounded-2xl flex-shrink-0 shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
          </div>
        </div>

        {/* Nuevos este mes */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-4 sm:p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Nuevos</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-2">{stats?.newThisMonth || 0}</p>
              <div className="flex items-center mt-2">
                {stats?.growthRate >= 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    +{stats?.growthRate}%
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <TrendingDown className="w-3 h-3 mr-1" />
                    {stats?.growthRate}%
                  </span>
                )}
              </div>
            </div>
            <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-400 to-cyan-600 rounded-xl sm:rounded-2xl flex-shrink-0 shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform duration-300">
              <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
          </div>
        </div>

        {/* Por vencer */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-4 sm:p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Por vencer</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-2">{stats?.expiringThisWeek || 0}</p>
              <p className="text-xs text-gray-500 mt-2 hidden sm:block">en 7 días</p>
            </div>
            <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300 ${
              stats?.expiringThisWeek > 0
                ? 'bg-gradient-to-br from-orange-400 to-red-500 shadow-orange-200'
                : 'bg-gradient-to-br from-gray-300 to-gray-400 shadow-gray-200'
            }`}>
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {/* Tasa de Conversión */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Tasa de Conversión</p>
            <div className="p-2 bg-gradient-to-br from-violet-400 to-purple-600 rounded-lg shadow-md shadow-purple-200">
              <Activity className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {stats?.conversionRate || 0}%
            </span>
            <span className="text-xs sm:text-sm text-gray-500 mb-2">trial a pago</span>
          </div>
          <div className="mt-4 h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${stats?.conversionRate || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Estado de Usuarios */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-5 lg:p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Estado de Usuarios</p>
            <div className="p-2 bg-gradient-to-br from-slate-400 to-gray-600 rounded-lg shadow-md shadow-gray-200">
              <Users className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm text-gray-700 font-medium">Activos</span>
              </div>
              <span className="font-bold text-green-600 text-lg">{stats?.activeUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-orange-50 border border-orange-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span className="text-sm text-gray-700 font-medium">En Trial</span>
              </div>
              <span className="font-bold text-orange-600 text-lg">{stats?.trialUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-sm text-gray-700 font-medium">Suspendidos</span>
              </div>
              <span className="font-bold text-red-600 text-lg">{stats?.suspendedUsers || 0}</span>
            </div>
          </div>
        </div>

        {/* Ingresos Totales */}
        <div className="group bg-white rounded-2xl shadow-md hover:shadow-xl border border-gray-100 p-5 lg:p-6 sm:col-span-2 lg:col-span-1 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Ingresos Totales</p>
            <div className="p-2 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg shadow-md shadow-teal-200">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
              S/ {stats?.totalRevenue?.toFixed(2) || '0.00'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-3 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            Desde el inicio del sistema
          </p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Gráfico de Crecimiento */}
        <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-gray-100 p-5 lg:p-6 transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-bold text-gray-900">Crecimiento de Usuarios</h3>
            <div className="p-2 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-lg shadow-md">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="h-56 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.growthChartData || []}>
                <defs>
                  <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} stroke="#E5E7EB" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} stroke="#E5E7EB" axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nuevos"
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorNuevos)"
                  name="Nuevos usuarios"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribución por Plan */}
        <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-gray-100 p-5 lg:p-6 transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-bold text-gray-900">Distribución por Plan</h3>
            <div className="p-2 bg-gradient-to-br from-pink-400 to-rose-600 rounded-lg shadow-md">
              <Activity className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="h-56 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.planDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {(stats?.planDistribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Alertas y Actividad Reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Alertas */}
        <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-gray-100 p-5 lg:p-6 transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-bold text-gray-900">Alertas del Sistema</h3>
            {alerts.filter(a => a.type === 'error' || a.type === 'warning').length > 0 && (
              <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-full shadow-md">
                {alerts.filter(a => a.type === 'error' || a.type === 'warning').length}
              </span>
            )}
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <p className="text-gray-500 font-medium">No hay alertas pendientes</p>
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${alert.userId}`}
                  className={`block p-3 rounded-xl border-l-4 transition-all duration-200 hover:shadow-md hover:-translate-x-1 ${
                    alert.type === 'error'
                      ? 'bg-red-50 border-red-500 hover:bg-red-100'
                      : alert.type === 'warning'
                      ? 'bg-orange-50 border-orange-500 hover:bg-orange-100'
                      : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1 rounded-full ${
                      alert.type === 'error'
                        ? 'bg-red-100'
                        : alert.type === 'warning'
                        ? 'bg-orange-100'
                        : 'bg-blue-100'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.type === 'error'
                          ? 'text-red-600'
                          : alert.type === 'warning'
                          ? 'text-orange-600'
                          : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                      <p className="text-xs text-gray-600 truncate">{alert.message}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Usuarios Recientes */}
        <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-gray-100 p-5 lg:p-6 transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-bold text-gray-900">Usuarios Recientes</h3>
            <Link
              to="/app/admin/users"
              className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg flex items-center gap-1 transition-colors"
            >
              <span className="hidden sm:inline">Ver todos</span>
              <span className="sm:hidden">Ver</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {(stats?.recentUsers || []).length === 0 ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No hay usuarios recientes</p>
              </div>
            ) : (
              stats.recentUsers.map((user, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${user.email}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
                      <span className="text-white font-bold text-sm">
                        {(user.businessName || user.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {user.businessName || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 text-xs font-medium bg-white text-gray-700 rounded-lg shadow-sm border border-gray-100">
                      {user.planName || PLANS[user.plan]?.name || user.plan}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(user.createdAt, 'dd MMM', { locale: es })}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pagos Recientes */}
      <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-gray-100 p-5 lg:p-6 transition-shadow duration-300">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base lg:text-lg font-bold text-gray-900">Pagos Recientes</h3>
          <Link
            to="/app/admin/payments"
            className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg flex items-center gap-1 transition-colors"
          >
            <span className="hidden sm:inline">Ver historial</span>
            <span className="sm:hidden">Ver</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Vista móvil - Cards */}
        <div className="sm:hidden space-y-3">
          {(stats?.recentPayments || []).length === 0 ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No hay pagos recientes</p>
            </div>
          ) : (
            stats.recentPayments.map((payment, index) => (
              <div key={index} className="p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{payment.businessName || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500 truncate">{payment.email}</p>
                  </div>
                  <span className="text-base font-bold text-emerald-600 ml-2">S/ {payment.amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg">
                    {payment.planName || PLANS[payment.plan]?.name || payment.plan}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{format(payment.date, 'dd/MM/yy', { locale: es })}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Vista desktop - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 rounded-lg">
                <th className="text-left py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider rounded-l-lg">Usuario</th>
                <th className="text-left py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="text-left py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Método</th>
                <th className="text-right py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="text-right py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider rounded-r-lg">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(stats?.recentPayments || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-10">
                    <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                      <CreditCard className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No hay pagos recientes</p>
                  </td>
                </tr>
              ) : (
                stats.recentPayments.map((payment, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center shadow-sm">
                          <span className="text-white font-bold text-xs">
                            {(payment.businessName || payment.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {payment.businessName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-gray-500">{payment.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg">
                        {payment.planName || PLANS[payment.plan]?.name || payment.plan}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 hidden md:table-cell font-medium">
                      {payment.method}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-sm font-bold text-emerald-600">
                        S/ {payment.amount?.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-gray-500 font-medium">
                      {format(payment.date, 'dd/MM/yyyy', { locale: es })}
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

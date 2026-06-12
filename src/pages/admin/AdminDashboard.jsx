import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  Calendar,
  CreditCard,
  UserPlus,
  Activity
} from 'lucide-react'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getAdminStats, getSystemAlerts } from '@/services/adminStatsService'
import { PLANS } from '@/services/subscriptionService'
import { CHART, CHART_TOOLTIP, CHART_SERIES } from '@/components/charts/chartTheme'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState([])
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
    } catch (error) {
      console.error('Error al cargar datos:', error)
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando estadísticas...</p>
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
          className="p-2 sm:px-4 sm:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-5 h-5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline text-sm font-medium">Actualizar</span>
        </button>
      </div>


      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
        {/* MRR */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">MRR</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 truncate">
                S/ {stats?.mrr?.toFixed(2) || '0.00'}
              </p>
              <p className="text-xs text-gray-500 mt-1 hidden sm:block">Ingresos mensuales</p>
            </div>
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 flex-shrink-0" />
          </div>
        </div>

        {/* Por Cobrar Este Mes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Por Cobrar</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 truncate">
                S/ {stats?.collectableThisMonth?.toFixed(2) || '0.00'}
              </p>
              <p className="text-xs text-gray-500 mt-1 hidden sm:block">{stats?.collectableCount || 0} renovaciones</p>
            </div>
            <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 flex-shrink-0" />
          </div>
        </div>

        {/* Usuarios Activos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Activos</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{stats?.activeUsers || 0}</p>
              <p className="text-xs text-gray-500 mt-1 hidden sm:block">de {stats?.totalUsers || 0} totales</p>
            </div>
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-600 flex-shrink-0" />
          </div>
        </div>

        {/* Nuevos este mes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Nuevos</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{stats?.newThisMonth || 0}</p>
              <div className="flex items-center mt-1">
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
            <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 flex-shrink-0" />
          </div>
        </div>

        {/* Por vencer */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Por vencer</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{stats?.expiringThisWeek || 0}</p>
              <p className="text-xs text-gray-500 mt-1 hidden sm:block">en 7 días</p>
            </div>
            <AlertTriangle className={`w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 ${
              stats?.expiringThisWeek > 0 ? 'text-amber-600' : 'text-gray-300'
            }`} />
          </div>
        </div>
      </div>

      {/* Segunda fila de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {/* Tasa de Conversión */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500">Tasa de Conversión</p>
            <Activity className="w-5 h-5 text-primary-600 flex-shrink-0" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl sm:text-4xl font-bold text-gray-900">
              {stats?.conversionRate || 0}%
            </span>
            <span className="text-xs sm:text-sm text-gray-500 mb-1.5">trial a pago</span>
          </div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${stats?.conversionRate || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Estado de Usuarios */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500">Estado de Usuarios</p>
            <Users className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-600">Activos</span>
              </div>
              <span className="font-semibold text-gray-900">{stats?.activeUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className="text-sm text-gray-600">En Trial</span>
              </div>
              <span className="font-semibold text-gray-900">{stats?.trialUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-sm text-gray-600">Suspendidos</span>
              </div>
              <span className="font-semibold text-gray-900">{stats?.suspendedUsers || 0}</span>
            </div>
          </div>
        </div>

        {/* Ingresos Totales */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-gray-500">Ingresos Totales</p>
            <CreditCard className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl sm:text-4xl font-bold text-gray-900">
              S/ {stats?.totalRevenue?.toFixed(2) || '0.00'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-3">Desde el inicio del sistema</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Gráfico de Crecimiento */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Crecimiento de Usuarios</h3>
            <TrendingUp className="w-5 h-5 text-primary-600 flex-shrink-0" />
          </div>
          <div className="h-56 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.growthChartData || []}>
                <defs>
                  <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CHART.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: CHART.axis }} stroke={CHART.grid} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Area
                  type="monotone"
                  dataKey="nuevos"
                  stroke={CHART.primary}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorNuevos)"
                  name="Nuevos usuarios"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribución por Plan */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Distribución por Plan</h3>
            <Activity className="w-5 h-5 text-cyan-600 flex-shrink-0" />
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
                    <Cell key={`cell-${index}`} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Alertas y Actividad Reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Alertas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Alertas del Sistema</h3>
            {alerts.filter(a => a.type === 'error' || a.type === 'warning').length > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                {alerts.filter(a => a.type === 'error' || a.type === 'warning').length}
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-gray-500">No hay alertas pendientes</p>
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${alert.userId}`}
                  className={`block p-3 rounded-lg transition-colors ${
                    alert.type === 'error'
                      ? 'bg-red-50 hover:bg-red-100'
                      : alert.type === 'warning'
                      ? 'bg-amber-50 hover:bg-amber-100'
                      : 'bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      alert.type === 'error'
                        ? 'text-red-600'
                        : alert.type === 'warning'
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`} />
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Usuarios Recientes</h3>
            <Link
              to="/app/admin/users"
              className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg flex items-center gap-1 transition-colors"
            >
              <span className="hidden sm:inline">Ver todos</span>
              <span className="sm:hidden">Ver</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(stats?.recentUsers || []).length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No hay usuarios recientes</p>
              </div>
            ) : (
              stats.recentUsers.map((user, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${user.email}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-700 font-semibold text-sm">
                        {(user.businessName || user.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.businessName || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="px-2 py-1 text-xs font-medium text-gray-600 rounded-lg border border-gray-200">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900">Pagos Recientes</h3>
          <Link
            to="/app/admin/payments"
            className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg flex items-center gap-1 transition-colors"
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
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay pagos recientes</p>
            </div>
          ) : (
            stats.recentPayments.map((payment, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{payment.businessName || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500 truncate">{payment.email}</p>
                  </div>
                  <span className="text-base font-semibold text-emerald-600 ml-2">S/ {payment.amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg">
                    {payment.planName || PLANS[payment.plan]?.name || payment.plan}
                  </span>
                  <span className="text-xs text-gray-500">{format(payment.date, 'dd/MM/yy', { locale: es })}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Vista desktop - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider rounded-l-lg">Usuario</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Método</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider rounded-r-lg">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(stats?.recentPayments || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-10">
                    <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No hay pagos recientes</p>
                  </td>
                </tr>
              ) : (
                stats.recentPayments.map((payment, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-emerald-700 font-semibold text-xs">
                            {(payment.businessName || payment.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {payment.businessName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-gray-500">{payment.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg">
                        {payment.planName || PLANS[payment.plan]?.name || payment.plan}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 hidden md:table-cell">
                      {payment.method}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-semibold text-emerald-600">
                        S/ {payment.amount?.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-500">
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

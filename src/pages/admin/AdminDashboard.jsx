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
  Activity
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
import { getAdminStats, getSystemAlerts } from '@/services/adminStatsService'
import { PLANS } from '@/services/subscriptionService'

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      else setLoading(true)

      const [statsData, alertsData] = await Promise.all([
        getAdminStats(),
        getSystemAlerts()
      ])

      setStats(statsData)
      setAlerts(alertsData)
    } catch (error) {
      console.error('Error al cargar datos:', error)
    } finally {
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando estadísticas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header con botón refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Resumen General</h2>
          <p className="text-sm text-gray-500">Métricas en tiempo real del sistema</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* MRR */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">MRR</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1 truncate">
                S/ {stats?.mrr?.toFixed(2) || '0.00'}
              </p>
              <p className="text-xs text-gray-400 mt-1 hidden sm:block">Ingresos mensuales</p>
            </div>
            <div className="p-2 sm:p-3 bg-green-100 rounded-lg sm:rounded-xl flex-shrink-0">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-green-600" />
            </div>
          </div>
        </div>

        {/* Usuarios Activos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Activos</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{stats?.activeUsers || 0}</p>
              <p className="text-xs text-gray-400 mt-1 hidden sm:block">de {stats?.totalUsers || 0} totales</p>
            </div>
            <div className="p-2 sm:p-3 bg-indigo-100 rounded-lg sm:rounded-xl flex-shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-indigo-600" />
            </div>
          </div>
        </div>

        {/* Nuevos este mes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Nuevos</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{stats?.newThisMonth || 0}</p>
              <div className="flex items-center mt-1">
                {stats?.growthRate >= 0 ? (
                  <>
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mr-1" />
                    <span className="text-xs text-green-600">+{stats?.growthRate}%</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 mr-1" />
                    <span className="text-xs text-red-600">{stats?.growthRate}%</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-2 sm:p-3 bg-blue-100 rounded-lg sm:rounded-xl flex-shrink-0">
              <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Por vencer */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500">Por vencer</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{stats?.expiringThisWeek || 0}</p>
              <p className="text-xs text-gray-400 mt-1 hidden sm:block">7 días</p>
            </div>
            <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl flex-shrink-0 ${stats?.expiringThisWeek > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
              <AlertTriangle className={`w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 ${stats?.expiringThisWeek > 0 ? 'text-orange-600' : 'text-gray-400'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {/* Tasa de Conversión */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Tasa de Conversión</p>
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-indigo-600">{stats?.conversionRate || 0}%</span>
            <span className="text-xs sm:text-sm text-gray-400 mb-1">trial a pago</span>
          </div>
          <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${stats?.conversionRate || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Usuarios Suspendidos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Estado de Usuarios</p>
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                <span className="text-xs sm:text-sm text-gray-600">Activos</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm sm:text-base">{stats?.activeUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
                <span className="text-xs sm:text-sm text-gray-600">En Trial</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm sm:text-base">{stats?.trialUsers || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                <span className="text-xs sm:text-sm text-gray-600">Suspendidos</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm sm:text-base">{stats?.suspendedUsers || 0}</span>
            </div>
          </div>
        </div>

        {/* Ingresos Totales */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Ingresos Totales</p>
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-green-600">S/ {stats?.totalRevenue?.toFixed(2) || '0.00'}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Desde el inicio</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Gráfico de Crecimiento */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4">Crecimiento de Usuarios</h3>
          <div className="h-56 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.growthChartData || []}>
                <defs>
                  <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nuevos"
                  stroke="#4F46E5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNuevos)"
                  name="Nuevos usuarios"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribución por Plan */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4">Distribución por Plan</h3>
          <div className="h-56 sm:h-64 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.planDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
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
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px'
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Alertas del Sistema</h3>
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
              {alerts.filter(a => a.type === 'error' || a.type === 'warning').length}
            </span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>No hay alertas pendientes</p>
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${alert.userId}`}
                  className={`block p-3 rounded-lg border transition-colors hover:shadow-md ${
                    alert.type === 'error'
                      ? 'bg-red-50 border-red-200 hover:bg-red-100'
                      : alert.type === 'warning'
                      ? 'bg-orange-50 border-orange-200 hover:bg-orange-100'
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Usuarios Recientes</h3>
            <Link
              to="/app/admin/users"
              className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <span className="hidden sm:inline">Ver todos</span>
              <span className="sm:hidden">Ver</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {(stats?.recentUsers || []).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No hay usuarios recientes</p>
              </div>
            ) : (
              stats.recentUsers.map((user, index) => (
                <Link
                  key={index}
                  to={`/app/admin/users?search=${user.email}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-600 font-semibold">
                        {(user.businessName || user.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {user.businessName || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                      {PLANS[user.plan]?.name || user.plan}
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:p-6">
        <div className="flex items-center justify-between mb-3 lg:mb-4">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900">Pagos Recientes</h3>
          <Link
            to="/app/admin/payments"
            className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span className="hidden sm:inline">Ver historial</span>
            <span className="sm:hidden">Ver</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Vista móvil - Cards */}
        <div className="sm:hidden space-y-3">
          {(stats?.recentPayments || []).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay pagos recientes
            </div>
          ) : (
            stats.recentPayments.map((payment, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{payment.businessName || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500 truncate">{payment.email}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600 ml-2">S/ {payment.amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                    {PLANS[payment.plan]?.name || payment.plan}
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
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Método</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Monto</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recentPayments || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-gray-500">
                    No hay pagos recientes
                  </td>
                </tr>
              ) : (
                stats.recentPayments.map((payment, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {payment.businessName || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500">{payment.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                        {PLANS[payment.plan]?.name || payment.plan}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 hidden md:table-cell">
                      {payment.method}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-semibold text-green-600">
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

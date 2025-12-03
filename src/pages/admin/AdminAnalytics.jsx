import React, { useState, useEffect } from 'react'
import { getAnalyticsData, getAdminStats } from '@/services/adminStatsService'
import {
  BarChart3,
  PieChart,
  TrendingUp,
  FileText,
  Users,
  RefreshCw,
  Download,
  Building2,
  Zap,
  Server
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line
} from 'recharts'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [statsData, setStatsData] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [analytics, stats] = await Promise.all([
        getAnalyticsData(),
        getAdminStats()
      ])
      setAnalyticsData(analytics)
      setStatsData(stats)
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando analytics...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'General', icon: BarChart3 },
    { id: 'growth', label: 'Crecimiento', icon: TrendingUp },
    { id: 'usage', label: 'Uso', icon: FileText },
    { id: 'distribution', label: 'Distribución', icon: PieChart }
  ]

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 m-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        <div className="p-3 sm:p-6">
          {activeTab === 'overview' && (
            <OverviewTab stats={statsData} analytics={analyticsData} />
          )}
          {activeTab === 'growth' && (
            <GrowthTab stats={statsData} />
          )}
          {activeTab === 'usage' && (
            <UsageTab analytics={analyticsData} />
          )}
          {activeTab === 'distribution' && (
            <DistributionTab stats={statsData} analytics={analyticsData} />
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ stats, analytics }) {
  const kpis = [
    {
      label: 'MRR',
      value: `S/ ${stats?.mrr?.toFixed(2) || 0}`,
      change: '+12%',
      positive: true,
      icon: TrendingUp
    },
    {
      label: 'Usuarios Activos',
      value: stats?.activeUsers || 0,
      change: `+${stats?.newThisMonth || 0} este mes`,
      positive: true,
      icon: Users
    },
    {
      label: 'Documentos Emitidos',
      value: analytics?.totalDocuments?.toLocaleString() || 0,
      change: 'Este mes',
      positive: true,
      icon: FileText
    },
    {
      label: 'Tasa de Conversión',
      value: `${stats?.conversionRate || 0}%`,
      change: 'Trial a pago',
      positive: true,
      icon: Zap
    }
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {kpis.map((kpi, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-3 sm:p-5 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="p-1.5 sm:p-2 bg-indigo-100 rounded-lg">
                <kpi.icon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
              </div>
              <span className={`text-xs font-medium ${kpi.positive ? 'text-green-600' : 'text-red-600'} hidden sm:inline`}>
                {kpi.change}
              </span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{kpi.value}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        {/* Plan Distribution */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Distribución por Plan</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={stats?.planDistribution || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {(stats?.planDistribution || []).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Emission Methods */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Métodos de Emisión</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.emissionMethods || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function GrowthTab({ stats }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Growth Summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-green-50 rounded-xl p-3 sm:p-5 border border-green-200">
          <p className="text-xs sm:text-sm text-green-600 font-medium">Nuevos este mes</p>
          <p className="text-xl sm:text-3xl font-bold text-green-700 mt-1">{stats?.newThisMonth || 0}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 sm:p-5 border border-blue-200">
          <p className="text-xs sm:text-sm text-blue-600 font-medium">Mes anterior</p>
          <p className="text-xl sm:text-3xl font-bold text-blue-700 mt-1">{stats?.newLastMonth || 0}</p>
        </div>
        <div className={`${stats?.growthRate >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} rounded-xl p-3 sm:p-5 border`}>
          <p className={`text-xs sm:text-sm font-medium ${stats?.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            Crecimiento
          </p>
          <p className={`text-xl sm:text-3xl font-bold mt-1 ${stats?.growthRate >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {stats?.growthRate >= 0 ? '+' : ''}{stats?.growthRate || 0}%
          </p>
        </div>
      </div>

      {/* Growth Chart */}
      <div className="bg-gray-50 rounded-xl p-3 sm:p-5">
        <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Crecimiento Mensual</h3>
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats?.growthChartData || []}>
              <defs>
                <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickFormatter={(value, index) => {
                  const data = stats?.growthChartData?.[index]
                  return data ? `${value} ${data.year?.toString().slice(-2)}` : value
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                        <p className="font-medium">{label}</p>
                        <p className="text-indigo-600">Nuevos: {payload[0]?.value}</p>
                        <p className="text-green-600">Total acumulado: {payload[1]?.value}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="nuevos"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorNuevos)"
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTotal)"
              />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function UsageTab({ analytics }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Total Documents */}
      <div className="bg-indigo-50 rounded-xl p-4 sm:p-6 border border-indigo-200">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 bg-indigo-100 rounded-xl">
            <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs sm:text-sm text-indigo-600 font-medium">Total documentos este mes</p>
            <p className="text-2xl sm:text-4xl font-bold text-indigo-700">{analytics?.totalDocuments?.toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      {/* Top Users */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Top 10 Usuarios por Uso</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {(analytics?.topUsers || []).length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No hay datos de uso disponibles
            </div>
          ) : (
            analytics.topUsers.map((user, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 sm:p-4 hover:bg-gray-50"
              >
                <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-white text-xs sm:text-sm ${
                  index === 0 ? 'bg-yellow-500' :
                  index === 1 ? 'bg-gray-400' :
                  index === 2 ? 'bg-amber-600' :
                  'bg-gray-300'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{user.businessName || 'Sin nombre'}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-indigo-600 text-sm sm:text-base">{user.documents}</p>
                  <p className="text-xs text-gray-500">docs</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function DistributionTab({ stats, analytics }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        {/* Plan Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            Usuarios por Plan
          </h3>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={stats?.planDistribution || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {(stats?.planDistribution || []).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Business Mode Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            Tipo de Negocio
          </h3>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={analytics?.businessModes || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {(analytics?.businessModes || []).map((_, index) => (
                    <Cell key={index} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Emission Methods Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Server className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            Métodos de Emisión
          </h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.emissionMethods || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]}>
                  {(analytics?.emissionMethods || []).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { getAnalyticsData, getAdminStats, getAcquisitionData } from '@/services/adminStatsService'
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
  Server,
  Globe,
  Megaphone,
  Search as SearchIcon,
  Share2,
  Link2,
  AlertCircle
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
import { CHART, CHART_TOOLTIP, CHART_SERIES } from '@/components/charts/chartTheme'

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [statsData, setStatsData] = useState(null)
  const [acquisition, setAcquisition] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [analytics, stats, acq] = await Promise.all([
        getAnalyticsData(),
        getAdminStats(),
        getAcquisitionData(30)
      ])
      setAnalyticsData(analytics)
      setStatsData(stats)
      setAcquisition(acq)
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
          <RefreshCw className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando analytics...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'General', icon: BarChart3 },
    { id: 'acquisition', label: 'Adquisición', icon: Megaphone },
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
                  ? 'border-primary-600 text-primary-600'
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
          {activeTab === 'acquisition' && (
            <AcquisitionTab data={acquisition} />
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
            className="bg-white rounded-xl shadow-sm p-3 sm:p-5 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <kpi.icon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 flex-shrink-0" />
              <span className={`text-xs font-medium ${kpi.positive ? 'text-green-600' : 'text-red-600'} hidden sm:inline`}>
                {kpi.change}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{kpi.value}</p>
            <p className="text-xs sm:text-sm font-medium text-gray-500 mt-0.5 sm:mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        {/* Plan Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
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
                    <Cell key={index} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP} />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Emission Methods */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Métodos de Emisión</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.emissionMethods || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART.axis }} />
                <YAxis tick={{ fontSize: 12, fill: CHART.axis }} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="value" fill={CHART.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Ícono e idioma humano para cada canal de origen. */
const SOURCE_META = {
  google: { label: 'Google', icon: SearchIcon, color: '#4285F4' },
  bing: { label: 'Bing', icon: SearchIcon, color: '#008373' },
  duckduckgo: { label: 'DuckDuckGo', icon: SearchIcon, color: '#DE5833' },
  facebook: { label: 'Facebook', icon: Share2, color: '#1877F2' },
  instagram: { label: 'Instagram', icon: Share2, color: '#E4405F' },
  tiktok: { label: 'TikTok', icon: Share2, color: '#111827' },
  youtube: { label: 'YouTube', icon: Share2, color: '#FF0000' },
  whatsapp: { label: 'WhatsApp', icon: Share2, color: '#25D366' },
  twitter: { label: 'X / Twitter', icon: Share2, color: '#111827' },
  linkedin: { label: 'LinkedIn', icon: Share2, color: '#0A66C2' },
  directo: { label: 'Directo', icon: Globe, color: '#6B7280' },
}
const metaFor = (name) => SOURCE_META[name] || { label: name, icon: Link2, color: '#8B5CF6' }

const MEDIUM_LABELS = {
  organico: 'Búsqueda orgánica',
  publicidad: 'Publicidad paga',
  social: 'Redes sociales',
  mensajeria: 'Mensajería',
  referido: 'Sitios referidos',
  directo: 'Directo',
}

function AcquisitionTab({ data }) {
  if (!data) {
    return <p className="text-sm text-gray-500">No se pudieron cargar los datos de adquisición.</p>
  }

  // Todavía no hay nada medido: explicar por qué en vez de mostrar ceros vacíos
  if (!data.hasData) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Aún no hay visitas medidas</p>
            <p className="text-sm text-amber-800 mt-1">
              La medición de origen se acaba de activar, así que los datos empiezan desde ahora.
              Las visitas y registros anteriores no tienen origen registrado.
            </p>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-2">Cómo medir tus campañas</p>
          <p className="text-sm text-gray-600">
            Los anuncios de Google y Meta se detectan solos. Para el resto, agregá parámetros al
            enlace que compartas:
          </p>
          <code className="block mt-2 text-xs bg-white border border-gray-200 rounded-lg p-2.5 text-gray-700 break-all">
            cobrifyperu.com/?utm_source=instagram&amp;utm_medium=publicidad&amp;utm_campaign=agosto
          </code>
        </div>
      </div>
    )
  }

  const maxVisits = Math.max(...data.visitsBySource.map(s => s.value), 1)
  const signupsMap = Object.fromEntries(data.signupsBySource.map(s => [s.name, s.value]))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiBox label={`Visitas (${data.days} días)`} value={data.totalVisits} icon={Globe} color="blue" />
        <KpiBox label="Registros nuevos" value={data.signupsInRange} icon={Users} color="green" />
        <KpiBox
          label="Conversión visita → registro"
          value={data.conversionRate != null ? `${data.conversionRate.toFixed(1)}%` : '—'}
          icon={TrendingUp}
          color="purple"
        />
        <KpiBox label="Con origen identificado" value={data.attributedSignups} icon={Megaphone} color="amber" />
      </div>

      {/* Visitas por día */}
      {data.daily.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Visitas por día</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...CHART_TOOLTIP} />
              <Area type="monotone" dataKey="total" stroke={CHART_SERIES[0]} fill={CHART_SERIES[0]} fillOpacity={0.15} name="Visitas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* De dónde vienen las visitas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">De dónde vienen las visitas</h3>
          <p className="text-xs text-gray-500 mb-4">Y cuántas de ellas terminaron registrándose</p>
          <div className="space-y-3">
            {data.visitsBySource.map(({ name, value }) => {
              const meta = metaFor(name)
              const Icon = meta.icon
              const signups = signupsMap[name] || 0
              return (
                <div key={name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 text-gray-700">
                      <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="text-gray-900 font-medium">
                      {value}
                      {signups > 0 && (
                        <span className="text-green-600 font-semibold"> · {signups} registro{signups > 1 ? 's' : ''}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(value / maxVisits) * 100}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Por tipo de canal */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Por tipo de canal</h3>
          {data.visitsByMedium.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RechartsPie>
                <Pie
                  data={data.visitsByMedium.map(m => ({ name: MEDIUM_LABELS[m.name] || m.name, value: m.value }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {data.visitsByMedium.map((_, i) => (
                    <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip {...CHART_TOOLTIP} />
              </RechartsPie>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">Sin datos aún</p>
          )}
        </div>
      </div>

      {/* Nota sobre registros sin origen */}
      {data.unmeasuredSignups > 0 && (
        <p className="text-xs text-gray-500">
          {data.unmeasuredSignups} registro(s) del período no tienen origen identificado: se crearon
          antes de activar la medición, o el alta la hizo un administrador o reseller.
        </p>
      )}
    </div>
  )
}

function KpiBox({ label, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
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
        <div className="bg-primary-50 rounded-xl p-3 sm:p-5 border border-primary-200">
          <p className="text-xs sm:text-sm text-primary-600 font-medium">Mes anterior</p>
          <p className="text-xl sm:text-3xl font-bold text-primary-700 mt-1">{stats?.newLastMonth || 0}</p>
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
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
        <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Crecimiento Mensual</h3>
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats?.growthChartData || []}>
              <defs>
                <linearGradient id="colorNuevos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.cyan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: CHART.axis }}
                tickFormatter={(value, index) => {
                  const data = stats?.growthChartData?.[index]
                  return data ? `${value} ${data.year?.toString().slice(-2)}` : value
                }}
              />
              <YAxis tick={{ fontSize: 12, fill: CHART.axis }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                        <p className="font-medium">{label}</p>
                        <p className="text-primary-600">Nuevos: {payload[0]?.value}</p>
                        <p className="text-cyan-600">Total acumulado: {payload[1]?.value}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="nuevos"
                stroke={CHART.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorNuevos)"
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={CHART.cyan}
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
      <div className="bg-primary-50 rounded-xl p-4 sm:p-6 border border-primary-200">
        <div className="flex items-center gap-3 sm:gap-4">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600 flex-shrink-0" />
          <div>
            <p className="text-xs sm:text-sm text-primary-600 font-medium">Total documentos este mes</p>
            <p className="text-2xl sm:text-4xl font-bold text-primary-700">{analytics?.totalDocuments?.toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      {/* Top Users */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Top 10 Usuarios por Uso</h3>
        </div>
        <div className="divide-y divide-gray-100">
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
                  index === 0 ? 'bg-amber-500' :
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
                  <p className="font-bold text-primary-600 text-sm sm:text-base">{user.documents}</p>
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
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
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
                    <Cell key={index} fill={CHART_SERIES[index % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Business Mode Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
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
                    <Cell key={index} fill={CHART_SERIES[(index + 2) % CHART_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Emission Methods Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Server className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
            Métodos de Emisión
          </h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.emissionMethods || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis type="number" tick={{ fontSize: 12, fill: CHART.axis }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: CHART.axis }} width={120} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="value" fill={CHART.primary} radius={[0, 4, 4, 0]}>
                  {(analytics?.emissionMethods || []).map((_, index) => (
                    <Cell key={index} fill={CHART_SERIES[index % CHART_SERIES.length]} />
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

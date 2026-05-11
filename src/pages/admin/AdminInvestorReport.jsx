import { useEffect, useState } from 'react'
import {
  TrendingUp, RefreshCw, Building2, DollarSign, Calendar, Briefcase,
  Users, Package, ShoppingCart, Sparkles, Award, Target, Globe,
  ShieldCheck, Truck, Image as ImageIcon, Star, Clock, Activity,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { getInvestorReport, recalculateInvestorReport } from '@/services/adminStatsService'

const fmtCurrency = (v) => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`
const fmtNumber = (v) => (Number(v) || 0).toLocaleString('es-PE')
const fmtDecimal = (v, d = 1) => (Number(v) || 0).toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: d })

const PLAN_LABELS = {
  trial: 'Trial',
  free: 'Gratis',
  basic: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  enterprise: 'Enterprise',
  starter: 'Starter',
}

const MODE_LABELS = {
  retail: 'Retail',
  restaurant: 'Restaurante',
  pharmacy: 'Farmacia',
  real_estate: 'Inmobiliaria',
  transport: 'Transporte',
  hotel: 'Hotel',
  veterinary: 'Veterinaria',
  logistics: 'Logística',
}

function timeAgo(date) {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} día${days !== 1 ? 's' : ''}`
}

export default function AdminInvestorReport() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState(null)
  const [showTopBusinesses, setShowTopBusinesses] = useState(true)

  // Carga inicial: SOLO del caché. NO dispara cálculo.
  useEffect(() => {
    let cancelled = false
    const loadCache = async () => {
      setLoading(true)
      try {
        const r = await getInvestorReport()
        if (!cancelled) setReport(r)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error cargando reporte')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCache()
    return () => { cancelled = true }
  }, [])

  const handleRecalculate = async () => {
    if (!confirm('Esto va a recorrer TODAS las suscripciones, negocios y comprobantes para calcular las métricas. Puede tardar entre 30 segundos y varios minutos según la cantidad de datos. ¿Continuar?')) return
    setRecalculating(true)
    setError(null)
    try {
      const res = await recalculateInvestorReport()
      if (!res.success) {
        setError(res.error || 'Error al calcular')
      } else {
        // Re-leer el cache para refrescar
        const r = await getInvestorReport()
        setReport(r)
      }
    } catch (e) {
      setError(e.message || 'Error al calcular')
    } finally {
      setRecalculating(false)
    }
  }

  // ----- Render -----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
        <span className="text-gray-500">Cargando reporte...</span>
      </div>
    )
  }

  const hasData = report && !report.needsCalculation
  const calcAt = hasData && report.calculatedAt ? new Date(report.calculatedAt) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-white/20 backdrop-blur rounded-xl">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Reporte de Inversores</h1>
              <p className="text-sm opacity-90 mt-1">
                Métricas consolidadas de toda la plataforma. Cálculo bajo demanda para optimizar costos.
              </p>
              {calcAt && (
                <p className="text-xs opacity-75 mt-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Última actualización: {calcAt.toLocaleString('es-PE')} ({timeAgo(calcAt)})
                  {report?.calculationTimeSeconds != null && (
                    <span className="ml-1">· cálculo en {report.calculationTimeSeconds}s</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="bg-white text-indigo-700 hover:bg-white/90 px-5 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
          >
            {recalculating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Calculando... (puede tardar)
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                {hasData ? 'Recalcular ahora' : 'Generar reporte'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      {!hasData && !recalculating && (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-900 mb-1">Aún no se ha generado el reporte</h3>
          <p className="text-sm text-gray-500 mb-4">
            Apretá "Generar reporte" para que Cloud Functions recorra toda la plataforma y calcule las métricas.
            Los datos quedan cacheados así próximas visitas no consumen recursos.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Hero metrics: lo más jugoso para inversores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BigStat
              icon={<DollarSign className="w-6 h-6" />}
              label="Total facturado"
              value={fmtCurrency(report.invoicing.totalAmount)}
              caption={`${fmtNumber(report.invoicing.totalDocuments)} comprobantes`}
              gradient="from-emerald-500 to-teal-600"
            />
            <BigStat
              icon={<Target className="w-6 h-6" />}
              label="MRR"
              value={fmtCurrency(report.subscriptions.mrr)}
              caption="Ingresos recurrentes mensuales"
              gradient="from-blue-500 to-indigo-600"
            />
            <BigStat
              icon={<Award className="w-6 h-6" />}
              label="ARR proyectado"
              value={fmtCurrency(report.subscriptions.arr)}
              caption={`${fmtNumber(report.businesses.active)} negocios activos`}
              gradient="from-purple-500 to-pink-600"
            />
          </div>

          {/* Negocios */}
          <Section icon={<Building2 className="w-5 h-5" />} title="Negocios">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Stat label="Total" value={fmtNumber(report.businesses.total)} color="indigo" />
              <Stat label="Activos" value={fmtNumber(report.businesses.active)} color="emerald" />
              <Stat label="Trial" value={fmtNumber(report.businesses.trial)} color="amber" />
              <Stat label="Suspendidos" value={fmtNumber(report.businesses.suspended)} color="red" />
              <Stat label="Nuevos 30d" value={`+${fmtNumber(report.businesses.newLast30)}`} color="emerald" />
              <Stat label="Nuevos 90d" value={`+${fmtNumber(report.businesses.newLast90)}`} color="emerald" />
            </div>
          </Section>

          {/* Suscripciones */}
          <Section icon={<Calendar className="w-5 h-5" />} title="Suscripciones">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs uppercase font-semibold text-gray-500 mb-2">Por período de pago</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Mensual" value={fmtNumber(report.subscriptions.monthly)} caption="1 mes" color="blue" />
                  <Stat label="Semestral" value={fmtNumber(report.subscriptions.semester || 0)} caption="6 meses" color="amber" />
                  <Stat label="Anual" value={fmtNumber(report.subscriptions.annual)} caption="12 meses" color="purple" />
                  {(report.subscriptions.otherPeriod || 0) > 0 && (
                    <Stat label="Otros" value={fmtNumber(report.subscriptions.otherPeriod)} caption="custom" color="gray" />
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-xs uppercase font-semibold text-gray-500 mb-2">Por plan</h4>
                <div className="space-y-1.5">
                  {Object.entries(report.subscriptions.byPlan || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([plan, count]) => (
                      <DistributionRow
                        key={plan}
                        label={PLAN_LABELS[plan] || plan}
                        count={count}
                        total={report.businesses.total}
                      />
                    ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Modo de negocio */}
          <Section icon={<Briefcase className="w-5 h-5" />} title="Por tipo de negocio">
            <div className="space-y-1.5">
              {Object.entries(report.businessFlags?.byMode || {})
                .sort((a, b) => b[1] - a[1])
                .map(([mode, count]) => (
                  <DistributionRow
                    key={mode}
                    label={MODE_LABELS[mode] || mode}
                    count={count}
                    total={report.businesses.total}
                  />
                ))}
            </div>
          </Section>

          {/* Configuración / features adoptados */}
          <Section icon={<Star className="w-5 h-5" />} title="Adopción de features">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <FeatureCard
                icon={<Globe className="w-4 h-4" />}
                label="Tienda online"
                count={report.businessFlags?.withCatalog || 0}
                total={report.businesses.total}
                color="emerald"
              />
              <FeatureCard
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Libro de reclamos"
                count={report.businessFlags?.withComplaintsBook || 0}
                total={report.businesses.total}
                color="blue"
              />
              <FeatureCard
                icon={<Truck className="w-4 h-4" />}
                label="Guías remisión"
                count={report.businessFlags?.withDispatchGuides || 0}
                total={report.businesses.total}
                color="amber"
              />
              <FeatureCard
                icon={<Users className="w-4 h-4" />}
                label="Asistencia"
                count={report.businessFlags?.withAttendance || 0}
                total={report.businesses.total}
                color="purple"
              />
              <FeatureCard
                icon={<Building2 className="w-4 h-4" />}
                label="Multi-sucursal"
                count={report.businessFlags?.withMultipleBranches || 0}
                total={report.businesses.total}
                color="indigo"
              />
              <FeatureCard
                icon={<ImageIcon className="w-4 h-4" />}
                label="Fotos productos"
                count={report.businessFlags?.withProductImages || 0}
                total={report.businesses.total}
                color="pink"
              />
            </div>
          </Section>

          {/* Volumen transaccional + engagement */}
          <Section icon={<TrendingUp className="w-5 h-5" />} title="Volumen y engagement">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat
                label="Comprobantes"
                value={fmtNumber(report.invoicing.totalDocuments)}
                caption={`${fmtDecimal(report.averages.docsPerBusiness, 1)} prom/negocio`}
                color="emerald"
              />
              <Stat
                label="Ticket prom. negocio"
                value={fmtCurrency(report.averages.revenuePerBusiness)}
                color="blue"
              />
              <Stat
                label="Productos"
                value={fmtNumber(report.engagement.totalProducts)}
                caption={`${fmtDecimal(report.averages.productsPerBusiness, 0)} prom/negocio`}
                color="purple"
              />
              <Stat
                label="Clientes"
                value={fmtNumber(report.engagement.totalCustomers)}
                color="indigo"
              />
              <Stat
                label="Empleados (sub-usuarios)"
                value={fmtNumber(report.engagement.totalEmployees)}
                caption={`${fmtDecimal(report.averages.employeesPerBusiness, 1)} prom/negocio`}
                color="amber"
              />
              <Stat
                label="Sucursales totales"
                value={fmtNumber(report.totalBranchesAcrossBusinesses || 0)}
                color="pink"
              />
            </div>
          </Section>

          {/* Comprobantes por tipo */}
          <Section icon={<ShoppingCart className="w-5 h-5" />} title="Comprobantes por tipo">
            <div className="space-y-1.5">
              {Object.entries(report.invoicing.byDocType || {})
                .filter(([_, c]) => c > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([dt, count]) => (
                  <DistributionRow
                    key={dt}
                    label={
                      dt === 'factura' ? 'Facturas' :
                      dt === 'boleta' ? 'Boletas' :
                      dt === 'nota_venta' ? 'Notas de Venta' :
                      dt === 'nota_credito' ? 'Notas de Crédito' :
                      dt === 'nota_debito' ? 'Notas de Débito' : dt
                    }
                    count={count}
                    total={report.invoicing.totalDocuments}
                  />
                ))}
            </div>
          </Section>

          {/* Top empresas */}
          {report.topBusinessesByRevenue && report.topBusinessesByRevenue.length > 0 && (
            <Section
              icon={<Award className="w-5 h-5" />}
              title={`Top ${report.topBusinessesByRevenue.length} empresas por facturación`}
              right={(
                <button
                  onClick={() => setShowTopBusinesses(v => !v)}
                  className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  {showTopBusinesses ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showTopBusinesses ? 'Ocultar' : 'Mostrar'}
                </button>
              )}
            >
              {showTopBusinesses && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">#</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Empresa</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Modo</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Comprobantes</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Facturado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.topBusinessesByRevenue.map((b, i) => (
                        <tr key={b.businessId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500 font-semibold">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{b.businessName}</td>
                          <td className="px-3 py-2 text-gray-600">{MODE_LABELS[b.businessMode] || b.businessMode}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtNumber(b.documentCount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{fmtCurrency(b.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* Footer info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 flex flex-wrap items-center gap-3">
            <Activity className="w-3.5 h-3.5" />
            <span>Reporte calculado en {report.calculationTimeSeconds}s sobre {fmtNumber(report.businessesProcessed)} negocios.</span>
            <span className="text-gray-300">·</span>
            <span>Los datos quedan cacheados; las próximas visitas no consumen recursos hasta que se vuelva a recalcular.</span>
          </div>
        </>
      )}
    </div>
  )
}

// ===== Sub-componentes =====

function BigStat({ icon, label, value, caption, gradient }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-5`}>
      <div className="absolute -right-4 -bottom-4 opacity-10">
        <div className="text-[7rem] leading-none font-bold">$</div>
      </div>
      <div className="relative">
        <div className="flex items-center gap-2 opacity-80 text-xs uppercase font-semibold tracking-wide mb-2">
          {icon}
          {label}
        </div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {caption && <div className="text-xs opacity-80 mt-1">{caption}</div>}
      </div>
    </div>
  )
}

function Section({ icon, title, children, right }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-indigo-600">{icon}</span>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, caption, color = 'gray' }) {
  const colors = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    purple: 'text-purple-700',
    pink: 'text-pink-700',
    gray: 'text-gray-900',
  }
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <div className="text-[11px] uppercase font-semibold text-gray-500 tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tabular-nums ${colors[color] || colors.gray}`}>{value}</div>
      {caption && <div className="text-[11px] text-gray-500 mt-0.5">{caption}</div>}
    </div>
  )
}

function FeatureCard({ icon, label, count, total, color = 'gray' }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className={`inline-flex items-center justify-center p-1.5 rounded ${colors[color] || colors.gray} mb-1.5`}>
        {icon}
      </div>
      <div className="text-[11px] uppercase font-semibold text-gray-500">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <div className="text-xl font-bold tabular-nums text-gray-900">{count}</div>
        <div className="text-xs text-gray-400">/ {total}</div>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{pct}% adopción</div>
    </div>
  )
}

function DistributionRow({ label, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 w-32 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-900 tabular-nums w-12 text-right">{count}</span>
      <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

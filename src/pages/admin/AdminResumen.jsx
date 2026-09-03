import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { db } from '@/lib/firebase'
import { origenDeCuenta } from '@/utils/subscriptionOwnership'
import {
  getAdminStats,
  getAnalyticsData,
  getSystemAlerts,
  getAcquisitionData,
  getInvestorReport,
  recalculateInvestorReport,
} from '@/services/adminStatsService'
import { PLANS, classifyPlan } from '@/services/subscriptionService'
import { CHART, CHART_TOOLTIP } from '@/components/charts/chartTheme'
import { Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Boton, Cifras, Cifra, Aviso } from '@/components/admin/ui'

// Toda la informacion global en una sola pagina larga. Reune lo que antes
// estaba repartido en Dashboard, Analytics, Distribucion de planes y Reporte
// de inversores. Primero tablas; graficos solo para lo que cambia en el
// tiempo (cuentas nuevas y ventas por mes).
//
// Dos velocidades de carga: lo rapido (stats, alertas, analytics, adquisicion
// y el reporte cacheado) entra solo; el detalle que recorre todas las
// suscripciones y negocios (por plan, por departamento, retencion en vivo)
// se pide con un boton, igual que el recalculo del reporte de inversores.

const moneda = v => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const entero = v => (Number(v) || 0).toLocaleString('es-PE')
const decimal = (v, d = 1) => (Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })
const porcentaje = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—')
const fecha = d => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—')

const MODOS = {
  retail: 'Retail',
  restaurant: 'Restaurante',
  pharmacy: 'Farmacia',
  real_estate: 'Inmobiliaria',
  transport: 'Transporte',
  hotel: 'Hotel',
  veterinary: 'Veterinaria',
  logistics: 'Logística',
}

const PLANES_ETIQUETA = {
  trial: 'Trial',
  free: 'Gratis',
  basic: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  enterprise: 'Enterprise',
  starter: 'Starter',
}

const TIPOS_DOC = {
  factura: 'Facturas',
  boleta: 'Boletas',
  nota_venta: 'Notas de venta',
  nota_credito: 'Notas de crédito',
  nota_debito: 'Notas de débito',
}

const CANALES = {
  organico: 'Búsqueda orgánica',
  publicidad: 'Publicidad paga',
  social: 'Redes sociales',
  mensajeria: 'Mensajería',
  referido: 'Sitios referidos',
  directo: 'Directo',
}

const FUENTES = {
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  directo: 'Directo',
}

const SECCIONES = [
  ['cifras', 'Cifras'],
  ['crecimiento', 'Crecimiento'],
  ['cuentas', 'Cuentas'],
  ['planes', 'Planes'],
  ['uso', 'Uso'],
  ['adquisicion', 'Adquisición'],
  ['retencion', 'Retención'],
  ['inversores', 'Inversores'],
  ['actividad', 'Actividad'],
]

function haceCuanto(date) {
  if (!date) return ''
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} día${dias !== 1 ? 's' : ''}`
}

const titulo = s => String(s || '').trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())

// Recorre suscripciones, negocios y usuarios una sola vez y saca de ahi las
// tres tablas pesadas. Excluye sub-usuarios (tienen ownerId) como Usuarios.
async function cargarDetalleGlobal() {
  const [subsSnap, bizSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'subscriptions')),
    getDocs(collection(db, 'businesses')),
    getDocs(collection(db, 'users')),
  ])
  const negocios = {}
  bizSnap.forEach(d => { negocios[d.id] = d.data() })
  const usuarios = {}
  usersSnap.forEach(d => { usuarios[d.id] = d.data() })

  const ahora = new Date()
  const porPlan = {}
  const porDepartamento = {}
  const totales = { total: 0, activos: 0, trial: 0, vencidos: 0, suspendidos: 0, archivados: 0, directo: 0, reseller: 0, vendedor: 0, legacy: 0 }

  // Retencion (mismo calculo que tenia Usuarios): cada vencimiento es una
  // oportunidad de renovar; los archivados no cuentan.
  let conPagos = 0, vigentes = 0, sinRenovar = 0, enPrimerPeriodo = 0, ingresos = 0, oportunidades = 0, renovaciones = 0

  subsSnap.forEach(d => {
    const data = d.data()
    if (data.ownerId || usuarios[d.id]?.ownerId) return
    const negocio = negocios[d.id] || {}
    const fin = data.currentPeriodEnd?.toDate?.() || null
    const archivado = data.archived === true
    // Mismo criterio que usa "Mi Suscripción" para decidir de quién es la
    // cuenta. Mirando solo `resellerId` quedaban como DIRECTAS las que traen
    // `createdByReseller` sin él.
    const origen = origenDeCuenta(data)

    let estado = 'activos'
    if (data.status === 'suspended' || data.accessBlocked) estado = 'suspendidos'
    else if (data.plan === 'trial' || data.plan === 'free') estado = 'trial'
    else if (fin && fin < ahora) estado = 'vencidos'

    const planId = data.plan || 'desconocido'
    if (!porPlan[planId]) porPlan[planId] = { planId, total: 0, activos: 0, directo: 0, reseller: 0, vendedor: 0 }
    porPlan[planId].total++
    porPlan[planId][origen]++
    if (estado === 'activos') porPlan[planId].activos++

    if (archivado) {
      totales.archivados++
    } else {
      totales.total++
      totales[estado]++
      totales[origen]++
      if (classifyPlan(planId) === 'legacy') totales.legacy++

      const dep = titulo(negocio.department) || 'Sin departamento'
      if (!porDepartamento[dep]) porDepartamento[dep] = { departamento: dep, total: 0, activos: 0, trial: 0, vencidos: 0, suspendidos: 0 }
      porDepartamento[dep].total++
      porDepartamento[dep][estado]++

      const pagos = data.paymentHistory || []
      if (pagos.length) {
        conPagos++
        for (const p of pagos) ingresos += p.amount || 0
        const vigente = fin && fin > ahora
        if (vigente) {
          vigentes++
          if (pagos.length === 1) enPrimerPeriodo++
        } else {
          sinRenovar++
        }
        const renovo = Math.max(0, pagos.length - 1)
        renovaciones += renovo
        oportunidades += renovo + (vigente ? 0 : 1)
      }
    }
  })

  const candidatos = conPagos - enPrimerPeriodo
  const renovados = vigentes - enPrimerPeriodo
  const retencion = {
    conPagos, vigentes, sinRenovar, enPrimerPeriodo, ingresos, candidatos, renovados, oportunidades, renovaciones,
    tasa: candidatos > 0 ? Math.round((renovados / candidatos) * 100) : null,
    tasaHistorica: oportunidades > 0 ? Math.round((renovaciones / oportunidades) * 100) : null,
  }

  const planes = Object.values(porPlan)
    .map(r => ({
      ...r,
      nombre: PLANS[r.planId]?.name || (r.planId === 'desconocido' ? '(sin plan)' : r.planId),
      precio: PLANS[r.planId]?.totalPrice,
      clase: classifyPlan(r.planId),
    }))
    .sort((a, b) => b.total - a.total)

  const departamentos = Object.values(porDepartamento).sort((a, b) => b.total - a.total)

  return { planes, departamentos, retencion, totales, calculadoEn: new Date() }
}

export default function AdminResumen() {
  const [stats, setStats] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [adquisicion, setAdquisicion] = useState(null)
  const [reporte, setReporte] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [error, setError] = useState(null)
  const [actualizadoEn, setActualizadoEn] = useState(null)

  async function cargar(deNuevo = false) {
    deNuevo ? setActualizando(true) : setCargando(true)
    setError(null)
    const [s, a, al, ad, r] = await Promise.allSettled([
      getAdminStats(),
      getAnalyticsData(),
      getSystemAlerts(),
      getAcquisitionData(30),
      getInvestorReport(),
    ])
    if (s.status === 'fulfilled') setStats(s.value)
    if (a.status === 'fulfilled') setAnalytics(a.value)
    if (al.status === 'fulfilled') setAlertas(al.value || [])
    if (ad.status === 'fulfilled') setAdquisicion(ad.value)
    if (r.status === 'fulfilled') setReporte(r.value)
    const fallo = [s, a, al, ad, r].find(x => x.status === 'rejected')
    if (fallo) {
      console.error('Error cargando el resumen:', fallo.reason)
      setError('Una parte del resumen no se pudo cargar. Prueba con Actualizar.')
    }
    setActualizadoEn(new Date())
    setCargando(false)
    setActualizando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  async function cargarDetalle() {
    setCargandoDetalle(true)
    try {
      setDetalle(await cargarDetalleGlobal())
    } catch (e) {
      console.error('Error cargando el detalle global:', e)
      setError('No se pudo cargar el detalle por plan y departamento.')
    } finally {
      setCargandoDetalle(false)
    }
  }

  async function recalcular() {
    if (!window.confirm('Recorre todas las suscripciones, negocios y comprobantes. Puede tardar entre 30 segundos y varios minutos. ¿Continuar?')) return
    setRecalculando(true)
    setError(null)
    try {
      const res = await recalculateInvestorReport()
      if (!res.success) setError(res.error || 'No se pudo calcular el reporte')
      else setReporte(await getInvestorReport())
    } catch (e) {
      setError(e.message || 'No se pudo calcular el reporte')
    } finally {
      setRecalculando(false)
    }
  }

  const hayReporte = reporte && !reporte.needsCalculation
  const reporteEn = hayReporte && reporte.calculatedAt ? new Date(reporte.calculatedAt) : null

  const totalCuentas = detalle?.totales.total ?? stats?.totalUsers ?? 0

  const resumen = cargando
    ? 'Cargando…'
    : `${entero(stats?.totalUsers)} cuentas · ${entero(stats?.activeUsers)} activas · ${entero(stats?.trialUsers)} en trial · ${entero(stats?.suspendedUsers)} suspendidas${actualizadoEn ? ` · actualizado ${haceCuanto(actualizadoEn)}` : ''}`

  return (
    <Pagina
      resumen={resumen}
      acciones={
        <Boton tamano="sm" onClick={() => cargar(true)} disabled={cargando || actualizando}>
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </Boton>
      }
    >
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {SECCIONES.map(([id, nombre]) => (
          <a key={id} href={`#${id}`} className="text-gray-500 hover:text-gray-900">{nombre}</a>
        ))}
      </nav>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando ? (
        <Seccion><p className="text-gray-500 py-6 text-center">Cargando el resumen…</p></Seccion>
      ) : (
        <>
          {/* ── Cifras ─────────────────────────────────────────────────── */}
          <Seccion id="cifras" titulo="Cifras del mes" className="scroll-mt-16">
            <Cifras>
              <Cifra etiqueta="MRR" valor={moneda(stats?.mrr)} nota="ingresos recurrentes" />
              <Cifra etiqueta="Por cobrar este mes" valor={moneda(stats?.collectableThisMonth)} nota={`${entero(stats?.collectableCount)} renovaciones`} />
              <Cifra etiqueta="Ingresos totales" valor={moneda(stats?.totalRevenue)} nota="desde el inicio" />
              <Cifra etiqueta="Cuentas activas" valor={entero(stats?.activeUsers)} nota={`de ${entero(stats?.totalUsers)}`} />
              <Cifra
                etiqueta="Nuevas este mes"
                valor={entero(stats?.newThisMonth)}
                nota={`${stats?.growthRate >= 0 ? '+' : ''}${stats?.growthRate ?? 0} % vs. ${entero(stats?.newLastMonth)} el mes anterior`}
              />
              <Cifra etiqueta="Vencen en 7 días" valor={entero(stats?.expiringThisWeek)} alerta={stats?.expiringThisWeek > 0} />
              <Cifra etiqueta="Conversión trial → pago" valor={`${stats?.conversionRate ?? 0} %`} />
              <Cifra etiqueta="Documentos este mes" valor={entero(analytics?.totalDocuments)} />
            </Cifras>
          </Seccion>

          {/* ── Crecimiento ────────────────────────────────────────────── */}
          <div id="crecimiento" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-16">
            <Seccion titulo="Cuentas nuevas por mes">
              <Grafico datos={stats?.growthChartData} clave="nuevos" nombre="Cuentas nuevas" />
            </Seccion>
            <Seccion titulo="Ventas por mes">
              <Grafico datos={stats?.revenueChartData} clave="monto" nombre="Ventas" dinero />
            </Seccion>
          </div>

          {/* ── Alertas ────────────────────────────────────────────────── */}
          {alertas.length > 0 && (
            <Seccion titulo={`Alertas del sistema (${alertas.length})`} sinRelleno>
              <Tabla>
                <tbody>
                  {alertas.slice(0, 12).map((a, i) => (
                    <Fila key={i}>
                      <Td className={a.type === 'error' ? 'text-red-600 font-medium' : ''}>{a.title}</Td>
                      <Td apagado className="whitespace-normal">{a.message}</Td>
                      <Td alinear="der">
                        {a.userId && (
                          <Link to={`/app/admin/users?q=${encodeURIComponent(a.userId)}`} className="text-primary-700 hover:underline">
                            Ver cuenta
                          </Link>
                        )}
                      </Td>
                    </Fila>
                  ))}
                </tbody>
              </Tabla>
            </Seccion>
          )}

          {/* ── Cuentas ────────────────────────────────────────────────── */}
          <div id="cuentas" className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-16">
            <Seccion titulo="Por estado" sinRelleno>
              <Tabla>
                <tbody>
                  <FilaConteo etiqueta="Activas" valor={stats?.activeUsers} total={stats?.totalUsers} />
                  <FilaConteo etiqueta="En trial" valor={stats?.trialUsers} total={stats?.totalUsers} />
                  <FilaConteo etiqueta="Suspendidas" valor={stats?.suspendedUsers} total={stats?.totalUsers} rojo />
                  {detalle && <FilaConteo etiqueta="Vencidas" valor={detalle.totales.vencidos} total={detalle.totales.total} rojo />}
                  {detalle && <FilaConteo etiqueta="Archivadas" valor={detalle.totales.archivados} nota="fuera de las tasas" />}
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Por tipo de negocio" sinRelleno>
              <Tabla>
                <tbody>
                  {(analytics?.businessModes || []).map(m => (
                    <FilaConteo key={m.name} etiqueta={MODOS[m.name] || m.name} valor={m.value} total={stats?.totalUsers} />
                  ))}
                  {!(analytics?.businessModes || []).length && <FilaVacia colSpan={3}>Sin datos</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Por método de emisión" sinRelleno>
              <Tabla>
                <tbody>
                  {(analytics?.emissionMethods || []).map(m => (
                    <FilaConteo key={m.name} etiqueta={m.name} valor={m.value} total={stats?.totalUsers} />
                  ))}
                  {!(analytics?.emissionMethods || []).length && <FilaVacia colSpan={3}>Sin datos</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
          </div>

          {/* ── Planes y departamentos (detalle pesado, bajo demanda) ──── */}
          <Seccion
            id="planes"
            titulo="Por plan"
            descripcion="Cuántas cuentas hay en cada plan, por origen. Lee todas las suscripciones y negocios."
            className="scroll-mt-16"
            sinRelleno
            acciones={
              <Boton tamano="sm" onClick={cargarDetalle} disabled={cargandoDetalle}>
                {cargandoDetalle ? 'Cargando…' : detalle ? 'Recargar' : 'Cargar detalle'}
              </Boton>
            }
          >
            {detalle ? (
              <>
                <div className="px-4 py-2 text-[12.5px] text-gray-500 border-b border-gray-100">
                  {entero(detalle.totales.total)} cuentas · {entero(detalle.totales.directo)} directas · {entero(detalle.totales.reseller)} de reseller · {entero(detalle.totales.vendedor)} de vendedor · {entero(detalle.totales.legacy)} en planes legacy
                </div>
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Plan</Th>
                      <Th>Clase</Th>
                      <Th alinear="der">Precio</Th>
                      <Th alinear="der">Cuentas</Th>
                      <Th alinear="der">Activas</Th>
                      <Th alinear="der">Directas</Th>
                      <Th alinear="der">Reseller</Th>
                      <Th alinear="der">Vendedor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.planes.map(p => (
                      <Fila key={p.planId}>
                        <Td>
                          {p.nombre} <span className="text-gray-400 font-mono text-[11px]">{p.planId}</span>
                        </Td>
                        <Td apagado className={p.clase === 'desconocido' ? 'text-red-600' : ''}>{p.clase}</Td>
                        <Td numero apagado>{p.precio != null ? moneda(p.precio) : '—'}</Td>
                        <Td numero className="font-medium">{entero(p.total)}</Td>
                        <Td numero>{entero(p.activos)}</Td>
                        <Td numero apagado>{entero(p.directo)}</Td>
                        <Td numero apagado>{entero(p.reseller)}</Td>
                        <Td numero apagado>{entero(p.vendedor)}</Td>
                      </Fila>
                    ))}
                  </tbody>
                </Tabla>
                <p className="px-4 py-2 text-[11.5px] text-gray-500">
                  vendible = catálogo actual · sistema = trial y enterprise · legacy = plan viejo por migrar · desconocido = id sin reconocer
                </p>
              </>
            ) : (
              <SinDetalle cargando={cargandoDetalle} />
            )}
          </Seccion>

          <Seccion titulo="Por departamento" sinRelleno>
            {detalle ? (
              <Tabla>
                <thead>
                  <tr>
                    <Th>Departamento</Th>
                    <Th alinear="der">Cuentas</Th>
                    <Th alinear="der">Activas</Th>
                    <Th alinear="der">Trial</Th>
                    <Th alinear="der">Vencidas</Th>
                    <Th alinear="der">Suspendidas</Th>
                    <Th alinear="der">% del total</Th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.departamentos.map(d => (
                    <Fila key={d.departamento}>
                      <Td className={d.departamento === 'Sin departamento' ? 'text-gray-400' : ''}>{d.departamento}</Td>
                      <Td numero className="font-medium">{entero(d.total)}</Td>
                      <Td numero>{entero(d.activos)}</Td>
                      <Td numero apagado>{entero(d.trial)}</Td>
                      <Td numero className={d.vencidos ? 'text-red-600' : 'text-gray-400'}>{entero(d.vencidos)}</Td>
                      <Td numero className={d.suspendidos ? 'text-red-600' : 'text-gray-400'}>{entero(d.suspendidos)}</Td>
                      <Td numero apagado>{porcentaje(d.total, detalle.totales.total)}</Td>
                    </Fila>
                  ))}
                </tbody>
              </Tabla>
            ) : (
              <SinDetalle cargando={cargandoDetalle} />
            )}
          </Seccion>

          {/* ── Uso ────────────────────────────────────────────────────── */}
          <Seccion id="uso" titulo="Cuentas con más documentos este mes" className="scroll-mt-16" sinRelleno>
            <Tabla>
              <thead>
                <tr>
                  <Th ancho={40} alinear="der">#</Th>
                  <Th>Cuenta</Th>
                  <Th>Correo</Th>
                  <Th alinear="der">Documentos</Th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.topUsers || []).map((u, i) => (
                  <Fila key={i}>
                    <Td numero apagado>{i + 1}</Td>
                    <Td className="font-medium">{u.businessName || 'Sin nombre'}</Td>
                    <Td apagado>{u.email}</Td>
                    <Td numero>{entero(u.documents)}</Td>
                  </Fila>
                ))}
                {!(analytics?.topUsers || []).length && <FilaVacia colSpan={4}>Sin datos de uso</FilaVacia>}
              </tbody>
            </Tabla>
          </Seccion>

          {/* ── Adquisición ────────────────────────────────────────────── */}
          <Seccion id="adquisicion" titulo="Adquisición (últimos 30 días)" className="scroll-mt-16">
            <Adquisicion datos={adquisicion} />
          </Seccion>

          {/* ── Retención ──────────────────────────────────────────────── */}
          <Seccion
            id="retencion"
            titulo="Retención"
            descripcion="Calculada en vivo sobre los pagos de cada cuenta. Los archivados no cuentan."
            className="scroll-mt-16"
            acciones={!detalle && (
              <Boton tamano="sm" onClick={cargarDetalle} disabled={cargandoDetalle}>
                {cargandoDetalle ? 'Cargando…' : 'Calcular'}
              </Boton>
            )}
          >
            {detalle ? (
              <>
                <Cifras>
                  <Cifra etiqueta="Tasa de retención" valor={detalle.retencion.tasa !== null ? `${detalle.retencion.tasa} %` : '—'} nota="vigentes / los que ya pasaron su primer vencimiento" />
                  <Cifra etiqueta="Tasa histórica" valor={detalle.retencion.tasaHistorica !== null ? `${detalle.retencion.tasaHistorica} %` : '—'} nota="renovaciones / oportunidades" />
                  <Cifra etiqueta="Con pagos" valor={entero(detalle.retencion.conPagos)} />
                  <Cifra etiqueta="Vigentes" valor={entero(detalle.retencion.vigentes)} nota={`${entero(detalle.retencion.enPrimerPeriodo)} en su primer periodo`} />
                  <Cifra etiqueta="Vencieron sin renovar" valor={entero(detalle.retencion.sinRenovar)} alerta={detalle.retencion.sinRenovar > 0} />
                  <Cifra etiqueta="Ingresos históricos" valor={moneda(detalle.retencion.ingresos)} />
                </Cifras>
                <p className="mt-3 text-[11.5px] text-gray-500">
                  Retención: {entero(detalle.retencion.renovados)} de {entero(detalle.retencion.candidatos)} candidatos siguen vigentes.
                  Histórica: {entero(detalle.retencion.renovaciones)} renovaciones en {entero(detalle.retencion.oportunidades)} oportunidades; cada vencimiento cuenta como una.
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-gray-500">{cargandoDetalle ? 'Calculando…' : 'Pulsa Calcular para recorrer los pagos de todas las cuentas.'}</p>
            )}
          </Seccion>

          {/* ── Reporte de inversores ──────────────────────────────────── */}
          <Seccion
            id="inversores"
            titulo="Reporte para inversores"
            descripcion={reporteEn
              ? `Calculado ${reporteEn.toLocaleString('es-PE')} (${haceCuanto(reporteEn)})${reporte?.calculationTimeSeconds != null ? ` en ${reporte.calculationTimeSeconds} s` : ''}. Queda guardado hasta el próximo recálculo.`
              : 'Recorre toda la plataforma y guarda el resultado; solo se recalcula cuando lo pides.'}
            className="scroll-mt-16"
            acciones={
              <Boton tamano="sm" onClick={recalcular} disabled={recalculando}>
                {recalculando ? 'Calculando…' : hayReporte ? 'Recalcular' : 'Generar reporte'}
              </Boton>
            }
          >
            {hayReporte ? <Inversores r={reporte} /> : (
              <p className="text-[12.5px] text-gray-500">{recalculando ? 'Calculando… puede tardar varios minutos.' : 'Todavía no se generó el reporte.'}</p>
            )}
          </Seccion>

          {/* ── Actividad reciente ─────────────────────────────────────── */}
          <div id="actividad" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-16">
            <Seccion titulo="Cuentas recientes" sinRelleno acciones={<Link to="/app/admin/users" className="text-[12.5px] text-primary-700 hover:underline">Ver todas</Link>}>
              <Tabla>
                <tbody>
                  {(stats?.recentUsers || []).map((u, i) => (
                    <Fila key={i}>
                      <Td>
                        <Link to={`/app/admin/users?q=${encodeURIComponent(u.email || '')}`} className="hover:underline">{u.businessName || 'Sin nombre'}</Link>
                        <div className="text-[11.5px] text-gray-500">{u.email}</div>
                      </Td>
                      <Td apagado>{u.planName || PLANS[u.plan]?.name || u.plan}</Td>
                      <Td numero apagado>{fecha(u.createdAt)}</Td>
                    </Fila>
                  ))}
                  {!(stats?.recentUsers || []).length && <FilaVacia colSpan={3}>Sin cuentas recientes</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Pagos recientes" sinRelleno acciones={<Link to="/app/admin/payments" className="text-[12.5px] text-primary-700 hover:underline">Ver historial</Link>}>
              <Tabla>
                <tbody>
                  {(stats?.recentPayments || []).map((p, i) => (
                    <Fila key={i}>
                      <Td>
                        {p.businessName || 'Sin nombre'}
                        <div className="text-[11.5px] text-gray-500">{p.email}</div>
                      </Td>
                      <Td apagado>{p.planName || PLANS[p.plan]?.name || p.plan}{p.method ? ` · ${p.method}` : ''}</Td>
                      <Td numero className="font-medium">{moneda(p.amount)}</Td>
                      <Td numero apagado>{fecha(p.date)}</Td>
                    </Fila>
                  ))}
                  {!(stats?.recentPayments || []).length && <FilaVacia colSpan={4}>Sin pagos recientes</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
          </div>
        </>
      )}
    </Pagina>
  )
}

function SinDetalle({ cargando }) {
  return (
    <p className="px-4 py-6 text-[12.5px] text-gray-500 text-center">
      {cargando ? 'Leyendo suscripciones y negocios…' : 'Pulsa Cargar detalle para leer todas las cuentas.'}
    </p>
  )
}

function FilaConteo({ etiqueta, valor, total, nota, rojo = false }) {
  const n = Number(valor) || 0
  return (
    <Fila>
      <Td apagado>{etiqueta}{nota && <span className="ml-1.5 text-[11px] text-gray-400">{nota}</span>}</Td>
      <Td numero className={rojo && n > 0 ? 'text-red-600 font-medium' : 'font-medium'}>{entero(n)}</Td>
      <Td numero apagado ancho={64}>{total ? porcentaje(n, total) : ''}</Td>
    </Fila>
  )
}

// Grafico de area en un solo color, relleno plano (sin degradado).
function Grafico({ datos, clave, nombre, dinero = false }) {
  const filas = datos || []
  if (!filas.length) return <p className="text-[12.5px] text-gray-500 py-8 text-center">Sin datos</p>
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filas} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: CHART.axis }}
            stroke={CHART.grid}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v)}
          />
          <Tooltip contentStyle={{ ...CHART_TOOLTIP, fontSize: 12 }} formatter={v => [dinero ? moneda(v) : entero(v), nombre]} />
          <Area type="monotone" dataKey={clave} name={nombre} stroke={CHART.primary} strokeWidth={2} fill={CHART.primary} fillOpacity={0.08} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Adquisicion({ datos }) {
  if (!datos) return <p className="text-[12.5px] text-gray-500">No se pudieron cargar los datos de adquisición.</p>
  if (!datos.hasData) {
    return (
      <div className="space-y-3 max-w-2xl">
        <Aviso titulo="Todavía no hay visitas medidas">
          La medición de origen se activó hace poco; las visitas y registros anteriores no tienen origen.
        </Aviso>
        <p className="text-[12.5px] text-gray-500">
          Los anuncios de Google y Meta se detectan solos. Para el resto, agrega parámetros al enlace que compartas:
        </p>
        <code className="block text-[12px] bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-700 break-all">
          cobrifyperu.com/?utm_source=instagram&amp;utm_medium=publicidad&amp;utm_campaign=agosto
        </code>
      </div>
    )
  }
  const registrosPorFuente = Object.fromEntries((datos.signupsBySource || []).map(s => [s.name, s.value]))
  const totalVisitas = datos.totalVisits || 0
  return (
    <div className="space-y-4">
      <Cifras>
        <Cifra etiqueta={`Visitas (${datos.days} días)`} valor={entero(datos.totalVisits)} />
        <Cifra etiqueta="Registros nuevos" valor={entero(datos.signupsInRange)} />
        <Cifra etiqueta="Visita → registro" valor={datos.conversionRate != null ? `${decimal(datos.conversionRate, 1)} %` : '—'} />
        <Cifra etiqueta="Con origen identificado" valor={entero(datos.attributedSignups)} />
      </Cifras>
      {datos.daily?.length > 1 && (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.axis }} tickFormatter={d => d.slice(5)} stroke={CHART.grid} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: CHART.axis }} allowDecimals={false} stroke={CHART.grid} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ ...CHART_TOOLTIP, fontSize: 12 }} formatter={v => [entero(v), 'Visitas']} />
              <Area type="monotone" dataKey="total" name="Visitas" stroke={CHART.primary} strokeWidth={2} fill={CHART.primary} fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <Th>Fuente</Th>
                <Th alinear="der">Visitas</Th>
                <Th alinear="der">%</Th>
                <Th alinear="der">Registros</Th>
              </tr>
            </thead>
            <tbody>
              {(datos.visitsBySource || []).map(s => (
                <Fila key={s.name}>
                  <Td>{FUENTES[s.name] || s.name}</Td>
                  <Td numero>{entero(s.value)}</Td>
                  <Td numero apagado>{porcentaje(s.value, totalVisitas)}</Td>
                  <Td numero className={registrosPorFuente[s.name] ? 'font-medium' : 'text-gray-400'}>{entero(registrosPorFuente[s.name] || 0)}</Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        </div>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr>
                <Th>Tipo de canal</Th>
                <Th alinear="der">Visitas</Th>
                <Th alinear="der">%</Th>
              </tr>
            </thead>
            <tbody>
              {(datos.visitsByMedium || []).map(m => (
                <Fila key={m.name}>
                  <Td>{CANALES[m.name] || m.name}</Td>
                  <Td numero>{entero(m.value)}</Td>
                  <Td numero apagado>{porcentaje(m.value, totalVisitas)}</Td>
                </Fila>
              ))}
              {!(datos.visitsByMedium || []).length && <FilaVacia colSpan={3}>Sin datos</FilaVacia>}
            </tbody>
          </Tabla>
        </div>
      </div>
      {datos.unmeasuredSignups > 0 && (
        <p className="text-[11.5px] text-gray-500">
          {datos.unmeasuredSignups} registro(s) del periodo sin origen: se crearon antes de activar la medición, o el alta la hizo un administrador o reseller.
        </p>
      )}
    </div>
  )
}

function Inversores({ r }) {
  const total = r.businesses?.total || 0
  const funciones = [
    ['Tienda online', r.businessFlags?.withCatalog],
    ['Libro de reclamaciones', r.businessFlags?.withComplaintsBook],
    ['Guías de remisión', r.businessFlags?.withDispatchGuides],
    ['Asistencia', r.businessFlags?.withAttendance],
    ['Más de una sucursal', r.businessFlags?.withMultipleBranches],
    ['Fotos de productos', r.businessFlags?.withProductImages],
  ]
  const ret = r.retention
  return (
    <div className="space-y-5">
      <Cifras>
        <Cifra etiqueta="Total facturado por los negocios" valor={moneda(r.invoicing?.totalAmount)} nota={`${entero(r.invoicing?.totalDocuments)} comprobantes`} />
        <Cifra etiqueta="MRR" valor={moneda(r.subscriptions?.mrr)} />
        <Cifra etiqueta="ARR proyectado" valor={moneda(r.subscriptions?.arr)} nota={`${entero(r.businesses?.active)} negocios activos`} />
        {ret && <Cifra etiqueta="Retención" valor={ret.currentRate !== null && ret.currentRate !== undefined ? `${ret.currentRate} %` : '—'} nota={`${entero(ret.renewed)} / ${entero(ret.candidates)}`} />}
        {ret && <Cifra etiqueta="Renovación histórica" valor={ret.lifetimeRate !== null && ret.lifetimeRate !== undefined ? `${ret.lifetimeRate} %` : '—'} nota={`${entero(ret.totalRenewals)} / ${entero(ret.totalOpportunities)}`} />}
      </Cifras>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Bloque titulo="Negocios">
          <tbody>
            <FilaConteo etiqueta="Total" valor={r.businesses?.total} />
            <FilaConteo etiqueta="Activos" valor={r.businesses?.active} total={total} />
            <FilaConteo etiqueta="Trial" valor={r.businesses?.trial} total={total} />
            <FilaConteo etiqueta="Suspendidos" valor={r.businesses?.suspended} total={total} rojo />
            <FilaConteo etiqueta="Archivados" valor={r.businesses?.archived || 0} nota="fuera de las tasas" />
            <FilaConteo etiqueta="Nuevos, últimos 30 días" valor={r.businesses?.newLast30} />
            <FilaConteo etiqueta="Nuevos, últimos 90 días" valor={r.businesses?.newLast90} />
          </tbody>
        </Bloque>
        <Bloque titulo="Suscripciones">
          <tbody>
            <FilaConteo etiqueta="Mensuales" valor={r.subscriptions?.monthly} total={total} />
            <FilaConteo etiqueta="Semestrales" valor={r.subscriptions?.semester || 0} total={total} />
            <FilaConteo etiqueta="Anuales" valor={r.subscriptions?.annual} total={total} />
            {(r.subscriptions?.otherPeriod || 0) > 0 && <FilaConteo etiqueta="Otros periodos" valor={r.subscriptions?.otherPeriod} total={total} />}
            {Object.entries(r.subscriptions?.byPlan || {}).sort((a, b) => b[1] - a[1]).map(([plan, n]) => (
              <FilaConteo key={plan} etiqueta={`Plan ${PLANES_ETIQUETA[plan] || plan}`} valor={n} total={total} />
            ))}
          </tbody>
        </Bloque>
        <Bloque titulo="Por tipo de negocio">
          <tbody>
            {Object.entries(r.businessFlags?.byMode || {}).sort((a, b) => b[1] - a[1]).map(([modo, n]) => (
              <FilaConteo key={modo} etiqueta={MODOS[modo] || modo} valor={n} total={total} />
            ))}
          </tbody>
        </Bloque>
        <Bloque titulo="Funciones que usan">
          <tbody>
            {funciones.map(([nombre, n]) => (
              <FilaConteo key={nombre} etiqueta={nombre} valor={n || 0} total={total} />
            ))}
          </tbody>
        </Bloque>
        <Bloque titulo="Volumen">
          <tbody>
            <FilaConteo etiqueta="Comprobantes" valor={r.invoicing?.totalDocuments} nota={`${decimal(r.averages?.docsPerBusiness, 1)} por negocio`} />
            <Fila><Td apagado>Facturado promedio por negocio</Td><Td numero className="font-medium">{moneda(r.averages?.revenuePerBusiness)}</Td><Td /></Fila>
            <FilaConteo etiqueta="Productos" valor={r.engagement?.totalProducts} nota={`${decimal(r.averages?.productsPerBusiness, 0)} por negocio`} />
            <FilaConteo etiqueta="Clientes" valor={r.engagement?.totalCustomers} />
            <FilaConteo etiqueta="Empleados (sub-usuarios)" valor={r.engagement?.totalEmployees} nota={`${decimal(r.averages?.employeesPerBusiness, 1)} por negocio`} />
            <FilaConteo etiqueta="Sucursales" valor={r.totalBranchesAcrossBusinesses || 0} />
          </tbody>
        </Bloque>
        <Bloque titulo="Comprobantes por tipo">
          <tbody>
            {Object.entries(r.invoicing?.byDocType || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
              <FilaConteo key={tipo} etiqueta={TIPOS_DOC[tipo] || tipo} valor={n} total={r.invoicing?.totalDocuments} />
            ))}
          </tbody>
        </Bloque>
      </div>

      {r.topBusinessesByRevenue?.length > 0 && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="px-3 py-2 text-[12.5px] font-medium text-gray-900 border-b border-gray-200 bg-gray-50">
            Las {r.topBusinessesByRevenue.length} empresas que más facturan
          </div>
          <Tabla>
            <thead>
              <tr>
                <Th ancho={40} alinear="der">#</Th>
                <Th>Empresa</Th>
                <Th>Tipo</Th>
                <Th alinear="der">Comprobantes</Th>
                <Th alinear="der">Facturado</Th>
              </tr>
            </thead>
            <tbody>
              {r.topBusinessesByRevenue.map((b, i) => (
                <Fila key={b.businessId}>
                  <Td numero apagado>{i + 1}</Td>
                  <Td className="font-medium">{b.businessName}</Td>
                  <Td apagado>{MODOS[b.businessMode] || b.businessMode}</Td>
                  <Td numero>{entero(b.documentCount)}</Td>
                  <Td numero className="font-medium">{moneda(b.totalAmount)}</Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}

      <p className="text-[11.5px] text-gray-500">
        Calculado en {r.calculationTimeSeconds} s sobre {entero(r.businessesProcessed)} negocios.
      </p>
    </div>
  )
}

function Bloque({ titulo: nombre, children }) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="px-3 py-2 text-[12.5px] font-medium text-gray-900 border-b border-gray-200 bg-gray-50">{nombre}</div>
      <Tabla>{children}</Tabla>
    </div>
  )
}

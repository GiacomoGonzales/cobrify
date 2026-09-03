import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getInvestorReport, recalculateInvestorReport } from '@/services/adminStatsService'
import { resumenRapido, resumenCompleto, compararCobranza } from '@/services/adminResumenService'
import { PLANS } from '@/services/subscriptionService'
import { CHART, CHART_TOOLTIP } from '@/components/charts/chartTheme'
import { Pagina, Seccion, Tabla, Th, Td, Fila, FilaVacia, Boton, Cifras, Cifra, Aviso } from '@/components/admin/ui'

// Toda la informacion global en una sola pagina, en dos velocidades:
// - al abrir, las cifras contadas en el servidor (agregaciones, ~16 lecturas)
//   y la ultima foto del reporte de inversores (1 lectura);
// - con "Cargar todo", el resto: lee suscripciones, negocios y usuarios UNA
//   vez y de ahi salen graficos, alertas, planes, departamentos, uso,
//   adquisicion, retencion y actividad.

const moneda = v => `S/ ${(Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const entero = v => (Number(v) || 0).toLocaleString('es-PE')
const decimal = (v, d = 1) => (Number(v) || 0).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d })
const porcentaje = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—')
const fecha = d => (d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—')

const MODOS = { retail: 'Retail', restaurant: 'Restaurante', pharmacy: 'Farmacia', real_estate: 'Inmobiliaria', transport: 'Transporte', hotel: 'Hotel', veterinary: 'Veterinaria', logistics: 'Logística', lending: 'Préstamos' }
const PLANES_ETIQUETA = { trial: 'Trial', free: 'Gratis', basic: 'Básico', pro: 'Pro', premium: 'Premium', enterprise: 'Enterprise', starter: 'Starter' }
const TIPOS_DOC = { factura: 'Facturas', boleta: 'Boletas', nota_venta: 'Notas de venta', nota_credito: 'Notas de crédito', nota_debito: 'Notas de débito' }
const CANALES = { organico: 'Búsqueda orgánica', publicidad: 'Publicidad paga', social: 'Redes sociales', mensajeria: 'Mensajería', referido: 'Sitios referidos', directo: 'Directo' }
const FUENTES = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp', twitter: 'X / Twitter', linkedin: 'LinkedIn', directo: 'Directo' }

const SECCIONES = [
  ['crecimiento', 'Crecimiento'],
  ['alertas', 'Alertas'],
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

export default function AdminResumen() {
  const [rapido, setRapido] = useState(null)
  const [cargandoRapido, setCargandoRapido] = useState(true)
  const [reporte, setReporte] = useState(null)
  // La foto para inversores no va en la primera pantalla: se abre a pedido.
  const [verInversores, setVerInversores] = useState(false)
  const [completo, setCompleto] = useState(null)
  const [cargandoCompleto, setCargandoCompleto] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [error, setError] = useState(null)

  async function cargarRapido() {
    setCargandoRapido(true)
    setError(null)
    const [r, inv] = await Promise.allSettled([resumenRapido(), getInvestorReport()])
    if (r.status === 'fulfilled') setRapido(r.value)
    else {
      console.error('Error contando cuentas:', r.reason)
      setError('No se pudieron contar las cuentas. Prueba con Recontar.')
    }
    if (inv.status === 'fulfilled') setReporte(inv.value)
    setCargandoRapido(false)
  }

  useEffect(() => {
    cargarRapido()
  }, [])

  async function cargarCompleto() {
    setCargandoCompleto(true)
    setError(null)
    try {
      setCompleto(await resumenCompleto())
    } catch (e) {
      console.error('Error cargando el resumen completo:', e)
      setError('No se pudo cargar el detalle.')
    } finally {
      setCargandoCompleto(false)
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
  const stats = completo?.stats
  const analytics = completo?.analytics
  const alertas = completo?.alertas || []
  const adquisicion = completo?.adquisicion
  const detalle = completo?.detalle

  const resumen = cargandoRapido
    ? 'Contando cuentas…'
    : rapido
      ? `${entero(rapido.total)} cuentas · ${entero(rapido.activas)} activas · ${entero(rapido.suspendidas)} suspendidas · contado ${haceCuanto(rapido.calculadoEn)}`
      : ''

  return (
    <Pagina
      resumen={resumen}
      acciones={
        <>
          <Boton tamano="sm" onClick={cargarRapido} disabled={cargandoRapido}>{cargandoRapido ? 'Contando…' : 'Recontar'}</Boton>
          <Boton tamano="sm" variante={completo ? 'secundario' : 'primario'} onClick={cargarCompleto} disabled={cargandoCompleto}>
            {cargandoCompleto ? 'Cargando…' : completo ? 'Recargar todo' : 'Cargar todo'}
          </Boton>
        </>
      }
    >
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {/* ── Lo barato: cifras contadas en el servidor ─────────────────────── */}
      <Seccion titulo="Cifras" descripcion="Contadas en el servidor al abrir la página, sin leer las cuentas una por una.">
        {rapido ? (
          <Cifras>
            <Cifra etiqueta="Cuentas" valor={entero(rapido.total)} nota={`${entero(rapido.activas)} activas`} />
            <Cifra etiqueta="Suspendidas" valor={entero(rapido.suspendidas)} />
            <Cifra etiqueta="Nuevas este mes" valor={entero(rapido.nuevasMes)} />
            <Cifra etiqueta="Vencen en 7 días" valor={entero(rapido.vencen7)} alerta={rapido.vencen7 > 0} />
            <Cifra etiqueta="Vencidas, últimos 7 días" valor={entero(rapido.vencidas7)} alerta={rapido.vencidas7 > 0} />
            <Cifra etiqueta="Renuevan este mes" valor={entero(rapido.renuevanMes)} nota="activas que vencen este mes" />
            <Cifra etiqueta="MRR" valor={moneda(rapido.mrr)} nota="activas × precio mensual del plan" />
          </Cifras>
        ) : (
          <p className="text-[12.5px] text-gray-500">{cargandoRapido ? 'Contando…' : 'Sin datos'}</p>
        )}
      </Seccion>

      {/* ── Cobranza: lo que entro de verdad ─────────────────────────────── */}
      <Seccion
        titulo="Cobranza"
        descripcion={completo
          ? 'Sobre los pagos registrados en todas las cuentas.'
          : 'Los pagos viven dentro de cada cuenta, así que no se pueden contar en el servidor: llegan con “Cargar todo”.'}
      >
        {completo?.cobranza ? (
          <>
            <Cifras>
              <Cifra
                etiqueta="Cobrado hoy"
                valor={moneda(completo.cobranza.hoy)}
                nota={`${entero(completo.cobranza.cuentaHoy)} pago${completo.cobranza.cuentaHoy === 1 ? '' : 's'} · ${compararCobranza(completo.cobranza.hoy, completo.cobranza.ayer, 'ayer')}`}
              />
              <Cifra
                etiqueta="Cobrado este mes"
                valor={moneda(completo.cobranza.mes)}
                nota={`${entero(completo.cobranza.cuentaMes)} pago${completo.cobranza.cuentaMes === 1 ? '' : 's'} · ${compararCobranza(completo.cobranza.mes, completo.cobranza.mesPasado, 'el mes pasado')}`}
              />
              <Cifra etiqueta="Ticket promedio del mes" valor={moneda(completo.cobranza.ticket)} />
              <Cifra etiqueta="Mes pasado completo" valor={moneda(completo.cobranza.pasadoCompleto)} nota="los 30 días, para tener con qué medir" />
            </Cifras>
            <div className="mt-4">
              <Grafico datos={completo.cobranza.meses} clave="total" nombre="Cobrado" dinero />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12.5px] text-gray-500">Todavía no se cargó.</p>
            <Boton tamano="sm" variante="primario" onClick={cargarCompleto} disabled={cargandoCompleto}>
              {cargandoCompleto ? 'Cargando…' : 'Cargar'}
            </Boton>
          </div>
        )}
      </Seccion>

      {/* ── La foto para inversores: fuera de la vista hasta que se pida ──── */}
      {!verInversores ? (
        <button
          type="button"
          onClick={() => setVerInversores(true)}
          className="self-start text-[12.5px] text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          Ver la foto para inversores
        </button>
      ) : (
      <Seccion
        id="inversores"
        titulo="Última foto para inversores"
        descripcion={reporteEn
          ? `Calculada ${reporteEn.toLocaleString('es-PE')} (${haceCuanto(reporteEn)})${reporte?.calculationTimeSeconds != null ? ` en ${reporte.calculationTimeSeconds} s` : ''}. Queda guardada hasta el próximo recálculo.`
          : 'Recorre toda la plataforma en el servidor y guarda el resultado; solo se recalcula cuando lo pides.'}
        className="scroll-mt-16"
        acciones={
          <>
            <Boton tamano="sm" onClick={recalcular} disabled={recalculando}>
              {recalculando ? 'Calculando…' : hayReporte ? 'Recalcular' : 'Generar reporte'}
            </Boton>
            <Boton tamano="sm" variante="enlace" onClick={() => setVerInversores(false)}>Ocultar</Boton>
          </>
        }
      >
        {hayReporte ? (
          <Cifras>
            <Cifra etiqueta="Facturado por los negocios" valor={moneda(reporte.invoicing?.totalAmount)} nota={`${entero(reporte.invoicing?.totalDocuments)} comprobantes`} />
            <Cifra etiqueta="MRR" valor={moneda(reporte.subscriptions?.mrr)} />
            <Cifra etiqueta="ARR proyectado" valor={moneda(reporte.subscriptions?.arr)} />
            <Cifra etiqueta="Negocios activos" valor={entero(reporte.businesses?.active)} nota={`de ${entero(reporte.businesses?.total)}`} />
            {reporte.retention && <Cifra etiqueta="Retención" valor={reporte.retention.currentRate != null ? `${reporte.retention.currentRate} %` : '—'} nota={`${entero(reporte.retention.renewed)} / ${entero(reporte.retention.candidates)}`} />}
            {reporte.retention && <Cifra etiqueta="Renovación histórica" valor={reporte.retention.lifetimeRate != null ? `${reporte.retention.lifetimeRate} %` : '—'} nota={`${entero(reporte.retention.totalRenewals)} / ${entero(reporte.retention.totalOpportunities)}`} />}
          </Cifras>
        ) : (
          <p className="text-[12.5px] text-gray-500">{recalculando ? 'Calculando… puede tardar varios minutos.' : 'Todavía no se generó el reporte.'}</p>
        )}
      </Seccion>
      )}

      {/* ── Lo demas, cuando lo pides ─────────────────────────────────────── */}
      {!completo ? (
        <Seccion titulo="Todo lo demás">
          <p className="text-[12.5px] text-gray-600">
            Gráficos de crecimiento y ventas, alertas, cuentas por estado, tipo y método de emisión, planes por origen, departamentos,
            uso, adquisición, retención en vivo, el reporte de inversores completo y la actividad reciente. Lee todas las cuentas
            una sola vez (unas {entero(rapido ? rapido.total * 3 : 2000)} lecturas), por eso no se carga solo.
          </p>
          <div className="mt-3">
            <Boton variante="primario" onClick={cargarCompleto} disabled={cargandoCompleto}>{cargandoCompleto ? 'Cargando…' : 'Cargar todo'}</Boton>
          </div>
        </Seccion>
      ) : (
        <>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {SECCIONES.map(([id, nombre]) => (
              <a key={id} href={`#${id}`} className="text-gray-500 hover:text-gray-900">{nombre}</a>
            ))}
            <span className="text-gray-400">· leídas {entero(completo.lecturas)} · {haceCuanto(completo.calculadoEn)}</span>
          </nav>

          <Seccion titulo="Cifras del mes (exactas)" descripcion="Con las cuentas ya leídas: excluye sub-usuarios y suma los pagos.">
            <Cifras>
              <Cifra etiqueta="MRR" valor={moneda(stats.mrr)} nota="ingresos recurrentes" />
              <Cifra etiqueta="Por cobrar este mes" valor={moneda(stats.collectableThisMonth)} nota={`${entero(stats.collectableCount)} renovaciones`} />
              <Cifra etiqueta="Ingresos totales" valor={moneda(stats.totalRevenue)} nota="desde el inicio" />
              <Cifra etiqueta="Cuentas activas" valor={entero(stats.activeUsers)} nota={`de ${entero(stats.totalUsers)}`} />
              <Cifra etiqueta="Nuevas este mes" valor={entero(stats.newThisMonth)} nota={`${stats.growthRate >= 0 ? '+' : ''}${stats.growthRate ?? 0} % vs. ${entero(stats.newLastMonth)} el mes anterior`} />
              <Cifra etiqueta="Conversión trial → pago" valor={`${stats.conversionRate ?? 0} %`} />
              <Cifra etiqueta="Documentos este mes" valor={entero(analytics?.totalDocuments)} />
            </Cifras>
          </Seccion>

          <div id="crecimiento" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-16">
            <Seccion titulo="Cuentas nuevas por mes">
              <Grafico datos={stats.growthChartData} clave="nuevos" nombre="Cuentas nuevas" />
            </Seccion>
            <Seccion titulo="Ventas por mes">
              <Grafico datos={stats.revenueChartData} clave="monto" nombre="Ventas" dinero />
            </Seccion>
          </div>

          <Seccion id="alertas" titulo={`Alertas (${alertas.length})`} className="scroll-mt-16" sinRelleno>
            <Tabla>
              <tbody>
                {alertas.length === 0 && <FilaVacia colSpan={3}>Sin alertas</FilaVacia>}
                {alertas.slice(0, 20).map((a, i) => (
                  <Fila key={i}>
                    <Td className={a.type === 'error' ? 'text-red-600 font-medium' : ''}>{a.title}</Td>
                    <Td apagado className="whitespace-normal">{a.message}</Td>
                    <Td alinear="der">
                      {a.userId && <Link to={`/app/admin/users/${a.userId}`} className="text-primary-700 hover:underline">Ver cuenta</Link>}
                    </Td>
                  </Fila>
                ))}
              </tbody>
            </Tabla>
          </Seccion>

          <div id="cuentas" className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-16">
            <Seccion titulo="Por estado" sinRelleno>
              <Tabla>
                <tbody>
                  <FilaConteo etiqueta="Activas" valor={detalle.totales.activos} total={detalle.totales.total} />
                  <FilaConteo etiqueta="En trial" valor={detalle.totales.trial} total={detalle.totales.total} />
                  <FilaConteo etiqueta="Vencidas" valor={detalle.totales.vencidos} total={detalle.totales.total} rojo />
                  <FilaConteo etiqueta="Suspendidas" valor={detalle.totales.suspendidos} total={detalle.totales.total} rojo />
                  <FilaConteo etiqueta="Archivadas" valor={detalle.totales.archivados} nota="fuera de las tasas" />
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Por tipo de negocio" sinRelleno>
              <Tabla>
                <tbody>
                  {(analytics?.businessModes || []).map(m => (
                    <FilaConteo key={m.name} etiqueta={m.name} valor={m.value} total={stats.totalUsers} />
                  ))}
                  {!(analytics?.businessModes || []).length && <FilaVacia colSpan={3}>Sin datos</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Por método de emisión" sinRelleno>
              <Tabla>
                <tbody>
                  {(analytics?.emissionMethods || []).map(m => (
                    <FilaConteo key={m.name} etiqueta={m.name} valor={m.value} total={stats.totalUsers} />
                  ))}
                  {!(analytics?.emissionMethods || []).length && <FilaVacia colSpan={3}>Sin datos</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
          </div>

          <Seccion id="planes" titulo="Por plan" descripcion="Cuántas cuentas hay en cada plan, por origen." className="scroll-mt-16" sinRelleno>
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
                    <Td>{p.nombre} <span className="text-gray-400 font-mono text-[11px]">{p.planId}</span></Td>
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
          </Seccion>

          <Seccion titulo="Por departamento" sinRelleno>
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
          </Seccion>

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

          <Seccion id="adquisicion" titulo="Adquisición (últimos 30 días)" className="scroll-mt-16">
            <Adquisicion datos={adquisicion} />
          </Seccion>

          <Seccion id="retencion" titulo="Retención" descripcion="Calculada en vivo sobre los pagos de cada cuenta. Los archivados no cuentan." className="scroll-mt-16">
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
          </Seccion>

          {hayReporte && (
            <Seccion titulo="Reporte para inversores, completo" descripcion={reporteEn ? `Foto del ${reporteEn.toLocaleString('es-PE')}.` : undefined}>
              <Inversores r={reporte} />
            </Seccion>
          )}

          <div id="actividad" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-16">
            <Seccion titulo="Cuentas recientes" sinRelleno acciones={<Link to="/app/admin/users" className="text-[12.5px] text-primary-700 hover:underline">Ver todas</Link>}>
              <Tabla>
                <tbody>
                  {(stats.recentUsers || []).map((u, i) => (
                    <Fila key={i}>
                      <Td className="max-w-[240px]">
                        <Link to={`/app/admin/users/${u.id}`} className="block truncate hover:underline">{u.businessName || 'Sin nombre'}</Link>
                        <div className="truncate text-[11.5px] text-gray-500">{u.email}</div>
                      </Td>
                      <Td apagado>{u.planName || PLANS[u.plan]?.name || u.plan}</Td>
                      <Td numero apagado>{fecha(u.createdAt)}</Td>
                    </Fila>
                  ))}
                  {!(stats.recentUsers || []).length && <FilaVacia colSpan={3}>Sin cuentas nuevas en la última semana</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
            <Seccion titulo="Pagos recientes" sinRelleno acciones={<Link to="/app/admin/payments" className="text-[12.5px] text-primary-700 hover:underline">Ver historial</Link>}>
              <Tabla>
                <tbody>
                  {(stats.recentPayments || []).map((p, i) => (
                    <Fila key={i}>
                      <Td className="max-w-[240px]">
                        <Link to={`/app/admin/users/${p.userId}`} className="block truncate hover:underline">{p.businessName || 'Sin nombre'}</Link>
                        <div className="truncate text-[11.5px] text-gray-500">{p.email}</div>
                      </Td>
                      <Td apagado>{p.planName || PLANS[p.plan]?.name || p.plan}{p.method ? ` · ${p.method}` : ''}</Td>
                      <Td numero className="font-medium">{moneda(p.amount)}</Td>
                      <Td numero apagado>{fecha(p.date)}</Td>
                    </Fila>
                  ))}
                  {!(stats.recentPayments || []).length && <FilaVacia colSpan={4}>Sin pagos este mes</FilaVacia>}
                </tbody>
              </Tabla>
            </Seccion>
          </div>
        </>
      )}
    </Pagina>
  )
}

function FilaConteo({ etiqueta, valor, total, nota, rojo = false }) {
  const n = Number(valor) || 0
  return (
    <Fila>
      <Td apagado>{etiqueta}{nota && <span className="ml-1.5 text-[11px] text-gray-400">{nota}</span>}</Td>
      <Td numero className={rojo && n > 0 ? 'text-red-600 font-medium' : 'font-medium'}>{entero(n)}</Td>
      <Td numero apagado>{total ? porcentaje(n, total) : ''}</Td>
    </Fila>
  )
}

// Grafico de area en un solo color, relleno plano (sin degradado).
function Grafico({ datos, clave, nombre, dinero = false }) {
  const filas = datos || []
  if (!filas.length) return <p className="text-[12.5px] text-gray-500 py-8 text-center">Sin datos</p>
  return (
    <div className="h-52 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filas} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} axisLine={false} tickLine={false} tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v)} />
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
        <Aviso titulo="Todavía no hay visitas medidas">La medición de origen se activó hace poco; las visitas y registros anteriores no tienen origen.</Aviso>
        <p className="text-[12.5px] text-gray-500">Los anuncios de Google y Meta se detectan solos. Para el resto, agrega parámetros al enlace que compartas:</p>
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
        <div className="min-w-0 border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr><Th>Fuente</Th><Th alinear="der">Visitas</Th><Th alinear="der">%</Th><Th alinear="der">Registros</Th></tr>
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
        <div className="min-w-0 border border-gray-200 rounded-md overflow-hidden">
          <Tabla>
            <thead>
              <tr><Th>Tipo de canal</Th><Th alinear="der">Visitas</Th><Th alinear="der">%</Th></tr>
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
  return (
    <div className="space-y-5">
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
            {funciones.map(([nombre, n]) => <FilaConteo key={nombre} etiqueta={nombre} valor={n || 0} total={total} />)}
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
        <div className="min-w-0 border border-gray-200 rounded-md overflow-hidden">
          <div className="px-3 py-2 text-[12.5px] font-medium text-gray-900 border-b border-gray-200 bg-gray-50">
            Las {r.topBusinessesByRevenue.length} empresas que más facturan
          </div>
          <Tabla>
            <thead>
              <tr><Th ancho={40} alinear="der">#</Th><Th>Empresa</Th><Th>Tipo</Th><Th alinear="der">Comprobantes</Th><Th alinear="der">Facturado</Th></tr>
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

      <p className="text-[11.5px] text-gray-500">Calculado en {r.calculationTimeSeconds} s sobre {entero(r.businessesProcessed)} negocios.</p>
    </div>
  )
}

function Bloque({ titulo: nombre, children }) {
  return (
    <div className="min-w-0 border border-gray-200 rounded-md overflow-hidden">
      <div className="px-3 py-2 text-[12.5px] font-medium text-gray-900 border-b border-gray-200 bg-gray-50">{nombre}</div>
      <Tabla>{children}</Tabla>
    </div>
  )
}

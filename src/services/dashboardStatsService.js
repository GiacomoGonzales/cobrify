import { db } from '@/lib/firebase'
import {
  collection, query, where, getDocs, getAggregateFromServer, sum, count,
} from 'firebase/firestore'

/**
 * TOTALES DEL MES SIN DESCARGAR EL MES.
 *
 * Medido en una cuenta real (19,578 comprobantes): bajar agosto entero son
 * 6,431 documentos, 34.8 MB y 45.6 segundos. La misma suma pedida al servidor
 * tarda 1.2 segundos.
 *
 * El problema no era la suma sino la EXACTITUD: `sum('total')` suma TODO, y el
 * Dashboard tiene que excluir notas de crédito/débito, anuladas, archivadas y
 * notas de venta ya convertidas. Por eso antes se bajaba el mes entero.
 *
 * La salida está en que esas excluidas son POQUÍSIMAS —24 de 6,431 en la cuenta
 * medida—, así que se piden aparte y se restan. El resultado da idéntico al
 * céntimo que descargar todo.
 *
 * Y descargar el mes no solo hacía lento al Dashboard: la caché local del SDK
 * es de 100 MB y los comprobantes de esa cuenta pesan 105 MB, así que cada
 * visita al Dashboard desalojaba productos, clientes y configuración. Por eso
 * "todo" se sentía lento, no solo esta pantalla.
 *
 * CUÁNDO NO SE PUEDE USAR (el llamador debe verificarlo):
 *  - Multi-divisa: `sum('total')` sumaría dólares como si fueran soles.
 *  - Usuario limitado a sucursales/almacenes o a un vendedor: la agregación no
 *    puede filtrar por eso.
 * En esos casos hay que seguir descargando y sumando en el cliente.
 */

/** Los estados y tipos que NO cuentan como venta. Mismo criterio que el Dashboard. */
const TIPOS_EXCLUIDOS = ['nota_credito', 'nota_debito']
const ESTADOS_EXCLUIDOS = ['cancelled', 'voided', 'pending_cancellation', 'partial_refund_pending']
const SUNAT_EXCLUIDOS = ['voiding', 'voided']

const invoicesRef = (businessId) => collection(db, 'businesses', businessId, 'invoices')

const enRango = (businessId, desde, hasta) => [
  invoicesRef(businessId),
  where('createdAt', '>=', desde),
  where('createdAt', '<', hasta),
]

/**
 * Los comprobantes del rango que NO cuentan como venta.
 *
 * Cinco consultas dirigidas, cada una devuelve un puñado. Se juntan sin repetir
 * porque un mismo documento puede caer en varias (una nota de crédito anulada).
 */
const traerExcluidos = async (businessId, desde, hasta) => {
  const consultas = [
    query(...enRango(businessId, desde, hasta), where('documentType', 'in', TIPOS_EXCLUIDOS)),
    query(...enRango(businessId, desde, hasta), where('status', 'in', ESTADOS_EXCLUIDOS)),
    query(...enRango(businessId, desde, hasta), where('sunatStatus', 'in', SUNAT_EXCLUIDOS)),
    query(...enRango(businessId, desde, hasta), where('archived', '==', true)),
    query(...enRango(businessId, desde, hasta),
      where('documentType', '==', 'nota_venta'), where('convertedTo', '!=', null)),
  ]

  const resultados = await Promise.all(consultas.map(q => getDocs(q)))
  const porId = new Map()
  for (const snap of resultados) {
    snap.forEach(d => {
      if (porId.has(d.id)) return
      const data = d.data()
      porId.set(d.id, {
        total: Number(data.total) || 0,
        fecha: data.createdAt?.toDate ? data.createdAt.toDate() : null,
      })
    })
  }
  return [...porId.values()]
}

/**
 * Ventas del mes: total, cantidad y serie por día.
 *
 * @param {string} businessId
 * @param {Date} monthStart  inicio del mes (hora Perú)
 * @param {Date} monthEnd    inicio del mes siguiente (exclusivo)
 * @param {Date} [hasta]     hasta dónde pedir días; por defecto, el fin de mes
 * @returns {Promise<{ok: boolean, sales?: number, count?: number, daily?: Object, error?: string}>}
 */
export const getMonthSalesAggregated = async (businessId, monthStart, monthEnd, hasta = null) => {
  try {
    const fin = hasta && hasta < monthEnd ? hasta : monthEnd

    // Un tramo por día: sirve para el total (sumando) y para el gráfico diario.
    const dias = []
    const cursor = new Date(monthStart)
    while (cursor < fin) {
      const siguiente = new Date(cursor)
      siguiente.setDate(siguiente.getDate() + 1)
      dias.push({ dia: cursor.getDate(), desde: new Date(cursor), hasta: siguiente > fin ? new Date(fin) : siguiente })
      cursor.setTime(siguiente.getTime())
    }
    if (dias.length === 0) return { ok: true, sales: 0, count: 0, daily: {} }

    const [agregados, excluidos] = await Promise.all([
      Promise.all(dias.map(d =>
        getAggregateFromServer(
          query(...enRango(businessId, d.desde, d.hasta)),
          { total: sum('total'), n: count() }
        )
      )),
      traerExcluidos(businessId, monthStart, fin),
    ])

    const daily = {}
    let sales = 0
    let cantidad = 0
    agregados.forEach((res, i) => {
      const d = res.data()
      const t = Number(d.total) || 0
      daily[dias[i].dia] = t
      sales += t
      cantidad += Number(d.n) || 0
    })

    // Restar lo que no cuenta, en su día y en el total.
    for (const ex of excluidos) {
      sales -= ex.total
      cantidad -= 1
      if (ex.fecha) {
        const dia = ex.fecha.getDate()
        if (daily[dia] != null) daily[dia] = daily[dia] - ex.total
      }
    }

    // Un redondeo al final: restar decimales puede dejar -0.0000001.
    for (const k of Object.keys(daily)) daily[k] = Math.round(daily[k] * 100) / 100

    return {
      ok: true,
      sales: Math.round(sales * 100) / 100,
      count: Math.max(0, cantidad),
      daily,
    }
  } catch (error) {
    // El caso esperado es 'failed-precondition': el índice todavía se está
    // construyendo. El llamador debe caer al camino de siempre (descargar).
    console.warn('Agregación del mes no disponible, se usará la descarga:', error?.code || error?.message)
    return { ok: false, error: error?.code || error?.message }
  }
}

/** Total de un rango cualquiera, ya descontando lo que no cuenta como venta. */
export const getRangeSalesAggregated = async (businessId, desde, hasta) => {
  try {
    const [agg, excluidos] = await Promise.all([
      getAggregateFromServer(query(...enRango(businessId, desde, hasta)), { total: sum('total'), n: count() }),
      traerExcluidos(businessId, desde, hasta),
    ])
    const d = agg.data()
    let sales = Number(d.total) || 0
    let cantidad = Number(d.n) || 0
    for (const ex of excluidos) { sales -= ex.total; cantidad -= 1 }
    return { ok: true, sales: Math.round(sales * 100) / 100, count: Math.max(0, cantidad) }
  } catch (error) {
    console.warn('Agregación de rango no disponible:', error?.code || error?.message)
    return { ok: false, error: error?.code || error?.message }
  }
}

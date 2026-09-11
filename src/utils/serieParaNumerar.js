/**
 * CON QUÉ SERIE SE NUMERA un comprobante, y qué número le toca. Una sola regla
 * para la transacción que asigna el número (firestoreService:
 * createInvoiceWithNumber y getNextDocumentNumber) y para los que lo anuncian
 * antes: el "Siguiente:" del POS, el número probable del chat y la columna
 * "Siguiente" de Configuración > Series. Si cada uno eligiera por su cuenta,
 * se anunciaría un número y saldría otro.
 *
 * El orden:
 *  1. Varios RUC: un comprobante de otro RUC numera SOLO con las series de ese
 *     RUC (`emisorSeries`); nunca cae a las del negocio ni a las de una sede,
 *     porque dos RUC no pueden compartir correlativo.
 *  2. La serie de la sucursal (`branchSeries`).
 *  3. La del almacén (`warehouseSeries`, compatibilidad hacia atrás).
 *  4. La del negocio (`series`).
 *
 * Manda la primera que aparece. Si le falta la serie está mal configurada y
 * cuenta como "sin serie": pasar a la siguiente numeraría con el correlativo
 * de otra sede (y hasta setiembre de 2026 salía un "undefined-00000001").
 */
import { esPrincipal } from '../../functions/src/utils/emisorDelComprobante.js'

const elegir = (datos, ruta) => (datos?.serie ? { datos, ruta } : null)

/**
 * @param {object} negocio  el doc del negocio (o sus cuatro mapas de series)
 * @param {{documentType: string, emisorId?: string, branchId?: string, warehouseId?: string}} opciones
 * @returns {{datos: {serie: string, lastNumber: number}, ruta: string} | null}
 *   `ruta` es el campo del contador en el doc del negocio; null si no hay serie
 */
export function serieParaNumerar(negocio, { documentType, emisorId = null, branchId = null, warehouseId = null } = {}) {
  if (!negocio || !documentType) return null

  if (!esPrincipal(emisorId)) {
    return elegir(negocio.emisorSeries?.[emisorId]?.[documentType], `emisorSeries.${emisorId}.${documentType}`)
  }

  const deSucursal = branchId ? negocio.branchSeries?.[branchId]?.[documentType] : null
  if (deSucursal) return elegir(deSucursal, `branchSeries.${branchId}.${documentType}`)

  const deAlmacen = warehouseId ? negocio.warehouseSeries?.[warehouseId]?.[documentType] : null
  if (deAlmacen) return elegir(deAlmacen, `warehouseSeries.${warehouseId}.${documentType}`)

  return elegir(negocio.series?.[documentType], `series.${documentType}`)
}

/** El correlativo que sigue al último emitido de esa serie. */
export function correlativoSiguiente(datos) {
  return (Number(datos?.lastNumber) || 0) + 1
}

/** "B001-00000124": la serie con el correlativo que sigue. */
export function numeroSiguiente(datos) {
  if (!datos?.serie) return ''
  return `${datos.serie}-${String(correlativoSiguiente(datos)).padStart(8, '0')}`
}

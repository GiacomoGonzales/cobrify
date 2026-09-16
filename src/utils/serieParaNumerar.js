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
 *  2. La serie del USUARIO que emite (`userSeries`), para dos personas que
 *     venden desde el MISMO punto de venta con series distintas (pedido de
 *     NOVAKENE, 16-set-2026: "cada una de las series será asignada a un
 *     usuario"). Va encima de la sucursal porque es lo más específico: la
 *     persona lleva su serie donde venda. Antes esto solo se lograba
 *     inventando una sucursal por persona.
 *  3. La serie de la sucursal (`branchSeries`).
 *  4. La del almacén (`warehouseSeries`, compatibilidad hacia atrás).
 *  5. La del negocio (`series`).
 *
 * `userSeries` nace vacío en todas las cuentas: sin nadie asignado, la regla
 * es exactamente la de siempre.
 *
 * Manda la primera que aparece. Si le falta la serie está mal configurada y
 * cuenta como "sin serie": pasar a la siguiente numeraría con el correlativo
 * de otra sede (y hasta setiembre de 2026 salía un "undefined-00000001").
 */
import { esPrincipal } from '../../functions/src/utils/emisorDelComprobante.js'

const elegir = (datos, ruta) => (datos?.serie ? { datos, ruta } : null)

/**
 * @param {object} negocio  el doc del negocio (o sus cinco mapas de series)
 * @param {{documentType: string, emisorId?: string, branchId?: string, warehouseId?: string, userId?: string}} opciones
 *   `userId` es quien emite (el `createdBy` del comprobante), no el vendedor
 *   de las comisiones: la serie va con la cuenta desde la que se vende.
 * @returns {{datos: {serie: string, lastNumber: number}, ruta: string} | null}
 *   `ruta` es el campo del contador en el doc del negocio; null si no hay serie
 */
export function serieParaNumerar(negocio, { documentType, emisorId = null, branchId = null, warehouseId = null, userId = null } = {}) {
  if (!negocio || !documentType) return null

  if (!esPrincipal(emisorId)) {
    return elegir(negocio.emisorSeries?.[emisorId]?.[documentType], `emisorSeries.${emisorId}.${documentType}`)
  }

  const delUsuario = userId ? negocio.userSeries?.[userId]?.[documentType] : null
  if (delUsuario) return elegir(delUsuario, `userSeries.${userId}.${documentType}`)

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

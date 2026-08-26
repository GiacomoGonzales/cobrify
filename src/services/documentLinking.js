/**
 * Cerrar el vínculo con el documento de origen, una vez emitido el destino.
 *
 * Cuando un comprobante nace de una cotización o de notas de venta, el
 * documento de origen tiene que enterarse: es lo que lo marca como consumido y
 * lo que evita convertirlo dos veces. Ese cierre estaba escrito dentro del POS,
 * en el bloque que corre DESPUÉS de emitir online — así que una venta hecha
 * sin conexión, que se sincroniza por otro camino, nunca lo ejecutaba: la
 * cotización quedaba para siempre en "pendiente" aunque ya estuviera cobrada.
 *
 * Acá el criterio vive una sola vez y se alimenta de `convertedFrom`, que ya
 * viaja dentro del propio comprobante. Los dos caminos leen el mismo dato.
 */
import { markQuotationAsConverted } from './quotationService'
import { markNotaVentaAsConverted } from './firestoreService'

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {object} p.convertedFrom  `{ type, id }` o `{ type, ids: [...] }`
 * @param {string} p.documentType   tipo del comprobante EMITIDO
 * @param {string} p.invoiceId      id del comprobante emitido
 * @param {string} p.invoiceNumber  número legible del comprobante emitido
 * @returns {Promise<{ok: boolean, marcados: number, error?: string}>}
 */
export async function cerrarVinculoDeOrigen({
  businessId,
  convertedFrom,
  documentType,
  invoiceId,
  invoiceNumber = '',
}) {
  if (!businessId || !convertedFrom || typeof convertedFrom !== 'object') {
    return { ok: true, marcados: 0 }
  }

  const ids = Array.isArray(convertedFrom.ids)
    ? convertedFrom.ids.filter(Boolean)
    : (convertedFrom.id ? [convertedFrom.id] : [])
  if (ids.length === 0) return { ok: true, marcados: 0 }

  try {
    if (convertedFrom.type === 'quotation') {
      await Promise.all(ids.map(id =>
        markQuotationAsConverted(businessId, id, invoiceId, documentType, invoiceNumber)
      ))
      return { ok: true, marcados: ids.length }
    }

    if (convertedFrom.type === 'nota_venta') {
      // Ojo: markNotaVentaAsConverted recibe el tipo ANTES que el id, al revés
      // que markQuotationAsConverted. Normalizarlo acá es media razón de ser
      // de esta función.
      await Promise.all(ids.map(id =>
        markNotaVentaAsConverted(businessId, id, documentType, invoiceId, invoiceNumber)
      ))
      return { ok: true, marcados: ids.length }
    }

    // dispatch_guide todavía no tiene back-link: la guía no guarda a qué
    // comprobante fue. Se ignora en silencio en vez de fallar.
    return { ok: true, marcados: 0 }
  } catch (error) {
    console.error('Error al cerrar el vínculo con el documento de origen:', error)
    return { ok: false, marcados: 0, error: error.message }
  }
}

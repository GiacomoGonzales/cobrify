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
import { markNotaVentaAsConverted, registrarParteDeNota, anularParteDeNota } from './firestoreService'

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {object} p.convertedFrom  `{ type, id }` o `{ type, ids: [...] }`; una nota trae
 *                                  además `cobradaEnNota` si su plata ya había entrado (la caja lo lee)
 * @param {string} p.documentType   tipo del comprobante EMITIDO
 * @param {string} p.invoiceId      id del comprobante emitido
 * @param {string} p.invoiceNumber  número legible del comprobante emitido
 * @param {number} [p.total]        total del comprobante emitido (lo anota una parte)
 * @returns {Promise<{ok: boolean, marcados: number, error?: string}>}
 */
export async function cerrarVinculoDeOrigen({
  businessId,
  convertedFrom,
  documentType,
  invoiceId,
  invoiceNumber = '',
  total = 0,
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

    // Una PARTE no cierra la nota: se anota en ella, con lo que facturó
    // (utils/notaPorPartes). La nota recién queda convertida con la última.
    if (convertedFrom.type === 'nota_venta' && convertedFrom.porPartes) {
      const r = await registrarParteDeNota(businessId, ids[0], {
        id: invoiceId,
        number: invoiceNumber,
        documentType,
        monto: Math.round((Number(total) || 0) * 100) / 100,
        lineas: Array.isArray(convertedFrom.lineas) ? convertedFrom.lineas : [],
        descuentoGeneral: Math.round((Number(convertedFrom.descuentoGeneral) || 0) * 100) / 100,
        parte: convertedFrom.parte || null,
      })
      if (!r.success) return { ok: false, marcados: 0, error: r.error }
      return { ok: true, marcados: 1 }
    }

    if (convertedFrom.type === 'nota_venta') {
      // Ojo: markNotaVentaAsConverted recibe el tipo ANTES que el id, al revés
      // que markQuotationAsConverted. Normalizarlo acá es media razón de ser
      // de esta función.
      await Promise.all(ids.map(id =>
        markNotaVentaAsConverted(businessId, id, documentType, invoiceId, invoiceNumber, {
          cobradaEnNota: convertedFrom.cobradaEnNota,
        })
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

/**
 * Lo inverso para una PARTE: al anular una factura o boleta que era parte de
 * una nota (baja SUNAT, anulación o nota de crédito total), la nota recupera su
 * monto y sus cantidades. Devuelve `{ esParte: false }` si el comprobante no
 * era una parte, para que quien llama siga con lo de siempre.
 *
 * @param {object} p
 * @param {string} p.businessId
 * @param {object} p.convertedFrom `convertedFrom` del comprobante anulado
 * @param {string} p.invoiceId     id del comprobante anulado
 */
export async function devolverParteALaNota({ businessId, convertedFrom, invoiceId }) {
  if (!businessId || convertedFrom?.type !== 'nota_venta' || !convertedFrom.porPartes || !convertedFrom.id) {
    return { esParte: false }
  }
  const r = await anularParteDeNota(businessId, convertedFrom.id, invoiceId)
  return { esParte: true, ok: r.success, error: r.error }
}

/**
 * DE QUE BAJA ESTAMOS HABLANDO.
 *
 * SUNAT tiene dos caminos para anular un comprobante y el sistema los guarda en
 * colecciones distintas:
 *
 *   - Facturas -> comunicacion de baja (RA), coleccion `voidedDocuments`,
 *     campo `voidedDocumentId`.
 *   - Boletas   -> resumen diario de baja (RC), coleccion `summaryDocuments`,
 *     campo `summaryDocumentId`.
 *
 * El sistema preguntaba "¿como va la baja?" mirando SOLO `voidedDocumentId`.
 * Una boleta nunca tiene ese campo, asi que la consulta jamas se hacia: la
 * pantalla se quedaba en "Anulando..." y el boton Reintentar, en vez de
 * consultar, mandaba OTRO resumen a SUNAT. Cinco boletas de ASOCIADOS MAVI
 * terminaron con dos resumenes cada una, y una de mayo estuvo cuatro meses
 * trabada estando ya anulada en SUNAT.
 *
 * De aca sale el criterio, una sola vez, para todas las pantallas.
 */

/**
 * La referencia de la baja de un comprobante (o de la respuesta del servidor).
 *
 * @param {Object} origen - Una venta guardada, o el resultado de `voidDocument`
 * @returns {{id: string|null, esResumen: boolean}} `id` null si no hay baja en curso
 */
export function referenciaDeBaja(origen) {
  const baja = origen?.voidedDocumentId || null
  const resumen = origen?.summaryDocumentId || null
  if (baja) return { id: baja, esResumen: false }
  if (resumen) return { id: resumen, esResumen: true }
  return { id: null, esResumen: false }
}

/** Los campos que espera `checkVoidStatus` para esa referencia. */
export function cuerpoDeConsulta(origen) {
  const { id, esResumen } = referenciaDeBaja(origen)
  if (!id) return null
  return esResumen ? { summaryDocumentId: id } : { voidedDocumentId: id }
}

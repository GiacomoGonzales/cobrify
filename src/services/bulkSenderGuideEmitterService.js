/**
 * EMISIÓN MASIVA — emisión del lote de GRE REMITENTE.
 *
 * El circuito (serie, ritmo, idempotencia por contenido, reintento desde la
 * pantalla) vive en `bulkGuideEmitterEngine`, compartido con GRE Transportista.
 * Acá solo queda lo propio de esta guía: su colección y sus funciones de
 * creación y envío.
 *
 * OJO — el lote NO descuenta stock. En la pantalla de GRE Remitente descontar
 * es una decisión por guía (con su almacén); hacerlo en serie sobre cientos sin
 * poder revisarlo sería el peor lugar para equivocarse, y devolver stock mal
 * descontado es de lo más caro de arreglar.
 */
import { createDispatchGuide, sendDispatchGuideToSunat } from './firestoreService'
import { emitirLoteDeGuias, huellaDeOperacion, huellaDelLote } from './bulkGuideEmitterEngine'

export { huellaDeOperacion, huellaDelLote }

/**
 * Emite el lote de guías de remitente, una por una.
 *
 * @param {string} businessId
 * @param {Array}  operaciones - SOLO las operaciones sin errores del parser
 * @param {object} opts
 * @param {string}   opts.loteKey    - huella del archivo (huellaDelLote)
 * @param {string}   [opts.branchId] - sucursal activa (numeración por sede)
 * @param {Function} [opts.onProgress]
 * @param {Function} [opts.debeCancelar]
 * @returns {Promise<{resultados: Array, resumen: object}>}
 */
export async function emitirLoteGreRemitente(businessId, operaciones, {
  loteKey,
  branchId = null,
  onProgress = null,
  debeCancelar = null,
} = {}) {
  return emitirLoteDeGuias(businessId, operaciones, {
    coleccion: 'dispatchGuides',
    prefijoClave: 'grer_',
    crearGuia: createDispatchGuide,
    enviarGuia: sendDispatchGuideToSunat,
    pantalla: 'GRE Remitente',
    loteKey,
    branchId,
    onProgress,
    debeCancelar,
  })
}

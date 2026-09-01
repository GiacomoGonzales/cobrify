/**
 * EMISIÓN MASIVA — emisión del lote de GRE TRANSPORTISTA.
 *
 * El circuito (serie, ritmo, idempotencia por contenido, reintento desde la
 * pantalla) vive en `bulkGuideEmitterEngine`, compartido con GRE Remitente.
 * Acá solo queda lo propio de esta guía: su colección, sus funciones de
 * creación y envío, y el registro MTC del negocio.
 */
import { createCarrierDispatchGuide, sendCarrierDispatchGuideToSunat } from './firestoreService'
import { emitirLoteDeGuias, huellaDeOperacion, huellaDelLote } from './bulkGuideEmitterEngine'

export { huellaDeOperacion, huellaDelLote }

/**
 * Emite el lote de guías transportista, una por una.
 *
 * @param {string} businessId
 * @param {Array}  operaciones - SOLO las operaciones sin errores del parser
 * @param {object} opts
 * @param {string}   opts.loteKey     - huella del archivo (huellaDelLote)
 * @param {string}   [opts.mtcRegistration] - registro MTC del negocio (de su configuración)
 * @param {string}   [opts.branchId]  - sucursal activa (numeración por sede)
 * @param {Function} [opts.onProgress]
 * @param {Function} [opts.debeCancelar]
 * @returns {Promise<{resultados: Array, resumen: object}>}
 */
export async function emitirLoteGreTransportista(businessId, operaciones, {
  loteKey,
  mtcRegistration = '',
  branchId = null,
  onProgress = null,
  debeCancelar = null,
} = {}) {
  return emitirLoteDeGuias(businessId, operaciones, {
    coleccion: 'carrierDispatchGuides',
    prefijoClave: 'gret_',
    crearGuia: createCarrierDispatchGuide,
    enviarGuia: sendCarrierDispatchGuideToSunat,
    pantalla: 'GRE Transportista',
    extras: { mtcRegistration },
    loteKey,
    branchId,
    onProgress,
    debeCancelar,
  })
}

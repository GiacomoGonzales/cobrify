/**
 * Con qué estado nace un comprobante respecto de SUNAT.
 *
 * Criterio único para el POS, las notas de crédito y débito, el folio de hotel
 * y la conversión de una nota de venta.
 *
 * Los tres estados y qué significan:
 *   'not_applicable' — no es un documento que viaje a SUNAT (nota de venta).
 *   'pending'        — hay que mandarlo y el cron `retryPendingInvoices` lo va
 *                      a reintentar solo, cada 30 minutos, hasta 50 veces.
 *   'not_sent'       — no se manda. Los crones lo ignoran a propósito y se
 *                      puede enviar a mano desde Comprobantes.
 *
 * ---
 *
 * Antes solo se miraba `autoSendToSunat`. Faltaba la otra mitad: **si el
 * negocio ni siquiera tiene un método de emisión configurado, el comprobante
 * nacía 'pending' igual** y se quedaba ahí para siempre, porque no hay a dónde
 * mandarlo. Al 7-set-2026 eran 1.238 comprobantes en 'pending', y 1.179 no
 * tenían registrado ni un intento: el cron nunca pudo hacer nada con ellos.
 * PLASTIHOGAR tenía 801, Picoli 186, DIMARC 52 — todos sin credenciales.
 *
 * Un negocio sin emisión electrónica puede emitir igual (el permiso
 * `allowInvoicingWithoutSunat`), y está bien: lo que no está bien es que sus
 * comprobantes digan "Pendiente" o "Enviando..." toda la vida. Su estado real
 * es "No enviado", y eso es lo que ahora dicen.
 */

/** Los que viajan a SUNAT. Las notas de venta son internas y no se declaran. */
const TIPOS_ELECTRONICOS = ['factura', 'boleta', 'nota_credito', 'nota_debito']

/**
 * ¿Este negocio tiene una vía para emitir electrónicamente?
 *
 * Se mira el método, que es lo único que el navegador conoce: las credenciales
 * viven en `secrets/emission` y solo las lee el servidor. Un método en 'none' o
 * ausente es el caso de los negocios que emiten sin conexión a SUNAT.
 */
export function emiteElectronicamente(negocio) {
  const metodo = negocio?.emissionMethod || negocio?.emissionConfig?.method
  return metodo === 'qpse' || metodo === 'sunat_direct'
}

/**
 * @param {object} opciones
 * @param {string} opciones.documentType  'factura' | 'boleta' | 'nota_credito' | 'nota_debito' | 'nota_venta'
 * @param {boolean} opciones.autoSend     `autoSendToSunat` del negocio, leído fresco
 * @param {object} opciones.negocio       el doc del negocio (companySettings)
 */
export function estadoInicialSunat({ documentType, autoSend, negocio }) {
  if (!TIPOS_ELECTRONICOS.includes(documentType)) return 'not_applicable'
  if (!emiteElectronicamente(negocio)) return 'not_sent'
  return autoSend === true ? 'pending' : 'not_sent'
}

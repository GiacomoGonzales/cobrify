/**
 * Criterios de bajas y notas de crédito que decide el servidor.
 *
 * Nacen el 18/09/2026 por VIGUZZA (FP08-00000155): la baja RA-20260905-1 se
 * guardó como fallida con `env:Server` cuando SUNAT la había ACEPTADO, el botón
 * mandó 15 bajas más de la misma factura, y la nota de crédito que emitieron
 * después rebotó con 2120 sin que nadie sincronizara la factura.
 *
 * Sin imports a propósito: se prueba en Node tal cual.
 */

/** El código sin ceros a la izquierda. Mismo criterio que `codigoSunat` de index.js. */
function normalizar(codigo) {
  const s = String(codigo ?? '').trim()
  return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase()
}

/**
 * ¿La comunicación de baja salió sin que SUNAT contestara?
 *
 * `env:Server` ("Internal Error (from server)") NO significa que no llegó: la
 * RA-20260905-1 de VIGUZZA se guardó así y SUNAT la tenía ACEPTADA (CDR con
 * ResponseCode 0). Se perdió la respuesta, no el envío. Darla por fallida
 * devolvía la factura a `accepted` sin el puntero a la baja, y cada reintento
 * mandaba otra.
 *
 * Con esta respuesta la baja queda EN CURSO y se consulta después.
 *
 * @param {{responseCode?: string, description?: string, notes?: string}} resultado - de `voidInvoiceViaQPse`
 * @returns {boolean}
 */
export function bajaSinRespuesta(resultado) {
  const codigo = String(resultado?.responseCode || '').trim().toLowerCase()
  const texto = `${resultado?.description || ''} ${resultado?.notes || ''}`.toLowerCase()
  return codigo === 'env:server' || texto.includes('internal error (from server)')
}

/**
 * ¿SUNAT rechazó la nota porque el comprobante que modifica YA está de baja?
 *
 * Es el 2120. Llega también envuelto en un 1032 cuando la misma nota se
 * reenvía: "El comprobante FN08-00000002 fue rechazado con codigo de error:
 * 2120". Es SUNAT diciendo, sobre su propio registro, que el comprobante está
 * anulado: se le puede creer.
 *
 * Gemelo de la clase 'baja' de src/utils/notaRechazada.js (los bundles no se
 * comparten): si cambia uno, cambia el otro.
 *
 * @param {string} codigo
 * @param {string} mensaje
 * @returns {boolean}
 */
export function esRechazoPorComprobanteDeBaja(codigo, mensaje) {
  const c = normalizar(codigo)
  const m = String(mensaje || '').toLowerCase()
  if (c === '2120') return true
  if (m.includes('se encuentra de baja')) return true
  return c === '1032' && /codigo de error:\s*2120\b/.test(m)
}

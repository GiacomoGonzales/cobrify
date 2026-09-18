/**
 * QUÉ HACER CON UNA NOTA DE CRÉDITO QUE SUNAT RECHAZÓ.
 *
 * Nace el 18/09/2026 por VIGUZZA (FN08-00000002): la factura se quedó para
 * siempre en "Anulación en proceso" con una nota que SUNAT había rechazado, y
 * nada en pantalla decía que la nota estaba muerta ni qué hacer con ella.
 *
 * Medido ese día: 101 notas rechazadas en 43 negocios. 62 son de PLAZO (2108 y
 * 1079): la nota ya no se puede enviar y la venta sigue vigente en SUNAT.
 *
 * Solo clasifica: no decide nada sobre el stock. La nota devuelve el stock al
 * crearse, a propósito (la reemisión con el mismo número no lo vuelve a tocar,
 * ver CreateCreditNote), y si la mercadería volvió de verdad ese stock está
 * bien aunque SUNAT rechace la nota. Eso lo sabe el negocio, no el sistema.
 *
 * Sin imports a propósito: se prueba en Node tal cual. El criterio del 2120
 * tiene un gemelo en functions/src/utils/bajasYNotas.js (los bundles no se
 * comparten): si cambia uno, cambia el otro.
 */

// "Presentación fuera de fecha" y "solo puede enviarse en un resumen diario".
const CODIGOS_DE_PLAZO = ['2108', '1079']

// La nota no llegó a que SUNAT la revisara: falló la firma, la autenticación
// del proveedor o el servicio. No es un rechazo de SUNAT.
const CODIGOS_SIN_RESPUESTA = ['ERROR', 'UNKNOWN', '109', '111']
const TEXTOS_SIN_RESPUESTA = ['error al firmar', 'unauthenticated', 'no se recibió respuesta', 'sin descripción']

/** El código sin ceros a la izquierda: '0098' y '98' son el MISMO código. */
function normalizar(codigo) {
  const s = String(codigo ?? '').trim()
  return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase()
}

/**
 * El código que de verdad explica el rechazo. Un 1032 ("ya está informado y se
 * encuentra con estado anulado o rechazado") es SUNAT repitiendo un rechazo
 * anterior al reenviar la misma nota, y el motivo real viene adentro:
 * "El comprobante FN08-00000002 fue rechazado con codigo de error: 2120".
 *
 * @param {{code?: string, description?: string}} respuesta - `sunatResponse` de la nota
 * @returns {string}
 */
export function codigoDeFondo(respuesta) {
  const codigo = normalizar(respuesta?.code)
  if (codigo !== '1032') return codigo
  const m = String(respuesta?.description || '').match(/codigo de error:\s*(\d+)/i)
  return m ? normalizar(m[1]) : codigo
}

/**
 * Qué le pasó a la nota y qué puede hacer el negocio, en palabras de pantalla.
 *
 * Clases:
 * - `baja`: el comprobante ya estaba dado de baja (2120). La nota no hacía falta.
 * - `plazo`: se venció el plazo para enviarla (2108, 1079). La venta sigue vigente.
 * - `sin_respuesta`: nunca llegó a que SUNAT la revisara. Se puede reenviar.
 * - `quemada`: SUNAT ya la registró rechazada y no acepta el mismo número (1032).
 * - `corregible`: SUNAT rechazó el contenido; se corrige y se reenvía.
 *
 * @param {{code?: string, description?: string}} respuesta - `sunatResponse` de la nota
 * @returns {{clase: string, titulo: string, texto: string} | null}
 */
export function clasificarRechazoDeNota(respuesta) {
  if (!respuesta) return null
  const codigo = normalizar(respuesta.code)
  const fondo = codigoDeFondo(respuesta)
  const texto = String(respuesta.description || '').toLowerCase()

  if (fondo === '2120' || texto.includes('se encuentra de baja')) {
    return {
      clase: 'baja',
      titulo: 'El comprobante ya está anulado en SUNAT',
      texto: 'SUNAT rechazó la nota porque el comprobante ya estaba dado de baja: la nota no hacía falta. No la reenvíe ni la elimine; eliminarla deshace lo que devolvió al stock.',
    }
  }

  if (CODIGOS_DE_PLAZO.includes(fondo) || texto.includes('fuera de fecha')) {
    return {
      clase: 'plazo',
      titulo: 'Nota fuera de plazo',
      texto: 'SUNAT ya no acepta esta nota: se venció el plazo para enviarla. La venta sigue vigente en SUNAT.',
    }
  }

  if (CODIGOS_SIN_RESPUESTA.includes(codigo) || TEXTOS_SIN_RESPUESTA.some((t) => texto.includes(t))) {
    return {
      clase: 'sin_respuesta',
      titulo: 'La nota no llegó a SUNAT',
      texto: 'El envío falló antes de que SUNAT la revisara. Puede volver a enviarla.',
    }
  }

  if (codigo === '1032') {
    return {
      clase: 'quemada',
      titulo: 'SUNAT ya registró esta nota como rechazada',
      texto: 'No acepta volver a enviarla con el mismo número. Si todavía corresponde, emita una nota nueva.',
    }
  }

  return {
    clase: 'corregible',
    titulo: 'SUNAT rechazó la nota',
    texto: 'Corríjala y vuelva a enviarla. Mientras tanto, la venta sigue vigente en SUNAT.',
  }
}

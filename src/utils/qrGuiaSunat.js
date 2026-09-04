/**
 * EL QR DE LA GUÍA DE REMISIÓN.
 *
 * En la guía de remisión el QR no lleva datos: lleva una URL de SUNAT que abre
 * la guía en el sitio de SUNAT. Es lo que le permite al fedatario verificarla
 * en el momento, y SUNAT acepta que se exhiba el QR como sustento del traslado.
 *
 * ── De dónde sale ───────────────────────────────────────────────────────────
 * De SUNAT, y no hay forma de calcularla: el `hashqr` es texto cifrado con su
 * llave (80 bytes exactos, del mismo largo para cualquier contribuyente).
 *
 * Viene DENTRO del CDR de la guía, en la etiqueta:
 *
 *     cac:DocumentResponse / cac:DocumentReference / cbc:DocumentDescription
 *
 * Confirmado por SUNAT (ChatWeb, 04-sep-2026): "Debe acceder al enlace del CDR,
 * es decir la etiqueta <cbc:DocumentDescription>, y ahí ya obtendrá el Código QR
 * (ya elaborado por SUNAT) y la información de la GRE".
 *
 * Como el CDR ya se guarda en la guía (`cdrData`), la URL se saca de ahí y
 * funciona hacia atrás, sin pedirle nada nuevo a SUNAT.
 *
 * ── Por qué esto NO aplica a facturas ni boletas ────────────────────────────
 * Ahí el estándar de SUNAT es el QR de tuberías
 * (`RUC|tipo|serie|numero|IGV|total|fecha|tipoDocAdq|numDocAdq`), que ya se
 * imprime bien. La URL es un mecanismo propio de la guía: hasta la ruta del
 * endpoint lo dice, `/v1/contribuyente/gre/comprobantes/descargaqr`.
 */

/**
 * La URL del QR, tal como la escribe SUNAT.
 *
 * El hash es base64 y trae `/`, `+` y `=`, así que se acepta todo menos lo que
 * cierra un atributo XML o un texto.
 */
const URL_EN_TEXTO = /https:\/\/[\w.-]*sunat\.gob\.pe\/[^\s<>"']*descargaqr\?hashqr=[^\s<>"']+/i

/** El contenido de `<cbc:DocumentDescription>`, con o sin CDATA. */
const ETIQUETA = /<cbc:DocumentDescription>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/cbc:DocumentDescription>/i

const desescapar = (texto) => String(texto || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .trim()

/**
 * Saca la URL del QR de un CDR.
 *
 * Se busca primero en la etiqueta que SUNAT indicó, y solo si no aparece se
 * barre el texto entero: si algún día cambian el envoltorio, el QR sigue
 * saliendo en vez de desaparecer sin aviso.
 *
 * @param {string} cdr El XML del CDR (ApplicationResponse).
 * @returns {string|null}
 */
export function urlQrDelCdr(cdr) {
  if (!cdr || typeof cdr !== 'string') return null

  const enEtiqueta = cdr.match(ETIQUETA)
  if (enEtiqueta) {
    const valor = desescapar(enEtiqueta[1])
    const url = valor.match(URL_EN_TEXTO)
    if (url) return url[0]
  }

  const suelta = desescapar(cdr).match(URL_EN_TEXTO)
  return suelta ? suelta[0] : null
}

/**
 * La URL del QR de una guía, mirando dónde puede estar.
 *
 * `sunatQrUrl` primero por si algún día se guarda ya extraída; hoy sale del
 * CDR, que es lo que hay en las guías ya emitidas.
 *
 * @param {object} guia El documento de la guía.
 * @returns {string|null} La URL, o null si esa guía no la tiene (guías viejas
 *   sin CDR guardado, rechazadas, o todavía sin enviar).
 */
export function urlQrDeLaGuia(guia) {
  if (!guia) return null
  const guardada = typeof guia.sunatQrUrl === 'string' ? guia.sunatQrUrl.trim() : ''
  if (guardada && URL_EN_TEXTO.test(guardada)) return guardada
  return urlQrDelCdr(guia.cdrData)
}

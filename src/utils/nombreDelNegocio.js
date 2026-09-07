/**
 * Qué nombre encabeza un comprobante, y cuándo hace falta además la razón social.
 *
 * Son dos datos distintos y conviene no mezclarlos:
 *   - **Razón social** (`businessName`): el nombre legal, el que está en SUNAT.
 *     Es obligatorio.
 *   - **Nombre comercial** (`tradeName`): con el que la gente conoce al negocio.
 *     Es opcional — hay empresas que no tienen uno.
 *
 * ---
 *
 * EL DEFECTO QUE ESTO ARREGLA
 *
 * La pantalla de Mi Empresa guardaba `name: tradeName || businessName` y volvía
 * a leer el campo desde `name`. O sea: quien dejaba vacío el nombre comercial
 * recibía la razón social copiada dentro, y al recargar la pantalla la veía ahí.
 * **Nunca se podía dejar vacío.**
 *
 * Y en el ticket salía DOS VECES: arriba como nombre (porque `name` tenía la
 * razón social) y otra vez debajo, porque la condición para repetirla comparaba
 * contra `tradeName` —que nadie guardaba y por lo tanto siempre estaba vacío—
 * en lugar de comparar contra el nombre que se acababa de imprimir.
 */

const limpio = (v) => String(v ?? '').trim()

/**
 * El nombre que encabeza el comprobante.
 *
 * La sucursal manda sobre el negocio: un ticket emitido en una sede lleva el
 * nombre de esa sede.
 */
export function nombreParaMostrar(business, invoice = null) {
  return limpio(invoice?.branchTradeName)
    || limpio(invoice?.branchName)
    || limpio(business?.tradeName)
    || limpio(business?.name)
    || limpio(business?.businessName)
    || 'MI EMPRESA'
}

/**
 * La razón social, solo si aporta algo: si ya es lo que se imprimió arriba, no
 * se repite. La comparación ignora mayúsculas y espacios de sobra, porque
 * "Mi Empresa SAC" y "MI EMPRESA SAC" son el mismo nombre para quien lee.
 *
 * @returns {string|null} el texto a imprimir, o null si no hace falta
 */
export function razonSocialSiAporta(business, nombreMostrado) {
  const razon = limpio(business?.businessName)
  if (!razon) return null
  const normal = (v) => limpio(v).toUpperCase().replace(/\s+/g, ' ')
  return normal(razon) === normal(nombreMostrado) ? null : razon
}

/**
 * Lo que va en el campo "Nombre comercial" al abrir Mi Empresa.
 *
 * Si el negocio no tiene `tradeName` propio, se mira `name`: en las cuentas
 * viejas ahí quedó el nombre comercial de verdad... salvo cuando es igual a la
 * razón social, que es la marca de que se copió sola. En ese caso el campo va
 * vacío, que es la verdad.
 */
export function nombreComercialParaEditar(business) {
  const propio = limpio(business?.tradeName)
  if (propio) return propio
  const nombre = limpio(business?.name)
  const razon = limpio(business?.businessName)
  if (!nombre) return ''
  const normal = (v) => v.toUpperCase().replace(/\s+/g, ' ')
  return normal(nombre) === normal(razon) ? '' : nombre
}

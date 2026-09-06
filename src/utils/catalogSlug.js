/**
 * El nombre corto del catálogo: lo que va después de /catalogo/ o /menu/.
 *
 * Existe porque el campo aceptaba cualquier cosa y la mutilaba en silencio.
 * Casos REALES encontrados en producción el 5-set-2026:
 *   - dos negocios distintos guardaron `cobrifyperucomcatalogo` (pegaron la URL
 *     de la barra del navegador). Como la búsqueda toma el primero que
 *     encuentra, uno veía el catálogo del otro.
 *   - `httpswwwcobrifyperucomappconfiguraciontabcatalogo`
 *   - `httpswamec51904058005` (pegaron un enlace de WhatsApp)
 *   - uno de 500 caracteres: el texto entero de la pantalla de configuración,
 *     instructivo incluido.
 *
 * La idea es sencilla: si lo que pegaron parece una dirección, quedarse con el
 * último tramo, que es justamente el nombre; y si no, limpiar lo que se pueda.
 */

export const LARGO_MAXIMO = 40
export const LARGO_MINIMO = 3

/** Los que no se pueden usar porque chocan con rutas o con la marca. */
export const NOMBRES_RESERVADOS = [
  'catalogo', 'menu', 'app', 'admin', 'api', 'login', 'registro', 'cobrify',
  'cobrifyperu', 'www', 'null', 'undefined',
]

/**
 * Deja el texto en un nombre usable.
 *
 * Si trae `/`, se queda con el último tramo que valga algo: pegar
 * "cobrifyperu.com/catalogo/mi-tienda" da "mi-tienda", no "cobrifyperucomcatalogomitienda".
 * Después quita acentos, pasa a minúsculas, cambia los espacios por guiones y
 * descarta lo demás.
 */
export function limpiarSlug(valor, { escribiendo = false } = {}) {
  let s = String(valor ?? '').trim()
  if (!s) return ''

  // Fuera el protocolo y lo que venga después de ? o #
  s = s.replace(/^[a-z]+:\/\//i, '').split('?')[0].split('#')[0]

  // ¿Es una dirección? Quedarse con el último tramo que no sea de relleno.
  if (s.includes('/')) {
    const tramos = s.split('/').map(t => t.trim()).filter(Boolean)
    const utiles = tramos.filter(t => !NOMBRES_RESERVADOS.includes(t.toLowerCase()) && !t.includes('.'))
    s = utiles.length > 0 ? utiles[utiles.length - 1] : (tramos[tramos.length - 1] || '')
  }

  const base = s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // á → a
    .toLowerCase()
    .replace(/[\s_]+/g, '-')                            // espacios y _ → guion
    .replace(/[^a-z0-9-]/g, '')                         // lo demás fuera
    .replace(/-+/g, '-')                                // ---- → -
    .replace(/^-+/, '')                                 // nunca empieza con guion
    .slice(0, LARGO_MAXIMO)

  // Mientras el usuario ESCRIBE hay que dejarle el guion del final: si se lo
  // quitamos en cada tecla, "mi-tienda" es imposible de escribir — al teclear
  // el guion desaparece. Se limpia al guardar, que es cuando importa.
  return escribiendo ? base : base.replace(/-+$/, '')
}

/**
 * Por qué NO sirve este nombre, o null si está bien.
 * El mensaje va tal cual a la pantalla, así que se escribe para el usuario.
 */
export function problemaDelSlug(slug) {
  const s = String(slug || '')
  if (!s) return 'Escribe un nombre para tu enlace.'
  if (s.length < LARGO_MINIMO) return `El nombre es muy corto: usa al menos ${LARGO_MINIMO} letras.`
  if (s.length > LARGO_MAXIMO) return `El nombre es muy largo: máximo ${LARGO_MAXIMO} caracteres.`
  if (!/^[a-z0-9-]+$/.test(s)) return 'Solo letras minúsculas, números y guiones.'
  if (/^-|-$/.test(s)) return 'No puede empezar ni terminar con guion.'
  if (NOMBRES_RESERVADOS.includes(s)) return `"${s}" está reservado. Elige otro nombre.`
  return null
}

/** Un nombre sugerido a partir del nombre del negocio, para el que no tiene ninguno. */
export function sugerirSlug(nombreNegocio) {
  const s = limpiarSlug(nombreNegocio)
  return problemaDelSlug(s) ? '' : s
}

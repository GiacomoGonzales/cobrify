/**
 * QUÉ CÓDIGO LLEVA LA ETIQUETA DE CADA VARIANTE.
 *
 * Un código de barras solo sirve si es ÚNICO. Si dos variantes de la misma
 * prenda salen con el mismo, el escáner no puede distinguirlas: se descuenta
 * stock de la talla equivocada y las etiquetas parecen todas iguales.
 *
 * Y "parecen todas iguales" fue exactamente el reporte (10-set-2026): un
 * usuario con varias variantes decía que "siempre imprime la primera variante".
 * No imprimía una sola: imprimía todas, pero con el mismo código en todas,
 * porque sus variantes compartían SKU —pasa seguido, se cargan heredando el
 * del producto o el Excel de importación traía la misma columna— y a la
 * variante sin código de barras se le ponía su SKU tal cual.
 *
 * Este archivo decide, para un producto, qué le toca a cada variante:
 *   - ya tiene `barcode` propio            → no se toca
 *   - tiene un `sku` que nadie más usa     → ese sku pasa a ser su código
 *   - no tiene sku, o lo comparte con otra → se le genera un correlativo
 */

const sinGuiones = (s) => String(s).replace(/-/g, '')

/**
 * @param {Array} variantes           las variantes del producto
 * @param {(v: object, i: number) => number} cantidadDe  cuántas etiquetas lleva
 *        cada una; las que van en 0 no se imprimen y no reservan código.
 * @returns {Array<{indice: number, valor: string|null}>} lo que falta resolver.
 *          `valor` null = hay que generarle un correlativo.
 */
export function codigosQueFaltan(variantes = [], cantidadDe = () => 1) {
  const faltantes = []
  // Los códigos ya comprometidos: los que existen y los que se van repartiendo.
  const vistos = new Set()

  ;(variantes || []).forEach((v, i) => {
    if (cantidadDe(v, i) <= 0) return
    if (v?.barcode) { vistos.add(sinGuiones(v.barcode)); return }

    const propio = v?.sku ? sinGuiones(v.sku) : null
    const repetido = propio !== null && vistos.has(propio)
    if (propio !== null && !repetido) vistos.add(propio)
    faltantes.push({ indice: i, valor: repetido ? null : propio })
  })

  return faltantes
}

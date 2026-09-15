/**
 * Listas grandes sin trabar el celular.
 *
 * Nace el 15/09/2026 por DHANY MEGAFIESTA (4,460 productos): en Productos y en
 * Nueva compra las letras aparecían tarde al buscar en su Android.
 *
 * - Productos reordenaba TODAS las coincidencias en cada búsqueda: con la
 *   primera letra eran miles y el orden bloqueaba la pantalla.
 *   `ordenarPorClave` se usa para ordenar una vez, cuando cambian los productos
 *   o el criterio, y la búsqueda solo filtra la lista ya ordenada.
 * - Nueva compra dibujaba todas las coincidencias en el desplegable, dos veces.
 *   `primerasCoincidencias` corta en un tope y cuenta el total.
 *
 * Sin imports a propósito: se prueba en Node tal cual.
 */

// Una sola instancia: `localeCompare(b, 'es', {...})` arma el comparador en
// cada llamada y con miles de productos se nota. Compara igual.
const ORDEN_ES = new Intl.Collator('es', { sensitivity: 'base' })

/** Cuántas sugerencias muestra un desplegable de búsqueda. El POS dibuja 60. */
export const TOPE_DE_SUGERENCIAS = 60

/**
 * Ordena `items` por `claveDe(item)`, que devuelve texto o número. La clave se
 * calcula UNA vez por ítem y no en cada comparación. Los textos se comparan
 * como `localeCompare(b, 'es', { sensitivity: 'base' })` y lo demás restando,
 * igual que el orden de siempre de Productos; 'asc' sube y cualquier otra
 * dirección baja. Es estable: los empates quedan como venían, así que filtrar
 * la lista ordenada da el mismo orden que filtrar primero y ordenar después.
 */
export function ordenarPorClave(items, claveDe, direccion = 'asc') {
  const signo = direccion === 'asc' ? 1 : -1
  return items
    .map((item) => ({ item, clave: claveDe(item) }))
    .sort((a, b) => {
      const comparacion = typeof a.clave === 'string'
        ? ORDEN_ES.compare(a.clave, b.clave)
        : a.clave - b.clave
      return signo * comparacion
    })
    .map((par) => par.item)
}

/**
 * Las primeras `tope` coincidencias de `lista`, en su orden, y cuántas hay en
 * total. Para desplegables de búsqueda: dibujar miles de filas por tecla traba
 * el celular y nadie elige de una lista así; con el total se avisa que conviene
 * escribir más.
 */
export function primerasCoincidencias(lista, coincide, tope = TOPE_DE_SUGERENCIAS) {
  const items = []
  let total = 0
  for (const item of lista) {
    if (!coincide(item)) continue
    total++
    if (items.length < tope) items.push(item)
  }
  return { items, total }
}

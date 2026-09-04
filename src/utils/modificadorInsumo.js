/**
 * EL INSUMO QUE CONSUME UN MODIFICADOR.
 *
 * Una opción de modificador puede estar enlazada a un insumo: "Pieza extra de
 * pollo" descuenta una pieza del inventario de insumos, igual que si estuviera
 * en la receta del plato. Es opcional y por opción: "Sin cebolla" o "¿Para
 * llevar?" no enlazan nada y no tocan el stock.
 *
 * ── Por qué el enlace se CONGELA en la venta ────────────────────────────────
 * Al elegir la opción se copia el enlace dentro del comprobante, igual que se
 * copia el `priceAdjustment`. Al anular no se vuelve a mirar la definición del
 * producto: se devuelve lo que el comprobante dice que se descontó.
 *
 * Si se resolviera contra la definición actual, editar el modificador entre la
 * venta y la anulación devolvería una cantidad distinta de la que se sacó, y el
 * inventario quedaría descuadrado sin que nadie lo note. Esa asimetría es
 * exactamente la que ya costó caro con las guías y con los lotes de compras.
 *
 * ── Un solo lugar calcula ───────────────────────────────────────────────────
 * `consumoDeModificadores()` la usan el POS para descontar y Ventas para
 * devolver al anular. Mientras las dos llamen a la misma función con la misma
 * línea del comprobante, sacan el mismo número por construcción.
 */

/** Los campos del enlace, tal como viajan en la opción. */
const CAMPOS = ['ingredientId', 'ingredientName', 'ingredientType', 'ingredientQuantity', 'ingredientUnit']

/**
 * El enlace de una opción, listo para copiar dentro de la venta.
 * Devuelve `null` cuando la opción no enlaza nada, que es el caso normal.
 */
export const enlaceDeLaOpcion = (opcion) => {
  if (!opcion?.ingredientId) return null
  const cantidad = Number(opcion.ingredientQuantity)
  // Sin cantidad no hay nada que descontar. Se toma como 1 y no como 0: quien
  // se tomó el trabajo de elegir el insumo quiso descontar algo, y un 0 mudo
  // haría que el enlace exista en la pantalla y no haga nada al vender.
  return {
    ingredientId: opcion.ingredientId,
    ingredientName: opcion.ingredientName || '',
    ingredientType: opcion.ingredientType === 'product' ? 'product' : 'ingredient',
    ingredientQuantity: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
    ingredientUnit: opcion.ingredientUnit || '',
  }
}

/** Copia el enlace sobre un objeto, o no escribe nada si no hay enlace. */
export const conElEnlace = (destino, opcion) => {
  const enlace = enlaceDeLaOpcion(opcion)
  return enlace ? { ...destino, ...enlace } : destino
}

/** Quita los campos del enlace. Sirve para comparar dos opciones sin él. */
export const sinElEnlace = (opcion) => {
  const copia = { ...(opcion || {}) }
  for (const campo of CAMPOS) delete copia[campo]
  return copia
}

/**
 * Los insumos que consume UNA línea del comprobante por sus modificadores.
 *
 * @param {object} linea Un `items[]` del comprobante, con sus `modifiers` tal
 *   como quedaron guardados.
 * @returns {Array} Filas con la forma que espera `deductIngredients` /
 *   `restoreIngredients`: `{ ingredientId, ingredientName, ingredientType,
 *   quantity, unit }`. Vacío si ninguna opción enlaza insumo.
 */
export function consumoDeModificadores(linea) {
  const filas = []
  // El factor de presentación se multiplica igual que en la receta: vender una
  // "caja de 6" consume seis veces. Si no se hiciera acá también, el modificador
  // quedaría subdescontado respecto del plato al que acompaña.
  const veces = (Number(linea?.quantity) || 0) * (Number(linea?.presentationFactor) || 1)
  if (veces <= 0) return filas

  for (const grupo of linea?.modifiers || []) {
    for (const opcion of grupo?.options || []) {
      const enlace = enlaceDeLaOpcion(opcion)
      if (!enlace) continue
      // `quantity` solo viene en los modificadores que permiten repetir; en el
      // resto la opción se eligió una vez.
      const repeticiones = Number(opcion.quantity)
      const cuantas = Number.isFinite(repeticiones) && repeticiones > 0 ? repeticiones : 1
      filas.push({
        ingredientId: enlace.ingredientId,
        ingredientName: enlace.ingredientName,
        ingredientType: enlace.ingredientType,
        quantity: enlace.ingredientQuantity * cuantas * veces,
        unit: enlace.ingredientUnit,
      })
    }
  }
  return filas
}

/**
 * Lo mismo para varias líneas, sumando lo que se repite.
 *
 * Se agrupa por insumo Y unidad, igual que hace el POS con las recetas: un
 * mismo insumo pedido en dos platos se lee y se escribe una sola vez, sin que
 * dos escrituras compitan por el mismo documento.
 */
export function consumoDeModificadoresDeVarias(lineas) {
  const porInsumo = new Map()
  for (const linea of lineas || []) {
    for (const fila of consumoDeModificadores(linea)) {
      const clave = `${fila.ingredientId}|${fila.unit || ''}`
      const previa = porInsumo.get(clave)
      if (previa) previa.quantity += fila.quantity
      else porInsumo.set(clave, { ...fila })
    }
  }
  return [...porInsumo.values()]
}

/**
 * Encontrar un lote cuando el MISMO número de lote existe varias veces.
 *
 * Un producto puede tener dos entradas con el mismo número de lote: la vieja
 * (compra anterior, ya agotada y sin almacén declarado, porque antes no se
 * guardaba) y la nueva (compra de hoy, con su almacén y su stock). Buscar por
 * número de lote a secas devuelve la PRIMERA, que suele ser la vieja en cero.
 *
 * Eso hacía que Inventario se contradijera solo: la tarjeta del lote mostraba
 * 1500 disponibles y abajo decía "Stock disponible: 0", y la transferencia se
 * bloqueaba con "Stock insuficiente". Peor todavía, la transacción descontaba
 * del lote equivocado.
 *
 * Las cantidades vienen a veces como texto ("1500"), así que todo pasa por
 * `cantidadDeLote`: sumar sin convertir concatena en vez de sumar.
 */

/** El identificador visible de un lote, sea cual sea el campo donde vive. */
export const idDeLote = (lote) => lote?.lotNumber || lote?.batchNumber || lote?.id

/** La cantidad de un lote, siempre como número. */
export const cantidadDeLote = (lote) => Number(lote?.quantity) || 0

/**
 * ¿Este lote vive en este almacén?
 *
 * Un lote sin `warehouseId` es de antes de que se guardara el almacén: cuenta
 * para cualquiera, que es como se venía tratando.
 */
export const loteEsDelAlmacen = (lote, warehouseId) =>
  !lote?.warehouseId || lote.warehouseId === warehouseId

/** Los lotes CON STOCK que se pueden mover desde este almacén. */
export const lotesDelAlmacen = (lotes, warehouseId) =>
  (lotes || []).filter((l) => cantidadDeLote(l) > 0 && loteEsDelAlmacen(l, warehouseId))

/** La suma de un grupo de lotes. */
export const sumarLotes = (lotes) =>
  (lotes || []).reduce((total, l) => total + cantidadDeLote(l), 0)

/**
 * El lote a usar para mover stock desde un almacén.
 *
 * Entre varios con el mismo número gana el que TIENE stock; a igualdad, el que
 * declara explícitamente el almacén por sobre el heredado sin almacén.
 *
 * @returns el lote, o null si ninguno corresponde a ese almacén.
 */
export function buscarLoteEnAlmacen(lotes, loteId, warehouseId) {
  const candidatos = (lotes || []).filter(
    (l) => idDeLote(l) === loteId && loteEsDelAlmacen(l, warehouseId)
  )
  if (candidatos.length === 0) return null

  const puntaje = (l) =>
    (cantidadDeLote(l) > 0 ? 2 : 0) + (l.warehouseId === warehouseId ? 1 : 0)

  return candidatos.reduce((mejor, l) => (puntaje(l) > puntaje(mejor) ? l : mejor), candidatos[0])
}

/**
 * ¿ESTE ITEM LLEVA CONTROL DE STOCK?
 *
 * Un plato de restaurante, un servicio o una consulta no tienen existencias:
 * se marcan con `trackStock: false` y el sistema no les descuenta nada al
 * vender.
 *
 * El criterio vive acá porque el listado de Inventario y el recuento físico lo
 * resolvían por su cuenta y no coincidían: el listado filtraba por
 * `trackStock`, el recuento solo miraba que `stock` no fuera null —y un plato
 * tiene `stock: 0`, que no es null—, así que el recuento pedía contar platos.
 * Reporte de Mandil Taquería (31-ago-2026): Inventario mostraba 12 items y el
 * recuento pedía 26.
 */

/** Los productos viejos no traen el campo; se asume que sí llevan stock. */
export const llevaStock = (item) => item?.trackStock !== false

/**
 * ¿Entra a un recuento físico de este almacén?
 *
 * Lo que no lleva stock queda afuera: contarlo generaría un ajuste sobre algo
 * que el sistema no descuenta. La excepción son las EXISTENCIAS REALES: si a
 * un producto le apagaron el control de stock cuando ya tenía mercadería
 * cargada, esconderla del recuento es peor que la fila de más — el operario no
 * podría cuadrar lo que sí está en el estante.
 *
 * @param {object} item             producto o insumo
 * @param {number} stockEnAlmacen   sus existencias en el almacén del recuento
 */
export const entraAlRecuento = (item, stockEnAlmacen = 0) => {
  if (item?.isIngredient) return true      // los insumos siempre llevan stock
  if (llevaStock(item)) return true
  return (Number(stockEnAlmacen) || 0) > 0
}

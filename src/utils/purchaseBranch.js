/**
 * A qué sucursal pertenece una COMPRA.
 *
 * Las compras no guardan `branchId`: la sucursal se deduce del ALMACÉN al que
 * entró la mercadería. Por eso no sirve `esDeSucursal` de `branchScope.js`, que
 * lee `branchId` directo — esto es el equivalente para compras.
 *
 * Está acá porque el criterio lo necesitan la lista de Compras y su exportación
 * a Excel, y escrito dos veces ya daba resultados distintos: con el filtro en
 * "Principal" y ningún almacén sin sucursal asignada, la lista salía vacía y el
 * Excel igual traía las compras sin almacén.
 *
 * OJO: `src/pages/CashFlow.jsx` tiene todavía su propia copia (se comporta igual
 * que esta). Si tocas el criterio, míralo también.
 */

/**
 * Los ids de almacén que pertenecen a una sucursal.
 * 'main' = los que no tienen sucursal asignada.
 */
export const almacenesDeSucursal = (warehouses, alcance) => (warehouses || [])
  .filter(w => (alcance === 'main' ? !w.branchId : w.branchId === alcance))
  .map(w => w.id)

/**
 * ¿Esta compra es de esta sucursal?
 *
 * @param purchase        la compra
 * @param alcance         'all' | 'main' | <branchId>
 * @param idsDeAlmacenes  lo que devuelve `almacenesDeSucursal` para ese alcance
 *                        (se pasa ya calculado para no rehacerlo por cada fila)
 */
export const esDeSucursalLaCompra = (purchase, alcance, idsDeAlmacenes) => {
  if (!alcance || alcance === 'all') return true
  const whId = purchase?.warehouseId || purchase?.items?.[0]?.warehouseId
  // Una compra sin almacén cuenta como Principal.
  if (!whId) return alcance === 'main'
  return (idsDeAlmacenes || []).includes(whId)
}

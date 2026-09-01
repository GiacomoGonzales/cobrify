/**
 * Cómo se reparte una entrada o salida de stock entre los almacenes de un
 * producto. Es el cálculo que corre DENTRO de la transacción atómica de
 * `updateProductStockTransaction`, extraído para poder probarlo: es la
 * operación más delicada del sistema y hasta ahora solo se podía verificar
 * vendiendo de verdad.
 *
 * INVARIANTE que se respeta siempre: `stock` del producto == suma de
 * `warehouseStocks`. Si el producto no maneja almacenes, `warehouseStocks`
 * queda vacío y manda `stock`.
 *
 * Lógica movida TAL CUAL desde firestoreService (mismo orden de ramas), con un
 * solo cambio de comportamiento, documentado abajo: nunca crear una entrada
 * sin `warehouseId`.
 */

/**
 * @param {object} args
 * @param {Array}  args.warehouseStocks - entradas actuales del producto
 * @param {string} args.warehouseId     - almacén destino ('' o null si no se indicó)
 * @param {number} args.quantity        - positivo entra, negativo sale
 * @param {boolean} [args.allowNegative] - permitir stock negativo
 * @param {number} [args.currentGeneralStock] - `product.stock` actual
 * @returns {{ newStock: number, newWarehouseStocks: Array }}
 */
export const calcularStockPorAlmacen = ({
  warehouseStocks: entradas,
  warehouseId,
  quantity,
  allowNegative = false,
  currentGeneralStock = 0,
}) => {
  const warehouseStocks = [...(entradas || [])]
  let newStock
  let newWarehouseStocks

  if (warehouseStocks.length === 0 && !warehouseId) {
    // El producto no maneja almacenes: manda el stock general.
    newStock = allowNegative ? (currentGeneralStock + quantity) : Math.max(0, currentGeneralStock + quantity)
    newWarehouseStocks = []
    return { newStock, newWarehouseStocks }
  }

  const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)
  if (existingIndex >= 0) {
    const wsStock = (warehouseStocks[existingIndex].stock || 0) + quantity
    warehouseStocks[existingIndex] = { ...warehouseStocks[existingIndex], stock: allowNegative ? wsStock : Math.max(0, wsStock) }
  } else if (quantity > 0 && !warehouseId && warehouseStocks.length > 0) {
    // Entra stock SIN almacén indicado a un producto que sí tiene almacenes:
    // va al PRIMERO, que en la práctica es el principal.
    //
    // Antes se creaba una entrada con `warehouseId` vacío, y eso es lo peor de
    // los dos mundos: el usuario ve un almacén de más que no existe (la
    // pantalla lo pinta con el nombre del principal), y esas unidades no se
    // pueden transferir, ni contar en un recuento, ni descontar desde ningún
    // almacén. Caso real: anular una venta emitida sin almacén devolvía el
    // stock a ese limbo — Crisval, 31-ago-2026, 18 productos y 42 unidades de
    // una sola anulación.
    //
    // Con cantidad NEGATIVA no aplica: ahí el reparto entre almacenes de más
    // abajo es lo correcto (descontar de donde haya).
    warehouseStocks[0] = {
      ...warehouseStocks[0],
      stock: (warehouseStocks[0].stock || 0) + quantity,
    }
  } else if (quantity > 0) {
    warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
  } else if (quantity < 0 && warehouseStocks.length === 0) {
    newStock = allowNegative ? (currentGeneralStock + quantity) : Math.max(0, currentGeneralStock + quantity)
    newWarehouseStocks = []
  } else if (quantity < 0 && allowNegative && warehouseId) {
    // Vender sin stock: el almacén indicado no tenía entrada previa, crear una negativa
    warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
  } else if (quantity < 0) {
    let remaining = Math.abs(quantity)
    for (let i = 0; i < warehouseStocks.length && remaining > 0; i++) {
      const ws = warehouseStocks[i].stock || 0
      const deduct = Math.min(ws, remaining)
      if (deduct > 0) {
        warehouseStocks[i] = { ...warehouseStocks[i], stock: ws - deduct }
        remaining -= deduct
      }
    }
  }

  if (newWarehouseStocks === undefined) {
    newWarehouseStocks = warehouseStocks
    newStock = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
  }

  return { newStock, newWarehouseStocks }
}

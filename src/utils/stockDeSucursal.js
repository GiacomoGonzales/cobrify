/**
 * EL STOCK DE UN PRODUCTO EN LO QUE SE ESTÁ VIENDO.
 *
 * El selector de sucursal del header decide la vista: todas las sedes, la
 * Principal o una sucursal. El stock de un producto en esa vista es la suma de
 * sus almacenes de esa sede (un almacén es de la sede de su `branchId`; sin
 * `branchId`, de la Principal: ver utils/branchScope). Lo usan Inventario y
 * Productos, que antes lo calculaban cada uno a su manera: Productos mostraba
 * siempre el total del negocio aunque arriba se eligiera una sucursal.
 *
 * Sin imports a propósito: la página arma la vista (qué almacenes entran) y
 * esto solo suma.
 */

/**
 * @typedef {object} Vista
 * @property {Set<string>|null} [almacenesVisibles] ids de los almacenes de la sede
 *   elegida; null = todas las sedes
 * @property {string[]} [almacenesElegidos] almacenes elegidos a mano en un filtro
 *   (Inventario); mandan sobre la sede
 * @property {Set<string>|null} [permitidos] almacenes a los que el usuario tiene
 *   acceso, para la vista de todas las sedes; null = todos
 */

function entraEnLaVista({ almacenesVisibles = null, almacenesElegidos = [], permitidos = null } = {}) {
  if (almacenesElegidos.length > 0) return (id) => almacenesElegidos.includes(id)
  if (almacenesVisibles) return (id) => almacenesVisibles.has(id)
  return (id) => !permitidos || permitidos.has(id)
}

const sumar = (lista, entra) =>
  lista.reduce((total, ws) => total + (entra(ws.warehouseId) ? (Number(ws.stock) || 0) : 0), 0)

/**
 * Stock de una variante en la vista. Si la variante lleva su stock por almacén
 * se suma el de la vista; si no, es su stock total.
 * @param {object} variante
 * @param {Vista} [vista]
 */
export function stockDeVariante(variante, vista = {}) {
  const ws = variante?.warehouseStocks || []
  if (ws.length === 0) return Number(variante?.stock) || 0
  return sumar(ws, entraEnLaVista(vista))
}

/**
 * Stock de un producto (o insumo) en la vista.
 * @param {object} item
 * @param {Vista} [vista]
 * @returns {number|null} null si el producto no lleva control de stock
 */
export function stockEnVista(item, vista = {}) {
  if (item?.hasVariants && item.variants?.length > 0) {
    return item.variants.reduce((total, v) => total + stockDeVariante(v, vista), 0)
  }
  const ws = item?.warehouseStocks || []
  if (ws.length === 0) {
    if (item?.stock === null || item?.stock === undefined) return null
    return Number(item.stock) || 0
  }
  return sumar(ws, entraEnLaVista(vista))
}

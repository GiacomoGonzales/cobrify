/**
 * CRITERIO ÚNICO DE ALERTAS DE STOCK
 *
 * Responde una sola pregunta: ¿este producto necesita que alguien lo mire?
 *
 * Existe porque el cálculo estaba copiado en cuatro lugares (las tarjetas de
 * Inventario, su filtro por estado, la tarjeta de Productos y la tabla de
 * reabastecimiento) y ya se habían separado entre sí: la tabla de
 * reabastecimiento saltaba los productos desactivados y las tarjetas no, así que
 * el mismo negocio veía "12 productos por reponer" en una pantalla y una lista
 * de 8 en la otra.
 *
 * REGLA NUEVA (pedido de un usuario): un producto DESACTIVADO no alerta.
 * Desactivarlo es decir "esto ya no se vende"; que siga apareciendo como "sin
 * stock" convierte el contador en ruido y esconde los productos que sí importan.
 * Sigue visible en las listas — simplemente deja de pedir atención.
 */

/** Mínimo por defecto cuando el producto no tiene uno configurado. */
export const DEFAULT_MIN_STOCK = 3

/**
 * Stock mínimo del producto. Acepta 0 como valor válido (hay productos que se
 * piden solo bajo pedido y no deben alertar nunca hasta llegar a cero).
 */
export const getMinStockThreshold = (item) => {
  const n = Number(item?.minStock)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_STOCK
}

/**
 * ¿Este producto participa de las alertas de stock?
 *
 * Los productos sin el campo `isActive` cuentan como activos: el campo es
 * relativamente nuevo y el catálogo viejo no lo tiene. Solo el `false`
 * explícito —alguien lo desactivó a propósito— lo saca.
 */
export const countsForStockAlert = (item) => item?.isActive !== false

/**
 * Estado de stock de un item.
 *
 * @returns {'out'|'low'|'ok'|null} null = no participa de las alertas
 *          (desactivado, o sin control de stock).
 */
export const getStockAlertStatus = (item, stock) => {
  if (!countsForStockAlert(item)) return null
  if (stock === null || stock === undefined) return null

  if (stock === 0) return 'out'
  if (stock <= getMinStockThreshold(item)) return 'low'
  return 'ok'
}

/**
 * ¿Hay que reponerlo?
 *
 * Para pantallas que muestran UN solo contador en vez de separar "bajo stock" y
 * "agotado": un producto en cero también necesita reposición. Inventario los
 * separa porque tiene sitio para dos tarjetas; Productos no.
 */
export const needsRestock = (item, stock) => {
  const estado = getStockAlertStatus(item, stock)
  return estado === 'low' || estado === 'out'
}

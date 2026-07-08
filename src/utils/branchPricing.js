/**
 * Precios de venta por SUCURSAL (feature opt-in: businessSettings.branchPricingEnabled).
 *
 * Modelo: el producto guarda un mapa de OVERRIDES por sucursal —
 *   product.branchPrices = { [branchId]: { price, price2, price3, price4 } }
 * Solo se persisten los valores que difieren del precio general; la ausencia
 * (sucursal sin entrada, o campo vacío) significa "usar el precio general".
 * La Sucursal Principal (branchId null) usa SIEMPRE los precios base.
 *
 * Fase 1: aplica al precio principal y niveles 2/3/4 de productos SIN variantes.
 * NO se sobreescribe priceUSD (el ancla en dólares sigue siendo global) ni los
 * precios de variantes/presentaciones (fase 2).
 */

const positive = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Overrides crudos de una sucursal (o null si no hay). */
export const getBranchPriceOverrides = (product, branchId) => {
  if (!branchId || !product?.branchPrices) return null
  return product.branchPrices[branchId] || null
}

/**
 * Devuelve el producto con los precios EFECTIVOS de la sucursal aplicados
 * (price/price2/3/4 reemplazados por el override cuando existe). Si la sucursal
 * no tiene overrides válidos, devuelve el MISMO objeto (sin clonar), así los
 * memos/comparaciones por referencia no se invalidan de gratis.
 */
export const applyBranchPricing = (product, branchId) => {
  const bp = getBranchPriceOverrides(product, branchId)
  if (!bp) return product
  const p1 = positive(bp.price)
  const p2 = positive(bp.price2)
  const p3 = positive(bp.price3)
  const p4 = positive(bp.price4)
  if (p1 == null && p2 == null && p3 == null && p4 == null) return product
  return {
    ...product,
    ...(p1 != null && { price: p1 }),
    ...(p2 != null && { price2: p2 }),
    ...(p3 != null && { price3: p3 }),
    ...(p4 != null && { price4: p4 }),
  }
}

/**
 * Limpia el estado del formulario ({ [branchId]: { price: '12', ... } } con
 * strings) para persistir: solo entradas con al menos un número > 0.
 * Devuelve null si no queda nada (no guardar un mapa vacío).
 */
export const cleanBranchPrices = (formMap) => {
  if (!formMap) return null
  const out = {}
  for (const [branchId, prices] of Object.entries(formMap)) {
    const entry = {}
    for (const key of ['price', 'price2', 'price3', 'price4']) {
      const n = positive(prices?.[key])
      if (n != null) entry[key] = n
    }
    if (Object.keys(entry).length > 0) out[branchId] = entry
  }
  return Object.keys(out).length > 0 ? out : null
}

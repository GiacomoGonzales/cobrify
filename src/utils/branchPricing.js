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
 * El mapa `branchPrices` con el precio de UNA sucursal cambiado.
 *
 * Nace de un reporte real (GARIBAY, 02-sep-2026): al registrar una compra en
 * una sucursal y poner ahi el precio de venta, el precio cambiaba en la
 * PRINCIPAL. La compra escribia `product.price` —el precio base, que es
 * justamente el que usa la Principal y el que heredan las sucursales sin
 * override—, sin enterarse de que el negocio tiene precios por sucursal.
 *
 * Ojo con lo que NO hace: si `branchId` es null (Principal) devuelve el mapa
 * intacto, porque la Principal se maneja con el precio base, no con overrides.
 * Quien llame decide: con sucursal, este mapa; sin sucursal, el precio base.
 *
 * @param {object} product   ficha del producto
 * @param {string} branchId  sucursal; null o vacio = Principal
 * @param {object} precios   { price, price2, price3, price4 } — los que vengan
 *   null o undefined NO se tocan (se conserva lo que ya tuviera la sucursal)
 * @returns {object|null} el mapa completo para guardar, o null si queda vacio
 */
export const conPrecioDeSucursal = (product, branchId, precios = {}) => {
  const mapa = { ...(product?.branchPrices || {}) }
  if (!branchId) return Object.keys(mapa).length > 0 ? mapa : null

  const entrada = { ...(mapa[branchId] || {}) }
  for (const key of ['price', 'price2', 'price3', 'price4']) {
    const n = positive(precios?.[key])
    if (n != null) entrada[key] = n
  }

  if (Object.keys(entrada).length === 0) delete mapa[branchId]
  else mapa[branchId] = entrada

  return Object.keys(mapa).length > 0 ? mapa : null
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

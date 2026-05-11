import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combina clases de Tailwind CSS de manera inteligente
 * @param {...any} inputs - Clases a combinar
 * @returns {string} - String de clases combinadas
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un número como moneda peruana (PEN).
 * Si el valor no es un número finito (undefined, null, NaN, string vacío)
 * se formatea como 0 para evitar mostrar "S/ NaN" en la UI.
 * @param {number} amount - Monto a formatear
 * @returns {string} - Monto formateado
 */
export function formatCurrency(amount) {
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(safe)
}

/**
 * Devuelve la cantidad mínima requerida para que aplique un nivel de precio en
 * el catálogo público.
 *
 * Modelo nuevo (per-price): business.catalogWholesaleMinQtys = { price2, price3, price4 }
 * Modelo viejo (legacy):    business.catalogWholesaleMinQty (single, aplica a todos no-price1)
 *
 * Devuelve 1 si el priceKey es 'price1' o no se encuentra valor (= sin restricción).
 *
 * @param {Object} business - documento del negocio (con businessSettings.*)
 * @param {string} priceKey - 'price1' | 'price2' | 'price3' | 'price4'
 * @returns {number} cantidad mínima ≥ 1
 */
export function getCatalogMinQty(business, priceKey, product = null) {
  if (!priceKey || priceKey === 'price1') return 1

  // Prioridad 1: configuración a nivel PRODUCTO (opt-in con useAutoPriceByQty)
  // Si el producto tiene su propio mínimo configurado, gana sobre el global.
  if (product?.useAutoPriceByQty === true && product?.priceMinQtys) {
    const productMin = parseInt(product.priceMinQtys[priceKey])
    if (Number.isFinite(productMin) && productMin >= 1) return productMin
  }

  // Prioridad 2: configuración GLOBAL del catálogo (negocio).
  const perPrice = business?.catalogWholesaleMinQtys
  if (perPrice && typeof perPrice === 'object') {
    const v = parseInt(perPrice[priceKey])
    if (Number.isFinite(v) && v >= 1) return v
  }
  // Compat: si solo hay catalogWholesaleMinQty (legacy), aplica a todos no-price1
  const legacy = parseInt(business?.catalogWholesaleMinQty)
  if (Number.isFinite(legacy) && legacy >= 1) return legacy
  return 1
}

/**
 * Calcula el precio de venta aplicando un margen sobre el costo.
 *
 * Soporta dos fórmulas (configurable por negocio en businessSettings.marginFormula):
 *
 * - 'markup' (default histórico): Precio = Costo × (1 + %)
 *   El % se aplica como sobreprecio sobre el costo.
 *   Ej: costo 10, margen 30% → 13.00. La utilidad (3) es el 30% DEL COSTO.
 *
 * - 'margin' (margen real sobre la venta): Precio = Costo ÷ (1 − %)
 *   El % es la utilidad como porcentaje del precio final.
 *   Ej: costo 10, margen 30% → 14.29. La utilidad (4.29) es el 30% DEL PRECIO.
 *
 * @param {number|string} cost
 * @param {number|string} marginPct - porcentaje en formato 0–100
 * @param {string} [formula='markup']
 * @returns {number} precio redondeado a 2 decimales (devuelve cost si no se puede calcular)
 */
export function applyMarginToCost(cost, marginPct, formula = 'markup') {
  const c = Number(cost) || 0
  const pct = Number(marginPct) || 0
  if (c <= 0 || pct <= 0) return c
  if (formula === 'margin') {
    // En modo 'margin' el % debe ser < 100 (sino el divisor es 0 o negativo).
    if (pct >= 100) return c
    return Math.round((c / (1 - pct / 100)) * 100) / 100
  }
  // 'markup' (default)
  return Math.round(c * (1 + pct / 100) * 100) / 100
}

/**
 * Formatea el precio "para mostrar" de un producto (o ítem similar).
 * - Sin variantes: usa product.price.
 * - Con variantes: si todas valen lo mismo, ese único precio. Si no, un
 *   rango "S/ X – Y" usando los precios > 0 de las variantes.
 *
 * Útil para listados (POS, Inventario, Productos) donde un producto con
 * variantes no tiene `price` propio (porque va por variante).
 *
 * @param {Object} product
 * @returns {string} - Precio o rango formateado
 */
export function formatProductPrice(product) {
  if (!product) return formatCurrency(0)
  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    const prices = product.variants
      .map((v) => Number(v?.price))
      .filter((p) => Number.isFinite(p) && p > 0)
    if (prices.length === 0) return formatCurrency(0)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max
      ? formatCurrency(min)
      : `${formatCurrency(min)} – ${formatCurrency(max)}`
  }
  return formatCurrency(Number(product.price) || 0)
}

/**
 * Formatea una fecha en formato local peruano
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} - Fecha formateada
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

/**
 * Formatea una fecha y hora en formato local peruano
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} - Fecha y hora formateada
 */
export function formatDateTime(date) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

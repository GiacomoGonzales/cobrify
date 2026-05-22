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
 * Normaliza un texto para búsquedas insensibles a acentos/tildes y mayúsculas.
 *
 *   "Limón"   → "limon"
 *   "Café"    → "cafe"
 *   "Plátano" → "platano"
 *
 * Descompone los caracteres acentuados (NFD), quita los marcadores de
 * diacrítico (U+0300–U+036F) y baja todo a minúsculas. Útil para que el
 * usuario encuentre un producto aunque escriba sin tildes.
 *
 * @param {string} str - Texto a normalizar (acepta null/undefined)
 * @returns {string}
 */
export function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Búsqueda flexible y tolerante.
 *
 * Divide `query` en palabras y devuelve true si TODAS aparecen como
 * substring (en cualquier orden) en cualquiera de los campos pasados.
 * Insensible a acentos y a mayúsculas. Útil para que el usuario escriba
 * trozos de palabras y encuentre productos largos.
 *
 *   matchesSearchQuery("pol roj x", "POLO QUICKSILVER ROJO XXL") → true
 *   matchesSearchQuery("limon", "Jugo de Limón") → true
 *   matchesSearchQuery("", ...) → true (sin filtro)
 *
 * @param {string} query - Lo que escribió el usuario
 * @param {...(string|null|undefined)} fields - Campos donde buscar
 * @returns {boolean}
 */
export function matchesSearchQuery(query, ...fields) {
  const normalizedQuery = normalizeText(query).trim()
  if (!normalizedQuery) return true
  const words = normalizedQuery.split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(fields.filter(Boolean).join(' '))
  return words.every(w => haystack.includes(w))
}

/**
 * Formatea un número como moneda.
 *
 * Por compatibilidad con las 686+ llamadas existentes en el repo, el
 * segundo parámetro `currency` es opcional y default a 'PEN'. Esto deja
 * intacto el comportamiento histórico.
 *
 * Para fases multi-divisa, pasar explícitamente la moneda del documento:
 *   formatCurrency(100, 'USD') → "US$100.00"
 *
 * Si el valor no es un número finito (undefined, null, NaN, string vacío)
 * se formatea como 0 para evitar mostrar "S/ NaN" en la UI.
 *
 * @param {number} amount - Monto a formatear
 * @param {string} [currency='PEN'] - Código ISO de la moneda ('PEN' | 'USD')
 * @returns {string} - Monto formateado
 */
export function formatCurrency(amount, currency = 'PEN') {
  const n = Number(amount)
  const safe = Number.isFinite(n) ? n : 0
  const code = currency || 'PEN'
  // Para USD usamos locale en-US para que muestre "$1,234.56" en vez del
  // formato "US$ 1.234,56" que produciría es-PE con currency USD.
  const locale = code === 'USD' ? 'en-US' : 'es-PE'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    }).format(safe)
  } catch {
    // Si la moneda no es válida, fallback a PEN sin romper.
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(safe)
  }
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
/**
 * Default usado cuando el producto no tiene `minStock` configurado.
 * Preserva el comportamiento histórico (1-3 unidades en amarillo, 0 rojo).
 */
export const DEFAULT_MIN_STOCK = 3

/**
 * Devuelve el estado de stock de un producto/variante respecto a su umbral
 * de stock mínimo. El umbral puede venir del producto (campo `minStock`) o
 * del default global.
 *
 * @param {number} stock     stock actual disponible
 * @param {number} [minStock] umbral configurado por el dueño (opcional)
 * @returns {'out' | 'low' | 'ok'}
 */
export function getStockStatus(stock, minStock) {
  const s = Number(stock)
  if (!Number.isFinite(s) || s <= 0) return 'out'
  const threshold = Number.isFinite(Number(minStock)) && Number(minStock) >= 0
    ? Number(minStock)
    : DEFAULT_MIN_STOCK
  return s <= threshold ? 'low' : 'ok'
}

/**
 * Devuelve las clases tailwind de color de texto según el estado de stock.
 * Útil para evitar repetir la cadena ternaria en cada lugar.
 */
export function getStockColorClass(stock, minStock) {
  const status = getStockStatus(stock, minStock)
  return status === 'out' ? 'text-red-600'
    : status === 'low' ? 'text-yellow-600'
    : 'text-green-600'
}

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
export function formatProductPrice(product, currency) {
  // Backward-compat: si no se pasa `currency`, se intenta tomar del producto
  // (`product.currency`) y, en último caso, default 'PEN'. Las llamadas
  // antiguas formatProductPrice(product) siguen funcionando idénticamente.
  const ccy = currency || product?.currency || 'PEN'
  if (!product) return formatCurrency(0, ccy)
  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    const prices = product.variants
      .map((v) => Number(v?.price))
      .filter((p) => Number.isFinite(p) && p > 0)
    if (prices.length === 0) return formatCurrency(0, ccy)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max
      ? formatCurrency(min, ccy)
      : `${formatCurrency(min, ccy)} – ${formatCurrency(max, ccy)}`
  }
  return formatCurrency(Number(product.price) || 0, ccy)
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

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

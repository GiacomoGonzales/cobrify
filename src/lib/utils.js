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

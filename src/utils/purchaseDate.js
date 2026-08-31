import { parseLocalDateString } from '@/utils/invoiceDate'

/**
 * FECHA DE COMPRA DEL PRODUCTO (`lastPurchaseDate`).
 *
 * Es la fecha de la factura de la última compra que trajo ese producto — no el
 * día en que se registró. La escribe Compras sola, y se puede corregir a mano
 * en la ficha o cargar por Excel: al importar mercadería que entra como stock
 * inicial, lo que importa es cuándo se compró de verdad, que puede ser un año
 * atrás.
 *
 * Sirve para responder "¿hace cuánto que esta mercadería está en el depósito?"
 * en el reporte de Mercadería Estancada, sobre todo en lo que nunca se vendió,
 * donde no hay ninguna otra fecha de dónde agarrarse.
 *
 * Este módulo existe para que la conversión sea UNA sola en todas las pantallas:
 * Firestore guarda Timestamp, el <input type="date"> habla 'YYYY-MM-DD', y
 * mezclarlos a mano es lo que corre las fechas un día.
 */

/** Cualquier forma (Timestamp, Date, string) → Date, o null. */
export const toDate = (v) => {
  if (!v) return null
  if (v.toDate) return v.toDate()
  if (v instanceof Date) return isNaN(v) ? null : v
  if (typeof v === 'string') {
    // 'YYYY-MM-DD' a secas se parsea LOCAL: new Date() la leería como UTC y en
    // Perú retrocedería un día.
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(v)
    const d = soloFecha ? parseLocalDateString(v) : new Date(v)
    return d && !isNaN(d) ? d : null
  }
  return null
}

/** Date/Timestamp → 'YYYY-MM-DD' para un <input type="date">. '' si no hay. */
export const toDateInput = (v) => {
  const d = toDate(v)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lo que teclea el usuario → Date local para guardar. null si lo dejó vacío. */
export const fromDateInput = (str) => parseLocalDateString(str)

/**
 * Días que lleva la mercadería en el depósito, según su fecha de compra.
 * null si el producto no la tiene cargada.
 */
export const diasEnStock = (producto, asOf = new Date()) => {
  const d = toDate(producto?.lastPurchaseDate)
  if (!d) return null
  return Math.max(0, Math.floor((asOf - d) / 86400000))
}

/**
 * La FECHA de un pago, tal como la eligió el usuario.
 *
 * Vivía dentro de Ventas ("Registrar pago"). El POS también la pide desde el
 * cobro flexible al contado (utils/cobroFlexible, pedido de JMC): las dos
 * pantallas tienen que fechar igual el mismo pago.
 */
import { toDateString } from './emissionDate'

/**
 * Convierte "2026-08-19" en una fecha LOCAL al mediodía.
 *
 * `new Date('2026-08-19')` se interpreta como medianoche UTC, que en Perú es
 * el día ANTERIOR a las 19:00 — el pago quedaría fechado un día antes.
 * Armándola por partes y al mediodía, ningún huso la corre de día.
 *
 * Si la fecha elegida es HOY se devuelve la hora real, para que el cobro
 * caiga en la sesión de caja abierta ahora mismo.
 */
export const fechaDePagoElegida = (texto, ahora = new Date()) => {
  if (!texto || texto === toDateString(ahora)) return new Date(ahora)
  const [anio, mes, dia] = texto.split('-').map(Number)
  return new Date(anio, mes - 1, dia, 12, 0, 0)
}

/**
 * ¿Sirve esta fecha de pago? Un pago no se recibe en el futuro, y el año va
 * con cuatro cifras: un `<input type="date">` acepta el año 275760 si se
 * escribe a mano (ver utils/emissionDate).
 *
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export const validarFechaDePago = (texto, ahora = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) {
    return { valid: false, error: 'La fecha de pago no es válida. Usa el formato día/mes/año.' }
  }
  if (texto > toDateString(ahora)) {
    return { valid: false, error: 'La fecha de pago no puede ser futura.' }
  }
  return { valid: true }
}

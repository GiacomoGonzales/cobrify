import { getInvoiceDate } from '@/utils/invoiceDate'

/**
 * El plazo que da SUNAT para anular un comprobante ya aceptado.
 *
 * Son 7 días calendario desde la emisión, tanto para la comunicación de baja de
 * una factura como para el resumen de baja de una boleta. Pasado ese plazo la
 * única vía es una nota de crédito (o de débito, si lo que se quiere revertir
 * ES una nota de crédito).
 *
 * ---
 *
 * Por qué existe este módulo: el cálculo estaba copiado tres veces
 * (`canVoidInvoice` y `canVoidBoleta` en `services/sunatService.js`, y otra vez
 * en las functions) y las tres leían **`issueDate`**, un campo que los
 * comprobantes NO tienen: en una muestra de 970 comprobantes reales de 25
 * negocios, 966 no lo traían y los 970 traían `emissionDate`.
 *
 * `new Date(undefined)` es Invalid Date, la resta da NaN, y **`NaN > 7` es
 * false**: la validación pasaba de largo SIEMPRE. Por eso el sistema dejaba
 * pedir la anulación de un comprobante de hace meses, mandaba la baja, SUNAT la
 * rechazaba y el comprobante quedaba en "Anulando..." para siempre. Al 6-set-2026
 * eran 29 comprobantes así, el más viejo del 30 de enero.
 *
 * La fecha se lee con `getInvoiceDate`, el mismo criterio que usan la lista, los
 * reportes y la exportación (emissionDate primero, createdAt como respaldo).
 */
export const PLAZO_DIAS = 7

/**
 * Días transcurridos desde la emisión, contados como el resto del sistema.
 *
 * Se mantiene el `Math.ceil` que ya usaban las tres copias (una boleta emitida
 * hoy cuenta como 1) para no mover el límite de lo que se puede anular. Lo que
 * SÍ cambia es el `Math.abs` que traían: con él, un comprobante con fecha futura
 * contaba días "transcurridos" y podía quedar fuera de plazo antes de existir.
 *
 * @returns {number|null} null si el comprobante no tiene ninguna fecha usable.
 */
export function diasDesdeLaEmision(invoice, hoy = new Date()) {
  const emision = getInvoiceDate(invoice)
  if (!emision || Number.isNaN(emision.getTime())) return null
  return Math.ceil((hoy - emision) / 86400000)
}

/**
 * ¿Cómo va el plazo de este comprobante?
 *
 * @returns {{dias: number|null, quedan: number|null, vencido: boolean, texto: string}}
 *   `vencido` es false cuando no se pudo calcular: ante la duda no se bloquea al
 *   usuario, se le deja intentar y que responda SUNAT.
 */
export function plazoDeAnulacion(invoice, hoy = new Date()) {
  const dias = diasDesdeLaEmision(invoice, hoy)
  if (dias === null) {
    return { dias: null, quedan: null, vencido: false, texto: 'Sin fecha de emisión' }
  }
  const quedan = PLAZO_DIAS - dias
  if (quedan < 0) {
    return { dias, quedan, vencido: true, texto: `Venció hace ${-quedan} ${-quedan === 1 ? 'día' : 'días'}` }
  }
  if (quedan === 0) return { dias, quedan, vencido: false, texto: 'Último día' }
  return { dias, quedan, vencido: false, texto: `Quedan ${quedan} ${quedan === 1 ? 'día' : 'días'}` }
}

/**
 * El motivo, en palabras, de por qué ya no se puede anular. Dice la alternativa
 * correcta, que no es la misma para una nota de crédito.
 */
export function motivoDePlazoVencido(invoice, hoy = new Date()) {
  const { dias } = plazoDeAnulacion(invoice, hoy)
  const alternativa = invoice?.documentType === 'nota_credito'
    ? 'Debe emitir una Nota de Débito para revertirla.'
    : 'Debe emitir una Nota de Crédito.'
  return `Han pasado ${dias} días desde la emisión. El plazo máximo es ${PLAZO_DIAS} días. ${alternativa}`
}

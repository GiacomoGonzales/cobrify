/**
 * CON QUÉ SE PAGÓ un comprobante, y cuánto con cada método.
 *
 * Vivía dentro de Ventas (InvoiceList). El Flujo de Caja necesitó lo mismo para
 * repartir sus ventas por método (CONSORCIO ANDINA GROUP, 14-set-2026: "efectivo,
 * tarjeta, Yape, Izipay y otros"), y dos copias de esta regla terminarían dando
 * números distintos para la misma venta. Mismo criterio que el cuadre de caja
 * (cashReportService.formatPaymentMethods).
 *
 * La prioridad es siempre la misma:
 *   1. `paymentHistory`: en ventas al crédito o con pagos parciales, los cobros
 *      hechos con "Registrar pago" (ej. Yape) quedan SOLO ahí. `paymentMethod` y
 *      `payments` conservan lo que estaba elegido en el POS al emitir, que en una
 *      venta al crédito no representa ningún pago real.
 *   2. `payments`: el desglose del POS; una venta puede pagarse con varios métodos.
 *   3. `paymentMethod`: el método de los comprobantes viejos, que no tienen desglose.
 */
import { getDocumentTotalInBase, getDocumentRate } from '@/utils/currency'
import { etiquetaSinCobro } from '@/utils/cobroFlexible'

/** Métodos de pago REALES de un comprobante (para mostrar y filtrar). */
export function metodosRealesDelComprobante(invoice) {
  // Una nota de credito NO tiene forma de pago: no es un cobro, es la
  // reversion de un documento. La caja tampoco la cuenta como venta. Antes
  // caia al relleno de abajo y mostraba "Efectivo", y el cliente pedia poder
  // cambiarlo — pero el dato no existe, no es que estuviera mal elegido.
  if (invoice.documentType === 'nota_credito') return ['—']

  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
    return [...new Set(invoice.paymentHistory.map(p => p.method || 'Efectivo'))]
  }
  // Venta al crédito sin ningún pago registrado aún: no hay método real. La del
  // cobro flexible al contado se llama "Por cobrar" (utils/cobroFlexible).
  if (invoice.paymentStatus === 'pending') return [etiquetaSinCobro(invoice)]
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    return [...new Set(invoice.payments.map(p => p.method || 'Efectivo'))]
  }
  // Array de pagos EXPLÍCITAMENTE vacío: típico de notas de venta provisionales
  // que no capturaron ningún pago real. El POS guarda paymentMethod:'Efectivo'
  // por defecto aunque no haya cobro, así que en vez de heredar ese relleno
  // mostramos un guion (no hay método real). Los documentos ANTIGUOS no tienen
  // el campo `payments`; para esos seguimos usando su paymentMethod histórico.
  if (Array.isArray(invoice.payments)) return ['—']
  return [invoice.paymentMethod || 'Efectivo']
}

/**
 * Cuánto de este comprobante se cobró con UN método, en soles base.
 *
 * Hace falta porque un comprobante puede pagarse con varios métodos a la vez.
 * Al filtrar Ventas por "Efectivo", el total sumaba el importe COMPLETO del
 * documento aunque solo una parte hubiera sido efectivo: una venta de S/71.50
 * pagada con S/1 en efectivo y S/70.50 por Yape sumaba los 71.50 al efectivo
 * y descuadraba la caja (reporte de DHANY, 21-ago).
 *
 * Sigue la MISMA prioridad que metodosRealesDelComprobante —paymentHistory
 * primero, después payments, después el método histórico— para que el monto y
 * la etiqueta que se muestran al lado no puedan contradecirse.
 *
 * Los comprobantes viejos no tienen desglose: si su único método es el que se
 * está filtrando, cuenta por su total, que es lo que se venía mostrando.
 */
export function montoPorMetodoEnBase(invoice, metodo) {
  const buscado = String(metodo || '').toLowerCase()
  const totalBase = getDocumentTotalInBase(invoice)
  // Los importes de cada pago están en la moneda del documento; el total del
  // reporte va en soles. Se convierte con el TC congelado del propio doc.
  const aBase = (monto) => {
    const tc = getDocumentRate(invoice)
    return (Number(monto) || 0) * (tc > 0 ? tc : 1)
  }
  const sumar = (lista) => lista
    .filter(pago => String(pago.method || 'Efectivo').toLowerCase() === buscado)
    .reduce((suma, pago) => suma + aBase(pago.amount), 0)

  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0) {
    return sumar(invoice.paymentHistory)
  }
  if (invoice.paymentStatus === 'pending') {
    return buscado === etiquetaSinCobro(invoice).toLowerCase() ? totalBase : 0
  }
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    return sumar(invoice.payments)
  }
  const metodos = metodosRealesDelComprobante(invoice)
  return metodos.length === 1 && metodos[0].toLowerCase() === buscado ? totalBase : 0
}

/**
 * Reparte entre los métodos de pago un monto ya cobrado de este comprobante.
 *
 * Quien llama decide CUÁNTO cuenta (el Flujo de Caja: lo cobrado en
 * paymentHistory, o el total si se pagó al contado); aquí solo se reparte, con
 * la prioridad de arriba y en proporción a lo que registró cada pago. En
 * proporción y no sumando los pagos tal cual, para que el reparto sume siempre
 * exacto el monto: si un pago en efectivo guardó lo recibido con el vuelto
 * incluido, sumarlo tal cual inflaría el efectivo.
 *
 * @returns {Object<string, number>} método → monto. Sin método real: 'Sin método'.
 */
export function repartirPorMetodo(invoice, monto) {
  const total = Number(monto) || 0
  if (!total) return {}

  const conHistorial = Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length > 0
  const lista = conHistorial
    ? invoice.paymentHistory
    : (invoice.paymentStatus !== 'pending' && Array.isArray(invoice.payments) ? invoice.payments : [])

  const porMetodo = {}
  let suma = 0
  for (const pago of lista) {
    const importe = Number(pago.amount) || 0
    if (importe <= 0) continue
    const metodo = pago.method || 'Efectivo'
    porMetodo[metodo] = (porMetodo[metodo] || 0) + importe
    suma += importe
  }
  if (suma > 0) {
    return Object.fromEntries(Object.entries(porMetodo).map(([metodo, importe]) => [metodo, total * importe / suma]))
  }

  // Sin importes por pago (comprobantes viejos): todo al método que muestra Ventas.
  const [metodo] = metodosRealesDelComprobante(invoice)
  return { [metodo === '—' ? 'Sin método' : metodo]: total }
}

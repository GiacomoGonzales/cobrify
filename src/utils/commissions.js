/**
 * Comisiones de vendedores.
 *
 * ── Por qué la comisión se CONGELA en la venta ───────────────────────────────
 * La comisión se guarda en el comprobante al momento de emitirlo, no se deduce
 * después leyendo la configuración del vendedor. Si el dueño le sube el
 * porcentaje a un vendedor en septiembre, las comisiones de agosto NO pueden
 * moverse solas: ya se informaron, y en muchos casos ya se pagaron. Es el mismo
 * criterio que `costAtSale` en los items y que `unitCost` en las salidas de
 * almacén, y el que ya usa el módulo de comisiones inmobiliarias.
 *
 * Para las ventas ANTERIORES a esta función no hay nada congelado. Ahí se
 * recalcula con la configuración actual y se marca `estimated: true`, para poder
 * avisar en pantalla que esa cifra puede moverse. Mostrar un número sin decir
 * que es estimado sería peor que no mostrarlo.
 *
 * ── Qué NO hace todavía (Fase 1) ─────────────────────────────────────────────
 * No hay tramos por meta ni liquidación. La comisión de cada venta se calcula
 * sola, con un porcentaje plano. En cuanto se agreguen tramos, el porcentaje
 * dejará de poder resolverse venta por venta —dependerá del acumulado del
 * período— y ahí la venta seguirá congelando la BASE mientras la liquidación
 * congela el RESULTADO.
 */

/** Cómo se calcula la comisión de un vendedor. */
export const COMMISSION_TYPES = [
  {
    id: 'percent_sale',
    label: 'Porcentaje de la venta',
    help: 'Sobre el importe total vendido. Es lo más simple y lo más usado.',
  },
  {
    id: 'percent_profit',
    label: 'Porcentaje de la utilidad',
    help: 'Sobre la ganancia (venta menos costo). Evita que dar descuentos le salga gratis al vendedor.',
  },
]

export const DEFAULT_COMMISSION_TYPE = 'percent_sale'

/** ¿Este vendedor tiene comisión configurada y utilizable? */
export const sellerHasCommission = (seller) =>
  !!seller &&
  seller.commissionEnabled === true &&
  Number(seller.commissionRate) > 0

/** Tipo de comisión saneado (cae al de por defecto si viene basura). */
const safeType = (type) =>
  COMMISSION_TYPES.some(t => t.id === type) ? type : DEFAULT_COMMISSION_TYPE

/**
 * Calcula la comisión de UNA venta.
 *
 * Todos los importes van en MONEDA BASE (PEN). El porcentaje del vendedor está
 * en soles, así que comparar contra un total en dólares daría cifras absurdas
 * —el mismo error que ya se corrigió en los márgenes por marca—.
 *
 * @param {Object} seller       vendedor con su configuración de comisión
 * @param {number} totalInBase  total de la venta en PEN
 * @param {number} costInBase   costo de la venta en PEN (solo para percent_profit)
 * @returns {Object|null} `null` si el vendedor no comisiona
 */
export const computeSaleCommission = (seller, totalInBase, costInBase = 0) => {
  if (!sellerHasCommission(seller)) return null

  const type = safeType(seller.commissionType)
  const rate = Number(seller.commissionRate) || 0
  const total = Number(totalInBase) || 0
  const cost = Number(costInBase) || 0

  // La base es lo que se comisiona: la venta entera o solo la ganancia.
  // Una utilidad negativa (se vendió bajo costo) no genera comisión NEGATIVA:
  // se corta en 0. Descontarle plata al vendedor por una venta mal costeada
  // sería un descuadre difícil de explicar, y el costo puede estar mal cargado.
  const base = type === 'percent_profit' ? Math.max(0, total - cost) : total
  const amount = Math.round(base * (rate / 100) * 100) / 100

  return { type, rate, base: Math.round(base * 100) / 100, amount }
}

/**
 * Comisión de un comprobante ya emitido, para reportes.
 *
 * Prioriza la congelada. Si no hay —venta anterior a esta función— recalcula con
 * la configuración ACTUAL del vendedor y lo marca como estimado.
 *
 * @param {Object} invoice
 * @param {Object} options
 * @param {Map|Object} options.sellersById  vendedores por id, para el fallback
 * @param {number} options.totalInBase      total de la venta en PEN
 * @param {number} options.costInBase       costo de la venta en PEN
 * @returns {{ amount: number, rate: number, type: string, estimated: boolean }|null}
 */
export const getInvoiceCommission = (invoice, { sellersById, totalInBase, costInBase = 0 } = {}) => {
  const frozen = invoice?.commission
  if (frozen && Number(frozen.amount) >= 0 && frozen.rate != null) {
    return {
      amount: Number(frozen.amount) || 0,
      rate: Number(frozen.rate) || 0,
      type: safeType(frozen.type),
      base: Number(frozen.base) || 0,
      estimated: false,
    }
  }

  // Sin vendedor asignado no hay a quién comisionar.
  if (!invoice?.sellerId) return null

  const seller = sellersById?.get
    ? sellersById.get(invoice.sellerId)
    : sellersById?.[invoice.sellerId]
  const calc = computeSaleCommission(seller, totalInBase, costInBase)
  if (!calc) return null

  return { ...calc, estimated: true }
}

/** Índice id → vendedor, para no recorrer el array en cada comprobante. */
export const buildSellerIndex = (sellers = []) => {
  const map = new Map()
  for (const s of sellers) map.set(s.id, s)
  return map
}

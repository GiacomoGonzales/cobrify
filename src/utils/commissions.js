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
 * ── Comisión por producto ────────────────────────────────────────────────────
 * Un vendedor puede tener reglas para productos concretos: un porcentaje propio
 * o un monto fijo POR UNIDAD vendida. Y puede pedirse que comisione SOLO esos
 * productos (`commissionOnlyListedProducts`), que es el caso que lo motivó: una
 * tienda donde solo algunas líneas dejan margen para pagar comisión.
 *
 * Cuando hay reglas por producto la comisión deja de ser un porcentaje sobre el
 * total y pasa a ser la SUMA de las líneas. Ojo con eso: los descuentos globales
 * y el recargo al consumo no se reparten por línea, así que la base por producto
 * puede no coincidir con el total del comprobante. Sin reglas por producto no
 * cambia nada: se sigue usando el total, exactamente como antes.
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

/** Cómo se paga la comisión de un producto puntual. */
export const PRODUCT_COMMISSION_MODES = [
  { id: 'percent', label: '%', help: 'Porcentaje de esa línea.' },
  { id: 'fixed', label: 'S/', help: 'Monto fijo por cada unidad vendida.' },
]

/**
 * Reglas por producto de un vendedor, indexadas por productId.
 *
 * Se descartan las que no suman (sin producto o con valor 0): una regla en cero
 * es lo mismo que no tenerla, y dejarla pasar haría que el vendedor "comisione"
 * ese producto con importe 0 cuando en realidad no debería aparecer.
 */
export const buildProductCommissionIndex = (seller) => {
  const map = new Map()
  for (const regla of seller?.productCommissions || []) {
    if (!regla?.productId) continue
    const value = Number(regla.value) || 0
    if (value <= 0) continue
    map.set(regla.productId, { mode: regla.mode === 'fixed' ? 'fixed' : 'percent', value })
  }
  return map
}

/** ¿El vendedor tiene reglas por producto? */
export const sellerHasProductCommissions = (seller) => buildProductCommissionIndex(seller).size > 0

/**
 * ¿Este vendedor tiene comisión configurada y utilizable?
 *
 * Alcanza con el porcentaje general O con reglas por producto: un vendedor que
 * solo comisiona tres productos tiene su porcentaje general en 0, y exigirlo
 * mayor a 0 lo dejaba sin comisión ninguna.
 */
export const sellerHasCommission = (seller) =>
  !!seller &&
  seller.commissionEnabled === true &&
  (Number(seller.commissionRate) > 0 || sellerHasProductCommissions(seller))

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
 * @param {Array}  [items]      líneas de la venta, SOLO necesarias si el vendedor
 *                              tiene reglas por producto. Cada una:
 *                              `{ productId, quantity, totalInBase, costInBase }`
 * @returns {Object|null} `null` si el vendedor no comisiona
 */
export const computeSaleCommission = (seller, totalInBase, costInBase = 0, items = null) => {
  if (!sellerHasCommission(seller)) return null

  const type = safeType(seller.commissionType)
  const rate = Number(seller.commissionRate) || 0
  const reglas = buildProductCommissionIndex(seller)
  const soloListados = seller.commissionOnlyListedProducts === true

  const redondear = (n) => Math.round(n * 100) / 100

  // ── Camino por producto ────────────────────────────────────────────────────
  // Solo cuando hay reglas Y llegan las líneas. Se recorre línea por línea
  // porque cada producto puede pagar distinto.
  if (reglas.size > 0 && Array.isArray(items) && items.length > 0) {
    let base = 0
    let amount = 0

    for (const item of items) {
      const lineaTotal = Number(item?.totalInBase) || 0
      const lineaCosto = Number(item?.costInBase) || 0
      const cantidad = Number(item?.quantity) || 0
      // Misma regla que abajo: vender bajo costo no genera comisión negativa.
      const lineaBase = type === 'percent_profit'
        ? Math.max(0, lineaTotal - lineaCosto)
        : lineaTotal

      const regla = reglas.get(item?.productId)
      if (regla) {
        base += lineaBase
        // El monto fijo es POR UNIDAD: si vende 10, cobra 10 veces.
        amount += regla.mode === 'fixed'
          ? regla.value * cantidad
          : lineaBase * (regla.value / 100)
      } else if (!soloListados && rate > 0) {
        // Producto sin regla propia: va con el porcentaje general del vendedor,
        // salvo que se haya pedido comisionar SOLO los de la lista.
        base += lineaBase
        amount += lineaBase * (rate / 100)
      }
    }

    return {
      type,
      // No hay una sola tasa que represente la venta: cada línea tuvo la suya.
      rate: null,
      porProducto: true,
      base: redondear(base),
      amount: redondear(amount),
    }
  }

  // ── Camino plano (el de siempre) ───────────────────────────────────────────
  // Si el vendedor comisiona SOLO productos de una lista y no tenemos las
  // líneas, no se puede resolver: mejor no comisionar que inventar un importe.
  if (soloListados && reglas.size > 0) return null

  const total = Number(totalInBase) || 0
  const cost = Number(costInBase) || 0

  // La base es lo que se comisiona: la venta entera o solo la ganancia.
  // Una utilidad negativa (se vendió bajo costo) no genera comisión NEGATIVA:
  // se corta en 0. Descontarle plata al vendedor por una venta mal costeada
  // sería un descuadre difícil de explicar, y el costo puede estar mal cargado.
  const base = type === 'percent_profit' ? Math.max(0, total - cost) : total
  const amount = redondear(base * (rate / 100))

  return { type, rate, base: redondear(base), amount }
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
 * @param {Array}  [options.items]           líneas, si el vendedor comisiona por producto
 * @returns {{ amount: number, rate: number|null, type: string, estimated: boolean }|null}
 */
export const getInvoiceCommission = (invoice, { sellersById, totalInBase, costInBase = 0, items = null } = {}) => {
  const frozen = invoice?.commission
  // Una comisión por producto NO tiene tasa única, así que la congelada se
  // reconoce por el importe y no por la tasa. Exigir `rate` la mandaba a
  // recalcular con la configuración de hoy — justo lo que hay que evitar.
  if (frozen && Number.isFinite(Number(frozen.amount))) {
    return {
      amount: Number(frozen.amount) || 0,
      rate: frozen.rate == null ? null : (Number(frozen.rate) || 0),
      type: safeType(frozen.type),
      base: Number(frozen.base) || 0,
      porProducto: frozen.porProducto === true,
      estimated: false,
    }
  }

  // Sin vendedor asignado no hay a quién comisionar.
  if (!invoice?.sellerId) return null

  const seller = sellersById?.get
    ? sellersById.get(invoice.sellerId)
    : sellersById?.[invoice.sellerId]
  const calc = computeSaleCommission(seller, totalInBase, costInBase, items)
  if (!calc) return null

  return { ...calc, estimated: true }
}

/** Índice id → vendedor, para no recorrer el array en cada comprobante. */
export const buildSellerIndex = (sellers = []) => {
  const map = new Map()
  for (const s of sellers) map.set(s.id, s)
  return map
}

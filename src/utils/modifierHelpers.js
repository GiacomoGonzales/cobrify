/**
 * Helpers para manejo de modificadores con precio en precuentas y comprobantes.
 *
 * Estructura esperada de un item con modifiers:
 *   item.modifiers: [{
 *     modifierId, modifierName, allowRepeat,
 *     options: [{ optionId, optionName, priceAdjustment, quantity? }]
 *   }]
 *
 * Los modificadores GRATIS (priceAdjustment = 0) no se muestran en cliente —
 * solo son útiles para cocina (KitchenTicket sigue mostrando todos).
 */

/**
 * Filtra los modificadores de un ítem dejando solo aquellos cuyas opciones
 * tienen un priceAdjustment > 0. Retorna el mismo shape pero con `options`
 * reducido. Los modificadores que quedan vacíos tras el filtro se descartan.
 */
export const getPricedModifiers = (item) => {
  const mods = item?.modifiers || item?.selectedModifiers
  if (!Array.isArray(mods) || mods.length === 0) return []
  return mods
    .map((modifier) => ({
      ...modifier,
      options: (modifier.options || []).filter(
        (opt) => Number(opt.priceAdjustment || 0) > 0
      ),
    }))
    .filter((modifier) => modifier.options.length > 0)
}

/**
 * Cuánto suman los adicionales de UNA unidad del ítem.
 *
 * El precio unitario que se guarda en la venta ya viene con los adicionales
 * adentro (un jugo de 8 con "Grande" de 2 se guarda como 10), así que este es
 * el número que hay que restarle para volver al precio de lista.
 */
export const getModifiersUnitTotal = (item) => {
  let total = 0
  getPricedModifiers(item).forEach((modifier) => {
    (modifier.options || []).forEach((opt) => {
      total += Number(opt.priceAdjustment || 0) * Number(opt.quantity || 1)
    })
  })
  return total
}

/**
 * El ítem desglosado: el producto a su precio de lista y cada adicional como
 * una línea que SUMA.
 *
 * El formato anterior mostraba el precio YA con adicionales y debajo el
 * adicional con su monto entre paréntesis — "1 x S/10.00 ... + Grande
 * (+S/2.00)". En un ticket todo número de la derecha se lee como "esto se
 * suma", así que el cliente hacía 10 + 2 = 12, no le cuadraba con el total y
 * desconfiaba. Ahora los números cierran: 8 + 2 = 10.
 *
 * @param {object} item
 * @param {number} unitPrice  precio unitario guardado (con adicionales dentro)
 * @param {number} quantity   cantidad del ítem
 * @returns {{ baseUnit: number, baseTotal: number, lineas: Array<{texto: string, monto: number}> }}
 */
export const getItemPriceBreakdown = (item, unitPrice, quantity = 1) => {
  const cantidad = Number(quantity) || 1
  const unitario = Number(unitPrice) || 0
  const porUnidad = getModifiersUnitTotal(item)
  // Nunca por debajo de cero: si un dato viejo no cuadra, se prefiere mostrar
  // el precio tal cual antes que un negativo en el ticket.
  const baseUnit = Math.max(0, unitario - porUnidad)

  const lineas = []
  getPricedModifiers(item).forEach((modifier) => {
    (modifier.options || []).forEach((opt) => {
      const veces = Number(opt.quantity || 1)
      lineas.push({
        texto: `${veces > 1 ? `${veces}x ` : ''}${opt.optionName}`,
        monto: Number(opt.priceAdjustment || 0) * veces * cantidad,
      })
    })
  })

  return { baseUnit, baseTotal: baseUnit * cantidad, lineas }
}

/**
 * Construye una lista de líneas legibles para imprimir los modificadores
 * con precio de un ítem.
 *
 * Ejemplo de salida (texto plano, una línea por entrada):
 *   ["+ Carne premium (+S/4.00)", "+ 2x Queso extra (+S/3.00)"]
 *
 * @param {object} item
 * @param {object} [opts]
 * @param {string} [opts.bullet="+"] - prefijo de cada línea
 * @returns {string[]}
 */
export const formatPricedModifierLines = (item, opts = {}) => {
  const { bullet = '+' } = opts
  const priced = getPricedModifiers(item)
  const lines = []
  priced.forEach((modifier) => {
    modifier.options.forEach((opt) => {
      const qty = opt.quantity && opt.quantity > 1 ? `${opt.quantity}x ` : ''
      const totalAdj = Number(opt.priceAdjustment || 0) * Number(opt.quantity || 1)
      lines.push(`${bullet} ${qty}${opt.optionName} (+S/ ${totalAdj.toFixed(2)})`)
    })
  })
  return lines
}

/**
 * Igual que formatPricedModifierLines pero como un único string HTML inline.
 * Útil para tickets web donde queremos cada opción en su propia línea con
 * estilos consistentes.
 *
 * @returns {string} HTML safe (los nombres no se sanitizan, asume que vienen del propio sistema)
 */
export const formatPricedModifierHtmlLines = (item, opts = {}) => {
  const lines = formatPricedModifierLines(item, opts)
  return lines.map((l) => `<div class="item-modifier">${l}</div>`).join('')
}

/**
 * Filas HTML del desglose para la precuenta: el adicional con su monto en la
 * misma columna que el producto, para que la cuenta cierre a la vista.
 */
export const formatBreakdownHtmlRows = (item, unitPrice, quantity = 1) => {
  const { lineas } = getItemPriceBreakdown(item, unitPrice, quantity)
  return lineas.map((l) => (
    `<div class="item-row">` +
    `<div class="qty"></div>` +
    `<div class="desc">+ ${l.texto}</div>` +
    `<div class="price">S/ ${l.monto.toFixed(2)}</div>` +
    `</div>`
  )).join('')
}

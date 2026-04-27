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

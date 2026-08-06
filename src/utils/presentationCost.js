/**
 * Costo equivalente y margen de una presentación de venta.
 *
 * El costo vive UNA sola vez, en la unidad base del producto (S/ por kg);
 * las presentaciones no tienen costo propio a propósito: su costo real es
 * SIEMPRE factor × costo base (un "Saco x49" de arroz a S/3.06/kg cuesta
 * S/149.94). Este helper solo lo hace visible — es informativo, no editable.
 *
 * Criterio compartido entre los dos editores de presentaciones (Products y
 * ProductFormModal) para que ambos muestren el mismo número.
 *
 * @param {object} presentation  { factor, price }
 * @param {number|string} baseCost  Costo del producto por unidad base.
 * @returns {{ costEq: number, margin: number, marginPct: number|null } | null}
 *          null si no hay costo o factor válidos (no se muestra nada).
 */
export function getPresentationCostInfo(presentation, baseCost) {
  const factor = Number(presentation?.factor)
  const price = Number(presentation?.price)
  const cost = Number(baseCost)
  if (!(factor > 0) || !(cost > 0)) return null
  const costEq = factor * cost
  const margin = (Number.isFinite(price) ? price : 0) - costEq
  const marginPct = price > 0 ? (margin / price) * 100 : null
  return { costEq, margin, marginPct }
}

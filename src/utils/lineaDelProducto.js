/**
 * LO QUE UNA LÍNEA DEL CARRITO HEREDA DE SU PRODUCTO.
 *
 * El producto suelto entra al carrito con su ficha entera (`...product` en el
 * POS), y de ahí salen su afectación IGV, su tasa, su unidad SUNAT y si acepta
 * decimales. Las líneas que se arman a mano —la variante, el pedido online—
 * se olvidaban de eso y caían en el valor por defecto: la variante de un
 * producto EXONERADO se facturaba gravada con 18% (RUC 10779143801, "Biblia
 * económica leon", 13-set-2026), y el pedido del catálogo de un exonerado
 * también.
 *
 * La variante solo cambia talla o color, precio, stock y foto: lo fiscal es
 * del producto. Sin imports a propósito, para probarlo con node.
 */

// Datos del producto que el comprobante copia de la línea al emitir (ver el
// mapeo de ítems en POS.jsx) y que son iguales en todas sus variantes.
const DESCRIPTIVOS = [
  'marca', 'laboratoryName', 'genericName', 'concentration', 'presentation',
  'activeIngredient', 'therapeuticAction', 'saleCondition', 'sanitaryRegistry',
]

/**
 * @param {object|null|undefined} producto la ficha del catálogo
 * @returns {object} solo los campos que el producto tiene; nada si no hay ficha.
 *   Sin afectación no inventa una: la línea cae al default de siempre ('10').
 */
export function heredadoDelProducto(producto) {
  if (!producto) return {}
  const heredado = {}
  if (producto.taxAffectation) heredado.taxAffectation = String(producto.taxAffectation)
  if (producto.igvRate !== undefined && producto.igvRate !== null && producto.igvRate !== '') {
    heredado.igvRate = Number(producto.igvRate)
  }
  if (producto.unit) heredado.unit = producto.unit
  if (producto.allowDecimalQuantity) heredado.allowDecimalQuantity = true
  for (const campo of DESCRIPTIVOS) {
    if (producto[campo]) heredado[campo] = producto[campo]
  }
  return heredado
}

// 10% es la forma corta de la tasa reducida de restaurantes y hoteles (10.5%).
const tasaNormal = (tasa) => (Number(tasa) === 10 ? 10.5 : Number(tasa))

/**
 * UNA SOLA TASA DE IGV POR COMPROBANTE (SUNAT, regla 3462).
 *
 * Todas las líneas gravadas del comprobante van con la misma tasa. El POS lo
 * revisaba en tres lugares, cada uno a su manera: el producto suelto, el
 * personalizado (que comparaba 10 con 10.5 y bloqueaba una venta válida) y la
 * variante, que no lo revisaba porque nunca traía la tasa de su producto.
 *
 * @param {{taxAffectation?: string, igvRate?: number}} linea lo que se quiere agregar
 * @param {Array} carrito lo que ya está en la venta
 * @param {{taxType?: string, tasaDelNegocio?: number}} config la del comprobante
 * @returns {null | {tasaDelCarrito: number, tasaNueva: number}} null si se puede agregar
 */
export function tasaQueChoca(linea, carrito, { taxType, tasaDelNegocio } = {}) {
  if (taxType !== 'standard') return null
  if ((linea?.taxAffectation || '10') !== '10') return null
  const gravada = (carrito || []).find((item) => (item.taxAffectation || '10') === '10')
  if (!gravada) return null
  const tasaNueva = tasaNormal(linea.igvRate || tasaDelNegocio || 18)
  const tasaDelCarrito = tasaNormal(gravada.igvRate || tasaDelNegocio || 18)
  return tasaNueva === tasaDelCarrito ? null : { tasaDelCarrito, tasaNueva }
}

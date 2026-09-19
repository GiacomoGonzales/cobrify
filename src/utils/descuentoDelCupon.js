/**
 * CUÁNTO DESCUENTA UN CUPÓN, igual en el POS y en la precuenta de la mesa.
 *
 * Un cupón no es un descuento nuevo: llena el descuento global con su valor, y
 * todo lo que viene después (subtotal, IGV, XML de SUNAT) es la matemática del
 * descuento manual, que ya está probada. Lo único que se decide acá es QUÉ número
 * va a ese descuento, y tiene que ser el mismo en las dos pantallas: la precuenta
 * que se le lleva a la mesa promete un total, y el POS que la cobra tiene que
 * llegar al mismo (Mandil, 19-set-2026).
 *
 * Sin dependencias a propósito: se prueba en Node con carritos sintéticos.
 */

/**
 * Las líneas a las que alcanza un cupón.
 *
 * Sin categorías alcanza a TODA la venta, que es como funcionaron siempre: un
 * cupón viejo no tiene el campo y pasa por acá sin cambiar nada. Con categorías
 * alcanza solo a esas líneas, y el descuento se calcula sobre ESE subtotal.
 *
 * El cupón guarda el CÓDIGO de la categoría (`product.category`). En el carrito
 * del POS y del catálogo la línea lo trae en `category`; en los pedidos que toma
 * el mozo, `category` lleva el NOMBRE —la cocina reparte por estación con él— y
 * el código viaja en `categoryId`. Por eso se mira primero `categoryId`: sin él,
 * un cupón por categorías no alcanzaba a nada al cobrar una mesa.
 *
 * Devuelve LÍNEAS y no un monto a propósito: la caja suma en soles y el catálogo
 * en su moneda con conversión de tipo de cambio. Lo que se comparte acá es el
 * CRITERIO (qué entra); la aritmética del dinero la pone cada pantalla.
 *
 * ⚠️ La comparación es PLANA, igual que en los descuentos programados: una
 * categoría padre no alcanza a sus subcategorías. Mismo criterio en las dos
 * funciones para que al negocio no le signifiquen cosas distintas.
 */
export const lineasQueCalifican = (lineas, categorias = []) => {
  const cats = (categorias || []).filter(Boolean)
  if (!cats.length) return lineas || []
  return (lineas || []).filter((l) => cats.includes(l?.categoryId || l?.category || ''))
}

/**
 * El descuento global que corresponde a un cupón.
 *
 * @param {{type: 'percent'|'amount', value: number, categories?: string[]}} cupon
 * @param {Array} lineas  lo que se está cobrando: el carrito del POS o los items
 *   de la mesa
 * @param {(linea) => number} importe  cuánto suma cada línea: en el POS precio ×
 *   cantidad; en la mesa, su total
 * @returns {{tipo: 'percent'|'amount', valor: number} | {error: string}}
 *
 * Con categorías el descuento va SIEMPRE como monto, aunque el cupón sea de
 * porcentaje: un porcentaje en el descuento global se aplicaría sobre toda la
 * venta, que sería otro número. Sin categorías, el porcentaje queda porcentaje y
 * el monto fijo se recorta al total, para que nunca baje de 0.
 */
export const descuentoDelCupon = (cupon, lineas, importe) => {
  const categorias = (cupon?.categories || []).filter(Boolean)
  const valor = Number(cupon?.value) || 0
  const suma = (ls) => (ls || []).reduce((s, l) => s + (Number(importe(l)) || 0), 0)
  const redondear = (n) => Math.round(n * 100) / 100

  if (categorias.length) {
    const base = suma(lineasQueCalifican(lineas, categorias))
    // Sin nada que cobrar en esas categorías se avisa, en vez de aplicar un
    // descuento de cero sin decir nada (lo que promete la guía de Promociones).
    if (!(base > 0)) return { error: 'Ese cupón no alcanza a ningún producto de esta venta' }
    const bruto = cupon.type === 'percent' ? base * (valor / 100) : Math.min(valor, base)
    return { tipo: 'amount', valor: redondear(bruto) }
  }
  if (cupon?.type === 'percent') return { tipo: 'percent', valor }
  return { tipo: 'amount', valor: redondear(Math.min(valor, suma(lineas))) }
}

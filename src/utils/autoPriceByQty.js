/**
 * Precio automático por cantidad: el mismo criterio para el POS y el catálogo.
 *
 * La regla que el negocio entiende es "12 o más y le hago precio por docena,
 * sin importar las tallas". Eso obliga a dos cosas que se olvidan fácil:
 *
 *  - **La cantidad se suma por PRODUCTO, no por línea.** Quien lleva 4 de talla
 *    2XL, 9 de la 2 y 4 de la 10 se llevó 17 polos y le corresponde el precio
 *    por docena, aunque ninguna talla por separado llegue a 12. Por eso el
 *    precio de una línea NO se puede calcular sola: depende del resto.
 *  - **El umbral es del producto, el precio es de la variante.** "Desde 12" es
 *    una regla comercial única, pero cuánto cuesta la docena sí cambia por
 *    talla: la 3XL no vale lo mismo que la 2.
 *
 * Esto vivía SOLO dentro de POS.jsx, y el catálogo online tenía su propia
 * versión — más vieja, que leía los precios del producto padre (donde no
 * existen cuando hay variantes) y sumaba línea por línea. Resultado: el mismo
 * carrito costaba distinto en el mostrador y en la tienda, y el cliente se
 * daba cuenta. Ahora los dos llaman acá.
 */

const NIVELES = ['price2', 'price3', 'price4']

const numeroPositivo = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * A partir de cuántas unidades aplica un nivel.
 *
 * Cascada: lo del producto manda; si no, el global del negocio; si no, el
 * global legacy (uno solo para todos los niveles, ya no configurable pero
 * todavía presente en negocios viejos).
 */
export function minimoDeNivel(key, producto, businessSettings, exigirFlag = true) {
  // El mínimo propio del producto es un opt-in: sin el flag activado, el
  // catálogo lo ignora y cae al global (así se comportó siempre).
  const usaElPropio = exigirFlag || producto?.useAutoPriceByQty === true
  const delProducto = usaElPropio ? parseInt(producto?.priceMinQtys?.[key]) : NaN
  if (Number.isFinite(delProducto) && delProducto >= 1) return delProducto

  const global = parseInt(businessSettings?.catalogWholesaleMinQtys?.[key])
  if (Number.isFinite(global) && global >= 1) return global

  const legacy = parseInt(businessSettings?.catalogWholesaleMinQty)
  if (Number.isFinite(legacy) && legacy >= 1) return legacy

  return null
}

/**
 * Precio que corresponde a `cantidadTotal` unidades de este producto.
 *
 * @param {object} p
 * @param {object} p.producto          ficha del producto (con `variants`)
 * @param {string} [p.variantSku]      variante elegida, si la hay
 * @param {number} p.cantidadTotal     unidades del PRODUCTO entero, no de la línea
 * @param {object} p.businessSettings
 * @returns {number|null} precio, o null si este producto no usa precio por cantidad
 */
export function precioPorCantidad({ producto, variantSku = null, cantidadTotal = 0, businessSettings = {}, exigirFlag = true }) {
  if (!producto) return null
  // El POS exige que el producto tenga activado "precio por cantidad"; el
  // catálogo online nunca lo exigió y hay tiendas vivas que dan mayorista solo
  // por el mínimo global del negocio. Igualarlos en silencio les cambiaría los
  // precios, así que cada uno conserva su regla y lo que se comparte es el
  // cálculo.
  if (exigirFlag && producto.useAutoPriceByQty !== true) return null

  const variante = variantSku && Array.isArray(producto.variants)
    ? producto.variants.find(v => v.sku === variantSku)
    : null

  const precioDe = (key) =>
    (variante ? numeroPositivo(variante[key]) : null) ?? numeroPositivo(producto[key])

  const base = precioDe('price') ?? (parseFloat(producto.price) || 0)

  const alcanzados = NIVELES
    .map(key => {
      const valor = precioDe(key)
      if (valor == null) return null
      const min = minimoDeNivel(key, producto, businessSettings, exigirFlag)
      if (min == null || min < 1 || cantidadTotal < min) return null
      return { key, valor }
    })
    .filter(Boolean)

  // El más barato de los que alcanzó: si llega a dos niveles, se le cobra el mejor.
  if (alcanzados.length === 0) return base
  alcanzados.sort((a, b) => a.valor - b.valor)
  return alcanzados[0].valor
}

/** Igual que `precioPorCantidad`, pero además dice QUÉ nivel aplicó (o null). */
export function nivelPorCantidad(opciones) {
  const { producto, variantSku = null, cantidadTotal = 0, businessSettings = {}, exigirFlag = true } = opciones
  if (!producto) return null
  if (exigirFlag && producto.useAutoPriceByQty !== true) return null

  const variante = variantSku && Array.isArray(producto.variants)
    ? producto.variants.find(v => v.sku === variantSku)
    : null
  const precioDe = (key) =>
    (variante ? numeroPositivo(variante[key]) : null) ?? numeroPositivo(producto[key])

  const alcanzados = NIVELES
    .map(key => {
      const valor = precioDe(key)
      if (valor == null) return null
      const min = minimoDeNivel(key, producto, businessSettings, exigirFlag)
      if (min == null || min < 1 || cantidadTotal < min) return null
      return { key, valor }
    })
    .filter(Boolean)

  if (alcanzados.length === 0) return null
  alcanzados.sort((a, b) => a.valor - b.valor)
  return alcanzados[0].key
}

/**
 * Reprecia una lista de líneas sumando las cantidades por producto.
 *
 * Cada línea necesita `{ id, quantity }` y opcionalmente `variantSku`. Se
 * devuelve una lista nueva con `precio` y `porSuma` (true cuando el descuento
 * lo consiguieron OTRAS variantes, no la cantidad de esta línea) para que cada
 * pantalla decida cómo mostrarlo.
 *
 * `excluir` deja fuera lo que no debe repreciarse ni empujar al siguiente
 * nivel: bonificaciones, precios anclados en otra moneda, ítems manuales.
 */
export function repreciarPorCantidad(lineas, { productoPorId, businessSettings = {}, excluir = () => false, exigirFlag = true } = {}) {
  const totalPorProducto = {}
  for (const l of lineas || []) {
    if (!l?.id || excluir(l)) continue
    totalPorProducto[l.id] = (totalPorProducto[l.id] || 0) + (parseFloat(l.quantity) || 0)
  }

  return (lineas || []).map(l => {
    if (!l?.id || excluir(l)) return { linea: l, precio: null, porSuma: false, nivel: null }

    const producto = typeof productoPorId === 'function' ? productoPorId(l.id) : productoPorId?.[l.id]
    if (!producto) return { linea: l, precio: null, porSuma: false, nivel: null }
    if (exigirFlag && producto.useAutoPriceByQty !== true) return { linea: l, precio: null, porSuma: false, nivel: null }

    const total = totalPorProducto[l.id] || 0
    const propia = parseFloat(l.quantity) || 0
    const variantSku = l.variantSku || null

    const precio = precioPorCantidad({ producto, variantSku, cantidadTotal: total, businessSettings, exigirFlag })
    if (precio == null) return { linea: l, precio: null, porSuma: false, nivel: null }

    const soloConLoSuyo = precioPorCantidad({ producto, variantSku, cantidadTotal: propia, businessSettings, exigirFlag })
    return {
      linea: l,
      precio,
      nivel: nivelPorCantidad({ producto, variantSku, cantidadTotal: total, businessSettings, exigirFlag }),
      porSuma: total > propia && precio !== soloConLoSuyo,
    }
  })
}

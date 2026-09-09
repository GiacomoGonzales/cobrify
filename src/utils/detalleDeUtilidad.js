/**
 * El desglose por producto de UNA venta: cuánto entró, cuánto costó, cuánto
 * dejó y con qué margen.
 *
 * Recibe las funciones que Reportes YA usa para el costo de un ítem y para su
 * ingreso en moneda base, en vez de recalcular por su cuenta. Si el detalle
 * usara otro criterio, sus totales no cuadrarían con la fila de la tabla, que
 * es justo lo que el usuario abre a comparar.
 *
 * El total de la venta manda sobre la suma de las líneas: es el que muestra la
 * fila y el que el cliente pagó. Cuando la venta llevó un descuento global, ese
 * monto no vive en ninguna línea, así que la suma da más alto. Esa diferencia
 * se devuelve aparte en vez de repartirla a mano entre los productos, que sería
 * inventar un precio de línea que nadie pactó.
 */

const dos = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Margen en porcentaje. Sin ingreso no hay margen que calcular. */
export function margenDe(ingreso, utilidad) {
  const i = Number(ingreso) || 0
  return i > 0 ? (Number(utilidad) || 0) / i * 100 : 0
}

/**
 * @param {object} comprobante          la venta, con `items[]`
 * @param {object} fns
 * @param {function} fns.costoDeItem    `(item) => costo en soles`
 * @param {function} fns.ingresoDeItem  `(item, comprobante) => ingreso en soles`
 * @param {function} [fns.esPersonalizado] `(item) => bool`, producto libre del POS
 * @param {function} [fns.ingresoDelComprobante] `(comprobante) => total en soles`
 * @returns {{ lineas: Array, totales: object, descuadre: number }}
 */
export function detalleDeUtilidad(comprobante, {
  costoDeItem,
  ingresoDeItem,
  esPersonalizado = () => false,
  ingresoDelComprobante = null,
} = {}) {
  const items = Array.isArray(comprobante?.items) ? comprobante.items : []

  const lineas = items.map((item, i) => {
    const ingreso = dos(ingresoDeItem(item, comprobante))
    const costo = dos(costoDeItem(item))
    const utilidad = dos(ingreso - costo)
    const personalizado = !!esPersonalizado(item)
    return {
      clave: `${item.productId || item.id || 'linea'}-${i}`,
      nombre: item.name || item.description || 'Producto',
      sku: item.sku || item.code || '',
      cantidad: Number(item.quantity) || 0,
      unidad: item.presentationName || item.unit || '',
      ingreso,
      costo,
      utilidad,
      margen: margenDe(ingreso, utilidad),
      personalizado,
      // Un costo en 0 que NO viene de un producto libre es un costo que falta
      // en el catálogo, no una ganancia del 100%. La UI lo marca.
      costoFaltante: costo === 0 && !personalizado,
    }
  })

  const sumaIngresos = dos(lineas.reduce((s, l) => s + l.ingreso, 0))
  const costo = dos(lineas.reduce((s, l) => s + l.costo, 0))
  const ingreso = ingresoDelComprobante ? dos(ingresoDelComprobante(comprobante)) : sumaIngresos
  const utilidad = dos(ingreso - costo)

  return {
    lineas,
    totales: { ingreso, costo, utilidad, margen: margenDe(ingreso, utilidad) },
    // Positivo si la suma de las líneas supera lo cobrado: casi siempre, un
    // descuento global aplicado sobre el total.
    descuadre: dos(sumaIngresos - ingreso),
  }
}

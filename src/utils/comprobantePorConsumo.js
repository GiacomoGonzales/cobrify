/**
 * "POR CONSUMO": el comprobante muestra una sola línea en vez del detalle.
 *
 * Un restaurante que cierra la cuenta de una mesa no quiere que la boleta liste
 * los doce platos: quiere una línea que diga POR CONSUMO. Adentro de Cobrify
 * NADA cambia — el stock, los insumos por receta, los reportes y las comisiones
 * siguen leyendo `items`, que guarda los platos de verdad.
 *
 * Lo que se colapsa es la representación FISCAL del documento, y se congela al
 * cobrar en `itemsComprobante`. Se congela y no se calcula al imprimir por tres
 * razones:
 *
 *   1. Lo impreso tiene que ser para siempre igual a lo que se le mandó a
 *      SUNAT. Si mañana cambia esta regla, los comprobantes viejos seguirían
 *      imprimiéndose como su propio XML.
 *   2. La nota de crédito copia los ítems de la factura: con la lista congelada
 *      la NC también dice POR CONSUMO, y no queda una NC con platos contra una
 *      boleta de una línea.
 *   3. El XML vive en `functions/` y no puede importar de `src/`. Congelando,
 *      el criterio se escribe UNA vez.
 *
 * Lo que NO se colapsa:
 *
 *   - Las BONIFICACIONES (lo que se regala). Llevan afectación propia (15/21/31)
 *     y la leyenda 1002; meterlas en el montón las convertiría en algo cobrado.
 *   - Las afectaciones distintas entre sí. SUNAT necesita la base separada por
 *     afectación, así que salen dos líneas POR CONSUMO —una gravada y una
 *     exonerada— antes que una sola mal declarada. Igual con tasas de IGV
 *     distintas (regla 3462).
 */

/** Lo que dice la línea. El negocio puede cambiarlo en Configuración. */
export const TEXTO_POR_CONSUMO = 'POR CONSUMO'

/** Unidad de servicio del catálogo 03 de SUNAT. */
export const UNIDAD_SERVICIO = 'ZZ'

const r2 = (n) => Math.round(n * 100) / 100

const numero = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Una línea regalada: no entra al colapso. */
const esBonificacion = (linea) =>
  linea?.isBonificacion === true || linea?.esBonificacion === true

/**
 * Lo que vale una línea CON IGV, con el mismo redondeo por línea que usan el
 * POS (`calculateMixedInvoiceAmounts`) y el XML del servidor.
 *
 * El redondeo es por línea a propósito: SUNAT valida sumando líneas ya
 * redondeadas, y acumular con precisión para redondear al final deja el
 * documento descuadrado en un céntimo.
 */
const valorDeLinea = (linea, tasaIgv) => {
  const bruto = numero(linea.quantity) * numero(linea.unitPrice ?? linea.price)
  const conDescuento = bruto - numero(linea.itemDiscount ?? linea.descuento)
  const afectacion = String(linea.taxAffectation || '10')
  if (afectacion !== '10') return r2(conDescuento)
  const m = numero(tasaIgv) / 100
  const base = r2(conDescuento / (1 + m))
  return base + r2(conDescuento - base)
}

/** La tasa que le toca a la línea; 0 para lo que no es gravado. */
const tasaDeLinea = (linea, tasaGlobal) => {
  if (String(linea.taxAffectation || '10') !== '10') return 0
  const propia = linea.igvRate
  const cruda = propia == null || propia === '' ? numero(tasaGlobal) : numero(propia)
  // IGV 10% ya no existe; el catálogo lo migró a 10.5%. Mismo ajuste que peruUtils.
  return cruda === 10 ? 10.5 : cruda
}

/**
 * Colapsa las líneas de una venta en la(s) línea(s) POR CONSUMO.
 *
 * @param {Array} lineas   ítems tal como se van a guardar, o el carrito del POS
 * @param {object} [opciones]
 * @param {number} [opciones.igvRate=18]  tasa global del negocio
 * @param {string} [opciones.texto]       qué dice la línea
 * @returns {Array} las líneas del comprobante (nunca muta la entrada)
 */
export function lineasPorConsumo(lineas, opciones = {}) {
  const items = Array.isArray(lineas) ? lineas.filter(Boolean) : []
  if (items.length === 0) return []

  const tasaGlobal = opciones.igvRate == null ? 18 : numero(opciones.igvRate)
  const texto = (opciones.texto || '').trim() || TEXTO_POR_CONSUMO

  // Las regaladas salen tal cual y conservan su orden relativo al final: son
  // pocas y el cliente las tiene que ver identificadas.
  const regaladas = items.filter(esBonificacion)
  const cobradas = items.filter((l) => !esBonificacion(l))

  // Un grupo por afectación y tasa. Se conserva el orden de aparición para que
  // la línea gravada —la normal— salga primero.
  const grupos = new Map()
  cobradas.forEach((linea) => {
    const afectacion = String(linea.taxAffectation || '10')
    const tasa = tasaDeLinea(linea, tasaGlobal)
    const clave = `${afectacion}|${tasa}`
    const actual = grupos.get(clave) || { afectacion, tasa, valor: 0 }
    actual.valor = r2(actual.valor + valorDeLinea(linea, tasa))
    grupos.set(clave, actual)
  })

  const colapsadas = [...grupos.values()]
    // Una mesa donde todo lo cobrado se anuló a 0 no aporta una línea en cero:
    // SUNAT la rechazaría por precio 0 sin valor referencial.
    .filter((g) => g.valor > 0)
    .map((g) => ({
      name: texto,
      description: texto,
      quantity: 1,
      unit: UNIDAD_SERVICIO,
      unitPrice: g.valor,
      subtotal: g.valor,
      taxAffectation: g.afectacion,
      ...(g.tasa ? { igvRate: g.tasa } : {}),
      // Marca de origen: sirve para no volver a colapsar algo ya colapsado
      // (una NC que copia los ítems de una factura POR CONSUMO).
      esPorConsumo: true,
    }))

  return [...colapsadas, ...regaladas]
}

/**
 * Las líneas que le tocan al comprobante: las congeladas si las hay, el detalle
 * si no. TODO lo que imprime o declara un documento pasa por acá — los cinco
 * formatos de impresión, la nota de crédito y el XML del servidor.
 */
export function lineasDelComprobante(documento) {
  const congeladas = documento?.itemsComprobante
  if (Array.isArray(congeladas) && congeladas.length > 0) return congeladas
  return documento?.items || []
}

/** ¿Este documento se emitió POR CONSUMO? */
export function esPorConsumo(documento) {
  return Array.isArray(documento?.itemsComprobante) && documento.itemsComprobante.length > 0
}

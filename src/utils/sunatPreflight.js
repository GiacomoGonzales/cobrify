/**
 * Revisión previa: lo que SUNAT va a rechazar, dicho ANTES de emitir.
 *
 * Un comprobante rechazado no es un error cualquiera: consume el correlativo,
 * obliga a rehacer la venta y el negocio se entera horas después, cuando el
 * cliente ya se fue. Todo rechazo que aprendemos a reconocer debería terminar
 * acá, como una revisión de dos segundos antes de emitir.
 *
 * Solo aplica a comprobantes ELECTRÓNICOS (factura, boleta y sus notas). La
 * nota de venta no va a SUNAT y no tiene por qué pasar por estas reglas.
 */

const ELECTRONICOS = ['factura', 'boleta', 'nota_credito', 'nota_debito']

/** ¿Este tipo de documento viaja a SUNAT? */
export function vaASunat(documentType) {
  return ELECTRONICOS.includes(String(documentType || '').toLowerCase())
}

const numero = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Revisa los ítems de un comprobante por emitir.
 *
 * @param {object} p
 * @param {string} p.documentType
 * @param {Array}  p.items  líneas del comprobante, tal como se van a guardar
 * @returns {{ errores: Array<{linea:number, producto:string, problema:string, solucion:string}> }}
 */
export function revisarAntesDeEmitir({ documentType, items = [] } = {}) {
  const errores = []
  if (!vaASunat(documentType)) return { errores }

  items.forEach((item, i) => {
    if (!item) return
    const linea = i + 1
    const producto = item.name || item.description || `Ítem ${linea}`

    const precio = numero(item.unitPrice ?? item.price)
    const cantidad = numero(item.quantity)
    const referencia = numero(item.referencePrice ?? item.originalUnitPrice ?? item.listPrice)
    const esBonificacion = item.isBonificacion === true || numero(item.itemDiscount) > 0

    /**
     * Regalo sin valor declarado.
     *
     * SUNAT no acepta una línea "con cobro" que valga cero: o se cobra algo, o
     * es una entrega gratuita y hay que declarar cuánto vale lo que se regala.
     * Sin ese número el comprobante sale declarando un regalo de valor cero,
     * que es lo que terminó rebotando en APU MARKET (error 3105, 13 boletas).
     */
    if (precio === 0 && cantidad > 0 && referencia <= 0 && !esBonificacion) {
      errores.push({
        linea,
        producto,
        problema: 'va con precio 0 y no se sabe cuánto vale',
        solucion: 'Ponle su precio en Productos y márcalo como bonificación al cobrar, o quítalo de la venta.',
      })
    }
  })

  return { errores }
}

/** Un solo texto para mostrar en un aviso. */
export function textoDeErrores(errores = []) {
  if (errores.length === 0) return ''
  const lineas = errores.map(e => `• ${e.producto}: ${e.problema}`)
  return `${lineas.join('\n')}\n\n${errores[0].solucion}`
}

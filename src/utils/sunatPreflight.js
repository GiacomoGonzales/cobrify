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
 * ¿Este texto sirve como nombre para SUNAT?
 *
 * SUNAT valida `cbc:RegistrationName` y rechaza con el código 2022 lo que "no
 * cumple con el estándar". Un punto, un guion o un espacio no son un nombre:
 * la boleta BQ01-00000150 salió con el nombre en "." y volvió rechazada, con
 * el correlativo ya gastado.
 *
 * La regla es a propósito la mínima que separa un nombre de un relleno: al
 * menos DOS letras o números. No se exige más porque nombres cortos y raros
 * existen, y bloquear una venta de verdad es peor que dejar pasar un caso
 * dudoso.
 */
const pareceNombre = (texto) => {
  const limpio = String(texto || '').trim()
  if (!limpio) return false
  // \p{L} y \p{N} para no dejar afuera tildes ni la Ñ.
  const alfanumericos = limpio.match(/[\p{L}\p{N}]/gu) || []
  return alfanumericos.length >= 2
}

/**
 * Revisa los ítems de un comprobante por emitir.
 *
 * @param {object} p
 * @param {string} p.documentType
 * @param {Array}  p.items  líneas del comprobante, tal como se van a guardar
 * @param {object} [p.customer]  el cliente, tal como se va a guardar
 * @returns {{ errores: Array<{linea:number, producto:string, problema:string, solucion:string}> }}
 */
export function revisarAntesDeEmitir({ documentType, items = [], customer = null } = {}) {
  const errores = []
  if (!vaASunat(documentType)) return { errores }

  /**
   * El NOMBRE del cliente. Va primero porque no depende de ninguna línea:
   * con un nombre inválido el comprobante entero rebota.
   *
   * En factura manda la razón social; en boleta, cualquiera de los dos —el
   * POS guarda el nombre en `name` y la razón social en `businessName`—.
   */
  if (customer) {
    const esFactura = String(documentType).toLowerCase() === 'factura'
    const nombre = esFactura
      ? (customer.businessName || customer.name || '')
      : (customer.name || customer.businessName || '')
    if (!pareceNombre(nombre)) {
      const mostrado = String(nombre || '').trim()
      errores.push({
        linea: 0,
        producto: esFactura ? 'Razón social del cliente' : 'Nombre del cliente',
        problema: mostrado
          ? `dice "${mostrado}", y SUNAT no lo acepta como nombre`
          : 'está vacío',
        solucion: esFactura
          ? 'Busca el RUC para traer la razón social, o escríbela completa.'
          : 'Escribe el nombre del cliente, o déjalo como "Cliente General".',
      })
    }
  }

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
  // Las soluciones SIN repetir: diez líneas con el mismo precio 0 comparten
  // arreglo, pero un nombre inválido y un precio 0 se arreglan distinto, y antes
  // solo se mostraba el del primero.
  const soluciones = [...new Set(errores.map(e => e.solucion).filter(Boolean))]
  return `${lineas.join('\n')}\n\n${soluciones.join('\n')}`
}

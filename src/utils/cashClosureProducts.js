/**
 * QUÉ SE VENDIÓ EN EL TURNO — el resumen de productos del cierre de caja.
 *
 * Pedido por el dueño: "en vez de estar entrando a ver venta por venta qué
 * productos se han vendido". Sale del mismo array de comprobantes que el
 * ticket ya usa para los totales, así que no cuesta ninguna consulta más y no
 * puede contradecir al Total Ventas que va arriba.
 *
 * Este módulo existe aparte porque el cierre se imprime por DOS caminos —el
 * ticket HTML y la impresora térmica por Bluetooth— y las dos listas tienen
 * que decir lo mismo.
 */

/** Cantidad sin ceros de relleno: 2 -> "2", 1.5 -> "1.5". */
const cantidadCorta = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
}

const monto = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)

/**
 * Una línea de "etiqueta ....... valor" que entra en el ancho del papel.
 *
 * Si el nombre no entra, se RECORTA: partirlo en dos líneas duplica el alto de
 * un ticket que ya es largo, y en una lista de productos lo que se busca es
 * reconocer el artículo, no leer su nombre completo.
 */
const lineaAncho = (etiqueta, valor, ancho) => {
  const val = String(valor)
  const tope = ancho - val.length - 1
  const etq = etiqueta.length > tope ? etiqueta.slice(0, Math.max(1, tope)) : etiqueta
  const relleno = Math.max(1, ancho - etq.length - val.length)
  return etq + ' '.repeat(relleno) + val
}

/**
 * El bloque de productos vendidos, listo para mandar a una térmica.
 *
 * Devuelve las líneas de texto ya alineadas al ancho del papel; el que imprime
 * solo las recorre. Lista vacía = no hay nada que imprimir y no se dibuja ni el
 * título.
 *
 * @param {object} resumen  lo que devuelve `resumirProductosVendidos`
 * @param {number} ancho    caracteres por línea (32 en 58mm, 48 en 80mm)
 * @returns {string[]}
 */
export const lineasDeProductosParaTicket = (resumen, ancho = 32) => {
  const lineas = resumen?.lineas || []
  if (lineas.length === 0) return []

  const out = ['PRODUCTOS VENDIDOS', '-'.repeat(ancho)]
  for (const p of lineas) {
    out.push(lineaAncho(`${cantidadCorta(p.cantidad)} ${p.nombre}`, monto(p.importe), ancho))
  }
  out.push('-'.repeat(ancho))
  out.push(lineaAncho(
    `${cantidadCorta(resumen.totalUnidades)} unidades`,
    monto(resumen.totalImporte),
    ancho,
  ))
  return out
}

/** ¿Este comprobante cuenta como venta del turno? */
const cuenta = (inv) => {
  const st = inv?.status
  if (st === 'cancelled' || st === 'voided') return false
  const ss = inv?.sunatStatus
  if (ss === 'voided' || ss === 'voiding') return false
  return true
}

/**
 * Motivos del catalogo 09 en los que la mercaderia VUELVE al deposito.
 *
 * Los otros diez motivos corrigen el monto o los datos del comprobante —
 * descuento global, disminucion en el valor, error en el RUC, error en la
 * descripcion— y el producto se vendio igual. Restarlos aca haria desaparecer
 * de la lista mercaderia que si salio.
 */
const MOTIVOS_QUE_DEVUELVEN = new Set([
  '01', // Anulacion de la operacion
  '06', // Devolucion total
  '07', // Devolucion por item
])

/**
 * ¿Esta nota de credito descuenta productos de ESTE turno?
 *
 * Dos condiciones, las dos necesarias:
 *
 * 1. Que el motivo implique devolucion fisica (arriba). Sin `discrepancyCode`
 *    —notas viejas, cargadas antes de que se guardara el motivo— se asume que
 *    SI devuelve: es el caso mas comun y el que el dueño espera ver reflejado.
 *
 * 2. Que el comprobante que corrige sea de este mismo turno. Una devolucion de
 *    una venta de ayer no puede restarse de lo que se vendio hoy: dejaria la
 *    lista por debajo de lo que realmente salio del deposito.
 */
const notaDevuelveDelTurno = (nc, numerosDelTurno) => {
  const code = String(nc?.discrepancyCode || '').trim()
  if (code && !MOTIVOS_QUE_DEVUELVEN.has(code)) return false

  const ref = String(nc?.referencedDocumentId || '').trim().toUpperCase()
  // Sin referencia no hay forma de ubicarla en el tiempo; no se resta, porque
  // restar de mas es peor que no restar: al dueño le faltarian productos que
  // sabe que vendio y dejaria de confiar en la lista.
  if (!ref) return false
  return numerosDelTurno.has(ref)
}

/** La clave con la que se agrupa: el producto, o su nombre si no tiene id. */
const claveDe = (item) => {
  const id = item?.productId
  const nombre = String(item?.name || '').trim()
  // El nombre entra en la clave aunque haya productId: dos presentaciones del
  // mismo producto ("Gaseosa" y "Gaseosa (Caja x12)") comparten productId y en
  // el mostrador son dos cosas distintas.
  return `${id || ''}|${nombre.toLowerCase()}`
}

/**
 * Resume los productos vendidos en el turno.
 *
 * Las NOTAS DE CRÉDITO restan SOLO cuando de verdad devolvieron mercadería:
 * motivo de devolución (catálogo 09) y sobre un comprobante de este mismo
 * turno. Ver `notaDevuelveDelTurno`.
 *
 * @param {Array} invoices comprobantes del turno
 * @returns {{lineas: Array<{nombre, codigo, cantidad, importe}>, totalUnidades: number, totalImporte: number}}
 */
export const resumirProductosVendidos = (invoices = []) => {
  const mapa = new Map()

  // Los comprobantes del turno, para saber si una nota corrige una venta de
  // hoy o una de otro día.
  const numerosDelTurno = new Set()
  for (const inv of invoices) {
    const n = String(inv?.number || '').trim().toUpperCase()
    if (n) numerosDelTurno.add(n)
  }

  for (const inv of invoices) {
    if (!cuenta(inv)) continue
    // La nota de débito no mueve mercadería (es un cargo adicional).
    if (inv?.documentType === 'nota_debito') continue

    let signo = 1
    if (inv?.documentType === 'nota_credito') {
      if (!notaDevuelveDelTurno(inv, numerosDelTurno)) continue
      signo = -1
    }

    const items = Array.isArray(inv?.items) ? inv.items : []

    for (const item of items) {
      const cantidad = Number(item?.quantity) || 0
      if (cantidad === 0) continue
      const nombre = String(item?.name || '').trim()
      if (!nombre) continue

      const clave = claveDe(item)
      const fila = mapa.get(clave) || { nombre, codigo: item?.code || '', cantidad: 0, importe: 0 }
      fila.cantidad += cantidad * signo
      // El importe sale del subtotal guardado, que ya trae el descuento por
      // ítem aplicado; recalcularlo con precio x cantidad lo ignoraría.
      const sub = Number(item?.subtotal)
      fila.importe += (Number.isFinite(sub) ? sub : (Number(item?.unitPrice) || 0) * cantidad) * signo
      mapa.set(clave, fila)
    }
  }

  const lineas = [...mapa.values()]
    .filter(f => f.cantidad > 0)
    .map(f => ({ ...f, importe: Math.round(f.importe * 100) / 100 }))
    // De lo que más se vendió a lo que menos: lo primero que se mira es qué
    // salió más. A igual cantidad, primero lo de mayor importe.
    .sort((a, b) => (b.cantidad - a.cantidad) || (b.importe - a.importe))

  return {
    lineas,
    totalUnidades: Math.round(lineas.reduce((s, f) => s + f.cantidad, 0) * 1000) / 1000,
    totalImporte: Math.round(lineas.reduce((s, f) => s + f.importe, 0) * 100) / 100,
  }
}

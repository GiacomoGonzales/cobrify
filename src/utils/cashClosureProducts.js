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

/** ¿Este comprobante cuenta como venta del turno? */
const cuenta = (inv) => {
  const st = inv?.status
  if (st === 'cancelled' || st === 'voided') return false
  const ss = inv?.sunatStatus
  if (ss === 'voided' || ss === 'voiding') return false
  return true
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
 * Las NOTAS DE CRÉDITO restan. Si en este turno se devolvió mercadería, esa
 * mercadería volvió al depósito en este turno: el ticket dice qué salió de
 * verdad. Puede dejar un producto en cero o en negativo cuando la nota
 * corresponde a una venta de otro día; esos no se listan, porque "vendí -2
 * gaseosas hoy" no es información útil para quien cierra la caja.
 *
 * @param {Array} invoices comprobantes del turno
 * @returns {{lineas: Array<{nombre, codigo, cantidad, importe}>, totalUnidades: number, totalImporte: number}}
 */
export const resumirProductosVendidos = (invoices = []) => {
  const mapa = new Map()

  for (const inv of invoices) {
    if (!cuenta(inv)) continue
    const items = Array.isArray(inv?.items) ? inv.items : []
    // La nota de crédito devuelve mercadería: sus cantidades se restan.
    const signo = inv?.documentType === 'nota_credito' ? -1 : 1
    // La nota de débito no mueve mercadería (es un cargo adicional).
    if (inv?.documentType === 'nota_debito') continue

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

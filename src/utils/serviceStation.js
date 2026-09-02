/**
 * Vender combustible por MONTO, que es como lo pide la gente.
 *
 * En un grifo nadie dice "tres galones con treinta": dice "cincuenta soles".
 * El surtidor recibe el monto, despacha, y en su contómetro muestra los tres
 * datos: Soles 50.00 / Galones 3.030 / Precio 16.50.
 *
 * ─── El criterio ───────────────────────────────────────────────────────────
 *
 * MANDA EL MONTO. El cliente entrega 50 soles y el comprobante tiene que
 * decir 50.00, no 49.99. Entonces:
 *
 *   1. Los galones salen del monto y se redondean a 3 decimales, que es lo
 *      que muestra la manguera.
 *   2. El unitario se deriva de vuelta (monto / galones) para que la
 *      multiplicación cierre exacta.
 *
 * El unitario derivado se aparta del precio publicado en la cuarta cifra
 * (16.50 -> 16.5016) y esa diferencia es la que absorbe el redondeo de los
 * galones. Es lo mismo que ya hace el generador de XML cuando un descuento no
 * divide parejo, y es lo que permite que la línea cuadre para SUNAT: el XML
 * admite hasta 10 decimales en la cantidad y 4 o más en el unitario.
 *
 * Al revés (el cajero teclea galones) el criterio es el mismo: el monto sale
 * de los galones, se redondea al céntimo, y el unitario se deriva de ese
 * monto. Así una sola regla explica los dos sentidos y el resultado siempre
 * cumple cantidad x unitario = total.
 */

/** Lo que muestra el contómetro de la manguera. */
export const DECIMALES_GALON = 3

const redondear = (n, decimales) => {
  const f = Math.pow(10, decimales)
  return Math.round((Number(n) || 0) * f) / f
}

const positivo = (n) => {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * El despacho completo a partir del monto que entrega el cliente.
 * Devuelve null cuando no hay nada que despachar (sin precio, sin monto, o un
 * monto tan chico que no alcanza ni para la milésima de galón).
 */
export const despachoPorMonto = (monto, precioPorGalon) => {
  const m = positivo(monto)
  const p = positivo(precioPorGalon)
  if (!m || !p) return null

  const galones = redondear(m / p, DECIMALES_GALON)
  if (!galones) return null

  return { galones, monto: redondear(m, 2), unitario: redondear(m, 2) / galones }
}

/** El mismo despacho cuando el cajero prefiere teclear los galones. */
export const despachoPorGalones = (galones, precioPorGalon) => {
  const g = redondear(positivo(galones), DECIMALES_GALON)
  const p = positivo(precioPorGalon)
  if (!g || !p) return null

  const monto = redondear(g * p, 2)
  if (!monto) return null

  return { galones: g, monto, unitario: monto / g }
}

/** Un solo punto de entrada para los dos modos. */
export const despacho = (valor, precioPorGalon, modo = 'monto') =>
  modo === 'galones'
    ? despachoPorGalones(valor, precioPorGalon)
    : despachoPorMonto(valor, precioPorGalon)

/**
 * Cuánto se corrió el unitario respecto del precio publicado.
 * El carrito lo necesita para mover `price` y `basePrice` juntos sin que la
 * conversión de moneda los desalinee.
 */
export const factorDeAjuste = (unitario, precioPorGalon) => {
  const p = positivo(precioPorGalon)
  if (!p) return 1
  return (Number(unitario) || 0) / p
}

/** Config guardada del negocio, con sus valores por defecto. */
export const configDeEstacion = (settings) => ({
  enabled: settings?.serviceStationConfig?.enabled === true,
  fuelIds: Array.isArray(settings?.serviceStationConfig?.fuelIds)
    ? settings.serviceStationConfig.fuelIds
    : [],
})

/** ¿Corresponde mostrar la barra de combustibles? */
export const estacionActiva = (settings) => configDeEstacion(settings).enabled

/**
 * Los productos elegidos como combustible, EN EL ORDEN configurado.
 *
 * Se resuelve contra el catálogo vivo a propósito: el precio del galón cambia
 * seguido y tiene que salir del producto, no de una copia guardada acá.
 * Los ids que ya no existen (producto borrado) simplemente no aparecen.
 */
export const combustiblesDe = (settings, productos = []) => {
  const { fuelIds } = configDeEstacion(settings)
  if (!fuelIds.length || !productos.length) return []
  const porId = new Map(productos.map((p) => [p.id, p]))
  return fuelIds.map((id) => porId.get(id)).filter(Boolean)
}

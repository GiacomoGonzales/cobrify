/**
 * Todo lo que se comparte de un ENVÍO: el enlace al mapa y el mensaje de
 * WhatsApp que se le manda al repartidor.
 *
 * Vive aparte de la página porque el mismo enlace de mapa lo usan la tabla, la
 * tarjeta del celular y el mensaje: si cada uno lo arma por su cuenta, tarde o
 * temprano uno apunta a la dirección escrita y otro al punto GPS.
 */

export const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  yape: 'Yape',
  plin: 'Plin',
}

/**
 * Enlace al mapa para una entrega. Con la ubicación que el comprador marcó en
 * el catálogo apunta al punto EXACTO; si no la hay, busca la dirección escrita.
 * Devuelve null cuando no hay ni una ni otra.
 */
export const enlaceMapaEntrega = (delivery) => {
  const c = delivery?.customerCoords
  if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
    return `https://www.google.com/maps?q=${c.lat},${c.lng}`
  }
  const dir = String(delivery?.customerAddress || '').trim()
  return dir ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}` : null
}

/** Fecha del envío en formato corto, o cadena vacía si no se puede leer. */
const fechaCorta = (valor) => {
  if (!valor) return ''
  try {
    const d = valor.toDate ? valor.toDate() : new Date(valor)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

/** Cantidad sin decimales de relleno: 2 y no 2.00, pero 1.5 sigue siendo 1.5. */
const cantidad = (n) => {
  const v = parseFloat(n)
  if (!Number.isFinite(v)) return '1'
  return String(parseFloat(v.toFixed(3)))
}

/**
 * Arma el mensaje que ve el repartidor. Va en texto plano con los asteriscos
 * de WhatsApp: se lee igual si lo abre en el celular o en la web.
 *
 * El orden no es casual — primero a dónde va y el enlace del mapa (que es lo
 * único que necesita para arrancar), y recién después qué lleva y cuánto cobra.
 */
export const mensajeEnvioWhatsApp = (delivery, { nombreNegocio = '' } = {}) => {
  if (!delivery) return ''
  const l = []

  l.push(`*ENVÍO${delivery.orderNumber ? ` ${delivery.orderNumber}` : ''}*`)
  const cabecera = [nombreNegocio, fechaCorta(delivery.createdAt)].filter(Boolean)
  if (cabecera.length) l.push(cabecera.join(' · '))

  l.push('', '*Cliente*')
  l.push(delivery.customerName || 'Sin nombre')
  if (delivery.customerPhone) l.push(String(delivery.customerPhone))

  l.push('', '*Dirección*')
  l.push(String(delivery.customerAddress || '').trim() || 'Sin dirección escrita')
  const mapa = enlaceMapaEntrega(delivery)
  if (mapa) {
    l.push(mapa)
    // Aclararlo evita que el repartidor dude entre lo escrito y el punto.
    if (delivery.customerCoords) l.push('(ubicación exacta que marcó el cliente)')
  }

  const items = Array.isArray(delivery.items) ? delivery.items : []
  if (items.length > 0) {
    l.push('', '*Pedido*')
    items.forEach(i => l.push(`- ${cantidad(i.quantity)} ${i.name || 'Producto'}`))
  }

  l.push('', `*Total: S/ ${(parseFloat(delivery.amount) || 0).toFixed(2)}*`)
  const fee = parseFloat(delivery.deliveryFee) || 0
  if (fee > 0) l.push(`Costo de envío: S/ ${fee.toFixed(2)}`)

  const metodo = PAYMENT_METHOD_LABELS[delivery.paymentMethod] || delivery.paymentMethod || 'Efectivo'
  l.push(delivery.paymentStatus === 'pending'
    ? `COBRAR AL ENTREGAR: S/ ${(parseFloat(delivery.cashCollected) || parseFloat(delivery.amount) || 0).toFixed(2)} en ${metodo}`
    : `Ya está pagado (${metodo}). No cobrar.`)

  return l.join('\n')
}

/**
 * Normaliza un celular peruano para wa.me. Nueve dígitos es un número local y
 * le falta el país; si trae más, ya viene con código y se respeta tal cual.
 */
const conCodigoPais = (telefono) => {
  const solo = String(telefono || '').replace(/\D/g, '')
  if (!solo) return ''
  return solo.length === 9 ? `51${solo}` : solo
}

/**
 * Enlace de WhatsApp con el mensaje ya escrito. Sin teléfono devuelve el enlace
 * genérico, donde WhatsApp pregunta a quién mandárselo: sirve igual para
 * reenviárselo al cliente o a otro repartidor.
 */
export const enlaceWhatsAppEnvio = (delivery, { nombreNegocio = '', telefono = '' } = {}) => {
  const texto = encodeURIComponent(mensajeEnvioWhatsApp(delivery, { nombreNegocio }))
  const destino = conCodigoPais(telefono)
  return destino ? `https://wa.me/${destino}?text=${texto}` : `https://wa.me/?text=${texto}`
}

/**
 * Resumen de lo que lleva el pedido, para congelarlo en el envío. Se guarda al
 * crearlo y no se vuelve a leer el comprobante: si después le editan la venta,
 * el repartidor ya salió con lo que le dijeron.
 */
export const resumirItemsParaEnvio = (items) => {
  if (!Array.isArray(items)) return []
  return items.slice(0, 40).map(i => ({
    name: String(i.name || i.description || 'Producto').slice(0, 80),
    quantity: parseFloat(i.quantity) || 1,
  }))
}

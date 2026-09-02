/**
 * EL COSTO DEL ENVÍO, en un solo lugar.
 *
 * Vive en el pedido (`order.deliveryFee`) y no como un producto más del
 * catálogo, por tres razones:
 *
 *  1. Con la edición de precios apagada no había forma de cobrarlo. De los 186
 *     negocios en modo restaurante, 31 la tienen apagada y 21 de ellos tampoco
 *     tienen el producto personalizado: para cobrar un envío variable tenían
 *     que crear un producto por cada precio.
 *  2. El campo YA existía y ya se leía en dos lados —el envío que se crea al
 *     asignar repartidor y las "Ganancias del día" de la pantalla de
 *     repartidores— pero nada lo escribía nunca. Estaba siempre en 0.
 *  3. Separado de los platos, se puede preguntar cuánto se cobró por envíos.
 *     Como línea de producto queda enterrado entre la comida.
 *
 * OJO con el punto 2: el mismo número significa "lo que se le cobra al
 * cliente" y "lo que gana el repartidor". En estos negocios suelen ser el
 * mismo, pero si alguno cobra S/ 5 y le paga S/ 3 al motorizado, el reporte de
 * ganancias le va a quedar inflado. Cuando alguien lo pida, se separan.
 */

/** El nombre con el que la línea aparece en el POS y en el comprobante. */
export const NOMBRE_DELIVERY = 'Delivery'

/** Un monto de envío válido, o 0. Nunca NaN ni negativo. */
export const montoDeEnvio = (valor) => {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

/** ¿Este pedido cobra envío? Solo los delivery, y solo con monto. */
export const cobraEnvio = (order) =>
  order?.orderType === 'delivery' && montoDeEnvio(order?.deliveryFee) > 0

/**
 * La línea que se agrega al final del carrito del POS.
 *
 * Va como ítem PERSONALIZADO (`isCustom`) a propósito: así no busca ficha en el
 * catálogo, no descuenta stock —un envío no es mercadería— y su precio no pasa
 * por el permiso de editar precios, que es justo lo que estos negocios tienen
 * apagado.
 *
 * @param {number} monto            costo del envío
 * @param {string} afectacionIGV    afectación por defecto del negocio (Catálogo 07)
 */
export const lineaDeEnvio = (monto, afectacionIGV = '10') => {
  const precio = montoDeEnvio(monto)
  if (precio <= 0) return null
  return {
    id: `delivery-${Date.now()}`,
    name: NOMBRE_DELIVERY,
    price: precio,
    quantity: 1,
    isCustom: true,
    esEnvio: true,
    stock: null,
    unit: 'ZZ',
    taxAffectation: afectacionIGV || '10',
  }
}

/**
 * ¿El carrito ya trae un envío puesto a mano?
 *
 * Muchos negocios resolvieron esto creando un producto llamado "Delivery" y
 * agregándolo ellos. Si el pedido además trae su costo, se cobraría dos veces:
 * hay que avisar antes, no después de emitir.
 */
export const yaHayEnvioEnElCarrito = (cart = []) =>
  (cart || []).some((item) => {
    if (item?.esEnvio) return false // el que agregamos nosotros no cuenta
    const nombre = String(item?.name || '').toLowerCase()
    return nombre.includes('delivery') || nombre.includes('envio') || nombre.includes('envío')
  })

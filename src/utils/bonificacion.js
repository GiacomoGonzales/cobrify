/**
 * REGALAR UN PRODUCTO EN UN COMPROBANTE.
 *
 * Para SUNAT una línea que vale cero y se declara como operación con cobro es
 * una contradicción, y rechaza el comprobante entero con el error 3105. Una
 * entrega gratuita se declara distinto: se dice **cuánto vale** lo que se
 * regala y que el cliente paga cero. Eso, en la línea, se ve así:
 *
 *     unitPrice     = lo que vale         (valor de referencia)
 *     itemDiscount  = lo mismo × cantidad (el cliente no lo paga)
 *     subtotal      = 0
 *
 * `itemDiscount` no es cosmético: es la SEÑAL que mira el generador del XML
 * (`functions/src/utils/xmlGenerator.js`, `isBonificacionItem`) para declarar
 * la línea con afectación 15, PriceTypeCode 02 y tributo 9996 (GRA).
 *
 * ⚠️ **Marcar la línea como bonificación NO le pone un valor.** Esa confusión
 * costó 26 boletas rechazadas en APU MARKET: estaban marcadas "(BONIFICACIÓN)"
 * pero salían con precio 0 igual, porque no había de dónde sacar cuánto valían
 * —los productos estaban cargados en el catálogo con precio 0—. Por eso este
 * módulo devuelve `{}` cuando no hay valor: sin valor no hay bonificación
 * válida, y quien llame tiene que impedir la emisión (ver
 * `src/utils/sunatPreflight.js`).
 */

const numero = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Cuánto vale lo que se regala, buscándolo en orden de confianza.
 *
 * 1. `bonificacionRefPrice`: lo que se guardó al marcarlo. Es el mejor dato.
 * 2. `originalPrice` / `basePrice`: lo que la línea valía antes.
 * 3. El precio de la ficha del producto, que pasa quien llama.
 *
 * Devuelve 0 cuando no hay nada, y ese 0 es información: significa que este
 * regalo no se puede declarar.
 */
export function valorDeReferencia(item, precioDeCatalogo = 0) {
  const candidatos = [
    item?.bonificacionRefPrice,
    item?.originalPrice,
    item?.basePrice,
    precioDeCatalogo,
  ]
  for (const c of candidatos) {
    const n = numero(c)
    if (n > 0) return n
  }
  return 0
}

/**
 * Los campos que hay que ponerle a una línea regalada para que SUNAT la acepte.
 *
 * @param {object} item             la línea del carrito
 * @param {number} precioDeCatalogo el precio del producto en su ficha, si lo hay
 * @returns {object} campos para mezclar en la línea, o `{}` si no se puede
 */
export function bonificacionParaSunat(item, precioDeCatalogo = 0) {
  if (!item?.isBonificacion) return {}
  const ref = valorDeReferencia(item, precioDeCatalogo)
  const cant = numero(item.quantity)
  if (ref <= 0 || cant <= 0) return {}
  return {
    unitPrice: ref,
    subtotal: 0,
    itemDiscount: Number((ref * cant).toFixed(2)),
    itemDiscountType: 'amount',
    isBonificacion: true,
  }
}

/**
 * ¿Esta línea se va a poder emitir?
 *
 * Un regalo del que no se sabe el valor NO se puede declarar. Se responde acá,
 * y no en la pantalla, para que la revisión previa y el armado del comprobante
 * usen exactamente el mismo criterio.
 */
export function regaloSinValor(item, precioDeCatalogo = 0) {
  if (!item?.isBonificacion) return false
  return valorDeReferencia(item, precioDeCatalogo) <= 0
}

/**
 * El tope de comprobantes al mes cuando un proceso automático va a aplicar el
 * del plan.
 *
 * Gemelo de `src/utils/topeDeComprobantes.js` — el front y las functions se
 * empaquetan por separado y no pueden compartir el módulo, pero el criterio
 * tiene que ser el mismo. Si cambia uno, cambia el otro.
 *
 * Hay clientes con condiciones heredadas: pagan S/ 19.90 y tienen ilimitado, o
 * pagan lo mismo y tienen 500 mientras otro tiene 100. Ese número lo fija el
 * admin en la ficha y es parte del acuerdo con el cliente, no una consecuencia
 * del plan. `topeFijadoPorAdmin` es la marca que lo dice.
 *
 * ILIMITADO ES -1, y es el valor más alto posible.
 */

/** Ilimitado (-1) gana siempre; si no, el número más alto. */
export function elTopeMasAlto(a, b) {
  const na = Number.isFinite(a) ? a : null
  const nb = Number.isFinite(b) ? b : null
  if (na === null) return nb
  if (nb === null) return na
  if (na === -1 || nb === -1) return -1
  return Math.max(na, nb)
}

/** ¿A esta cuenta le fijaron el tope a mano? */
export function tieneTopeFijado(suscripcion) {
  return suscripcion?.topeFijadoPorAdmin === true
}

/**
 * El tope que debe quedar cuando un proceso automático (la renovación de un
 * cliente de intermediario, el upgrade que llega por el webhook de Flow) iba a
 * escribir el del plan.
 *
 * Con el tope fijado se queda el MAYOR de los dos: así un cliente que compra un
 * plan mejor lo aprovecha, y uno con tope pactado alto no lo pierde porque su
 * plan del catálogo diga menos.
 *
 * @returns {number|null} el tope a escribir, o `null` para NO tocar el campo.
 */
export function topeAlAplicarPlan({ suscripcion, topeDelPlan }) {
  if (!tieneTopeFijado(suscripcion)) return topeDelPlan ?? null
  const fijado = suscripcion?.limits?.maxInvoicesPerMonth
  const mayor = elTopeMasAlto(fijado, topeDelPlan)
  return mayor === fijado ? null : mayor
}

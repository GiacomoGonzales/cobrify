/**
 * El tope de comprobantes al mes de una cuenta, cuando cambia el plan.
 *
 * Hay clientes con condiciones heredadas: pagan S/ 19.90 y tienen ilimitado,
 * o pagan lo mismo y tienen 500 mientras otro tiene 100. Ese número lo fija el
 * admin en la ficha y **es parte del acuerdo con el cliente**, no una
 * consecuencia del plan que figure en el sistema.
 *
 * Hasta ahora, al guardar el tope solo se escribía el número. Después nadie
 * podía distinguir "500 porque es el default del plan" de "500 porque lo
 * decidí yo", así que tres caminos lo pisaban sin culpa al renovar o cambiar
 * de plan: `registerPayment`, la renovación de clientes de intermediarios y el
 * webhook de Flow en los upgrades.
 *
 * `topeFijadoPorAdmin` es esa marca. Con ella puesta, el tope solo lo cambia
 * el admin desde la ficha.
 *
 * ILIMITADO ES -1, y es el valor más alto posible: cualquier comparación tiene
 * que tratarlo como el máximo, no como un número negativo.
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
 * Los `limits` que hay que guardar cuando se registra un pago.
 *
 * - **Mismo plan**: se conservan los del documento. Es lo que ya se hacía y
 *   protege a los clientes antiguos.
 * - **Cambio de plan**: manda el catálogo, porque es un contrato nuevo... salvo
 *   el tope de comprobantes si está fijado a mano: ahí se queda **el mayor de
 *   los dos**. Así un cliente con tope fijo de 500 que compra el Ilimitado se
 *   queda ilimitado (no se le quita lo que pagó), y uno con tope fijo de 2000
 *   que pasa a un plan de 500 conserva sus 2000 (no se le quita lo pactado).
 *
 * Los addons no pasan por acá: suman sobre lo que la cuenta tenga en ese
 * momento, que es lo correcto — si compró 200 comprobantes extra, son 200 más.
 */
export function limitesAlRegistrarPago({ suscripcion, limitesDelPlan, esMismoPlan }) {
  const delDoc = suscripcion?.limits
  if (esMismoPlan) return delDoc || limitesDelPlan
  const base = limitesDelPlan || delDoc
  if (!tieneTopeFijado(suscripcion)) return base
  return {
    ...base,
    maxInvoicesPerMonth: elTopeMasAlto(
      delDoc?.maxInvoicesPerMonth,
      base?.maxInvoicesPerMonth
    ),
  }
}

/**
 * El tope que debe quedar cuando un proceso automático (la renovación de un
 * cliente de intermediario, el upgrade que llega por el webhook de Flow) va a
 * aplicar el del plan.
 *
 * @returns {number|null} el tope a escribir, o `null` para NO tocar el campo.
 */
export function topeAlAplicarPlan({ suscripcion, topeDelPlan }) {
  if (!tieneTopeFijado(suscripcion)) return topeDelPlan ?? null
  const fijado = suscripcion?.limits?.maxInvoicesPerMonth
  const mayor = elTopeMasAlto(fijado, topeDelPlan)
  // Si el fijado ya es el más alto, no hay nada que escribir.
  return mayor === fijado ? null : mayor
}

/**
 * EL PROGRAMA DE REFERIDOS, en un solo sitio.
 *
 * Las reglas las decidió Giacomo el 09-set-2026 y viven acá y en ningún otro
 * lado: son números que se van a querer cambiar —subir un mes, sumar un plan—
 * y buscarlos repartidos entre el servidor y tres pantallas es como se termina
 * regalando de más sin darse cuenta.
 *
 * Cómo funciona, en una línea: **el que trae gana un mes cuando el que llega
 * PAGA**, y el que llega arranca con meses de regalo según el plan.
 *
 * Lo de "cuando paga" no es un detalle administrativo, es lo que sostiene el
 * programa. Premiar al registrarse invita a referirse a uno mismo con otro
 * correo y otro RUC; premiando al pagar, para ganarte un mes tendrías que
 * pagarme uno.
 */

/**
 * Meses que se le regalan AL REFERIDO, por plan contratado.
 *
 * Los ilimitados (mensual y anual) quedan fuera a propósito: son los de más
 * margen ajustado. Un plan que no esté en esta tabla no da regalo, así que
 * agregar uno nuevo al catálogo NO lo mete al programa por descuido.
 */
export const MESES_DE_REGALO = {
  basico_mensual: 1,   // S/ 19.90 → paga 1 mes y usa 2
  mensual: 1,          // S/ 29.90 → paga 1 mes y usa 2
  semestral: 1,        // S/ 149.90 → 7 meses
  anual: 2,            // S/ 199.90 → 14 meses
}

/** Lo que gana el que refiere, una vez por cada referido que paga. */
export const MESES_PARA_QUIEN_REFIERE = 1

/** Sin tope: quien traiga veinte clientes que pagan se lleva veinte meses. */
export const TOPE_DE_MESES = null

/** ¿Este plan entra al programa? */
export function aplicaAlPrograma(planId) {
  return Object.prototype.hasOwnProperty.call(MESES_DE_REGALO, String(planId || ''))
}

/** Meses de regalo del referido para ese plan. Cero si el plan no aplica. */
export function mesesDeRegalo(planId) {
  return MESES_DE_REGALO[String(planId || '')] || 0
}

/**
 * Los meses van DE ENTRADA, no al final del periodo.
 *
 * Para el cliente da exactamente lo mismo —14 meses son 14 meses—, pero
 * ponerlos al final obliga a que alguien se acuerde, un año después, de
 * extenderle la cuenta. Eso es lo que se olvida y termina en un reclamo.
 */
export function mesesTotales(planId, mesesDelPlan) {
  return Number(mesesDelPlan || 1) + mesesDeRegalo(planId)
}

/** El texto para el cliente, que es lo que hay que poder decirle sin pensar. */
export function textoDelRegalo(planId, mesesDelPlan) {
  const regalo = mesesDeRegalo(planId)
  if (!regalo) return ''
  const total = mesesTotales(planId, mesesDelPlan)
  const uno = regalo === 1
  return `${uno ? '1 mes' : `${regalo} meses`} de regalo: pagas ${mesesDelPlan} y usas ${total}.`
}

/**
 * EL CUPO Y EL CICLO DE CADA RUC COBRADO APARTE.
 *
 * Con "Cobrar cada RUC aparte" (`subscriptions.cobroPorRuc`), cada RUC
 * adicional es un sistema propio: paga su mensualidad, tiene su vencimiento
 * (`rucsCobrados.{emisorId}`) y sus propios comprobantes del mes
 * (`usage.porRuc.{emisorId}`). El RUC principal —el negocio— sigue usando el
 * cupo y el ciclo de la cuenta, como siempre. Sin la casilla, todo va a la
 * cuenta, también lo que emiten los RUC adicionales (un cliente con todos sus
 * RUC incluidos no cambia nada).
 *
 * Vive en `functions/` porque lo usan el servidor (qué contador suma cada
 * comprobante, a quién reiniciar) y el POS (cuánto le queda al RUC elegido),
 * igual que `emisorDelComprobante.js`.
 */

import { EMISOR_PRINCIPAL, emisorIdDe } from './emisorDelComprobante.js'
import { tocaResetear } from './cicloMensual.js'

/** El cobro de este RUC si se cobra aparte, o null si lo cubre la cuenta. */
export function rucCobradoAparte(suscripcion, emisorId) {
  if (suscripcion?.cobroPorRuc !== true) return null
  if (!emisorId || emisorId === EMISOR_PRINCIPAL) return null
  return suscripcion?.rucsCobrados?.[emisorId] || null
}

/**
 * A qué contador suma este comprobante.
 *
 * @returns {{ porRuc: boolean, emisorId: string|null }} — `porRuc: true` suma a
 *   `usage.porRuc.{emisorId}`; si no, a `usage.invoicesThisMonth` de la cuenta.
 */
export function contadorDelDocumento(suscripcion, documento) {
  const emisorId = emisorIdDe(documento)
  return rucCobradoAparte(suscripcion, emisorId)
    ? { porRuc: true, emisorId }
    : { porRuc: false, emisorId: null }
}

/**
 * Los RUC cobrados aparte cuyo contador toca volver a cero hoy.
 *
 * Mismo criterio que la cuenta (`tocaResetear`), pero sobre el ciclo del RUC:
 * arranca el día en que se pagó (`inicio`, o `ultimoPago` en los cobros
 * anteriores a que existiera) y se reinicia cada mes desde esa fecha.
 */
export function rucsPorReiniciar(suscripcion, hoy) {
  if (suscripcion?.cobroPorRuc !== true) return []
  return Object.entries(suscripcion?.rucsCobrados || {})
    .filter(([, cobro]) => cobro && tocaResetear({
      currentPeriodStart: cobro.inicio || cobro.ultimoPago,
      lastCounterReset: cobro.ultimoReset || null,
    }, hoy).resetear)
    .map(([emisorId]) => emisorId)
}

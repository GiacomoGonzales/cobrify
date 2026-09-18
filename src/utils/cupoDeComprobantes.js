/**
 * El cupo mensual de comprobantes: cuánto queda y qué se puede emitir.
 *
 * El cupo va por **mes desde el alta**, no por mes calendario (ver
 * `functions/src/utils/cicloMensual.js`), y el bono de comprobantes suma al
 * tope del plan.
 *
 * ---
 *
 * POR QUÉ SE BLOQUEA EN EL POS Y NO EN EL SERVIDOR
 *
 * Hasta junio de 2026 el servidor rechazaba el envío al superarse el cupo,
 * pero **el comprobante ya estaba creado**: se le había asignado número y
 * quedaba marcado como `rejected` sin haber llegado nunca a SUNAT. Eso dejaba
 * huecos en la correlatividad y una pila de rechazados para reenviar a mano.
 * Por eso se quitó el bloqueo (commit c8847231) y quedó solo un aviso.
 *
 * El problema no era bloquear: era bloquear TARDE. Ahora se impide antes de
 * crear el documento, así no se consume número ni queda nada que reenviar.
 *
 * ---
 *
 * QUÉ SE BLOQUEA Y QUÉ NO
 *
 * Se bloquean los comprobantes que son una **venta nueva**: factura, boleta y
 * las dos guías.
 *
 * NO se bloquean las **correcciones** —nota de crédito, nota de débito y la
 * comunicación de baja— aunque también viajen a SUNAT. Una corrección no suma
 * una venta: arregla una que ya contó en el cupo. Y la baja tiene un plazo de
 * 7 días que corre igual: impedirla dejaría al negocio con un comprobante que
 * debe anular, no puede, y termina declarando algo que sabe que está mal.
 *
 * Tampoco se bloquean las notas de venta ni las cotizaciones: son internas y
 * no viajan a SUNAT. Son las que le quedan al negocio para seguir trabajando.
 */

import { rucCobradoAparte } from '../../functions/src/utils/cupoPorRuc.js'
import { PLANES_VENDIBLES } from '@/data/planes'
import { estadoDelRuc } from '@/utils/cobroPorRuc'

/** Desde este porcentaje del cupo se avisa que se está por acabar. */
export const AVISAR_DESDE = 0.9

/** Ventas nuevas: estas se bloquean cuando el cupo se agota. */
const CONSUMEN_CUPO = ['factura', 'boleta', 'guia_remision', 'guia_transportista']

/**
 * @returns {{ilimitado: boolean, tope: number, usados: number, restantes: number,
 *   agotado: boolean, porAgotarse: boolean}}
 */
export function cupoDeComprobantes(subscription, { esAdmin = false } = {}) {
  const topePlan = subscription?.limits?.maxInvoicesPerMonth
  const usados = subscription?.usage?.invoicesThisMonth || 0

  // Ilimitado es -1. Un tope ausente tampoco limita: sin dato no se corta la
  // facturación de nadie.
  if (esAdmin || typeof topePlan !== 'number' || topePlan === -1) {
    return { ilimitado: true, tope: -1, usados, restantes: Infinity, agotado: false, porAgotarse: false }
  }

  const tope = topePlan + (subscription?.bonusInvoices || 0)
  const restantes = Math.max(0, tope - usados)
  return {
    ilimitado: false,
    tope,
    usados,
    restantes,
    agotado: usados >= tope,
    porAgotarse: tope > 0 && usados < tope && usados >= tope * AVISAR_DESDE,
  }
}

/**
 * El cupo del RUC con el que se va a emitir.
 *
 * Con "Cobrar cada RUC aparte", un RUC adicional tiene su propio tope —el de
 * su plan: 1000 en el Mensual—, su propio contador (`usage.porRuc`) y su
 * propio vencimiento: si su mensualidad venció no emite facturas ni boletas,
 * aunque la cuenta esté al día. El principal, o un RUC sin cobro aparte, usa el
 * cupo de la cuenta como siempre (ver functions/src/utils/cupoPorRuc.js).
 *
 * @returns lo mismo que cupoDeComprobantes, más `vencido`, `vence` y
 *   `nombreRuc` cuando es de un RUC cobrado aparte.
 */
export function cupoDelRuc(subscription, emisorId, { esAdmin = false } = {}) {
  const cobro = rucCobradoAparte(subscription, emisorId)
  if (!cobro) return cupoDeComprobantes(subscription, { esAdmin })

  const usados = subscription?.usage?.porRuc?.[emisorId] || 0
  const nombreRuc = cobro.nombre || cobro.ruc || 'adicional'
  const vencido = !esAdmin && estadoDelRuc(cobro).clave === 'vencido'
  const topePlan = PLANES_VENDIBLES[cobro.plan]?.limits?.maxInvoicesPerMonth
  if (esAdmin || typeof topePlan !== 'number' || topePlan === -1) {
    return { ilimitado: true, tope: -1, usados, restantes: Infinity, agotado: false, porAgotarse: false, vencido, vence: cobro.vence, nombreRuc }
  }

  const restantes = Math.max(0, topePlan - usados)
  return {
    ilimitado: false,
    tope: topePlan,
    usados,
    restantes,
    agotado: usados >= topePlan,
    porAgotarse: topePlan > 0 && usados < topePlan && usados >= topePlan * AVISAR_DESDE,
    vencido,
    vence: cobro.vence,
    nombreRuc,
  }
}

const fechaCorta = (v) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null
  return d && !isNaN(d) ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : ''
}

// Sin "renuévala": en la app de iPhone ningún texto puede empujar a pagar por
// fuera de la App Store (Guideline 3.1.1, ver MainLayout desde el 12-set), y de
// todas formas la reactivación se hace escribiéndole a Cobrify.
const motivoDeVencido = (cupo) =>
  `La mensualidad del RUC ${cupo.nombreRuc} venció${cupo.vence ? ` el ${fechaCorta(cupo.vence)}` : ''}. `
  + 'Mientras tanto puede emitir con el RUC principal o usar notas de venta; escríbenos para reactivarlo.'

/** ¿Este tipo de documento se queda sin poder emitirse al agotarse el cupo? */
export function consumeCupo(documentType) {
  return CONSUMEN_CUPO.includes(documentType)
}

/**
 * ¿Se puede emitir este documento con el cupo que hay?
 *
 * @returns {{puede: boolean, motivo: string|null}}
 */
export function puedeEmitirse(documentType, cupo) {
  if (cupo?.vencido && consumeCupo(documentType)) return { puede: false, motivo: motivoDeVencido(cupo) }
  if (!cupo || cupo.ilimitado || !cupo.agotado) return { puede: true, motivo: null }
  if (!consumeCupo(documentType)) return { puede: true, motivo: null }
  return {
    puede: false,
    motivo: `Se acabaron los comprobantes del mes (${cupo.usados} de ${cupo.tope}). `
      + 'Puede seguir vendiendo con notas de venta y cotizaciones mientras amplía su plan.',
  }
}

/** El aviso a mostrar, o null si no hay nada que decir. */
export function avisoDeCupo(cupo) {
  if (cupo?.vencido) return { tono: 'error', texto: motivoDeVencido(cupo) }
  if (!cupo || cupo.ilimitado) return null
  // Con un RUC cobrado aparte, el cupo es SUYO: se dice de cuál.
  const deQuien = cupo.nombreRuc ? ` del RUC ${cupo.nombreRuc}` : ''
  if (cupo.agotado) {
    return {
      tono: 'error',
      texto: `Se acabaron los comprobantes de este mes${deQuien} (${cupo.usados} de ${cupo.tope}). `
        + 'Solo puede emitir notas de venta y cotizaciones hasta que amplíe su plan.',
    }
  }
  if (cupo.porAgotarse) {
    return {
      tono: 'aviso',
      texto: `Le ${cupo.restantes === 1 ? 'queda 1 comprobante' : `quedan ${cupo.restantes} comprobantes`} este mes${deQuien} `
        + `(${cupo.usados} de ${cupo.tope}).`,
    }
  }
  return null
}

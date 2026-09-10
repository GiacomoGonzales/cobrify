/**
 * Las notas de crédito de una factura, y cuánto le queda por acreditar.
 *
 * SUNAT no suma las notas de crédito de una factura: acepta cada una por
 * separado mientras no pase, ELLA SOLA, del total de la factura (regla 3286).
 * Tres notas de S/ 3,000 contra una factura de S/ 3,000 entran las tres, y la
 * venta queda descontada tres veces.
 *
 * Le pasó a IS ALFA (10-set-2026) con la F002-00000002: la primera nota se
 * quedó "rechazada" por un error de firma del proveedor (nunca llegó a SUNAT),
 * y se emitieron tres más encima porque nada decía que la factura ya tenía una
 * nota en curso. Una nota de crédito aceptada solo se da de baja dentro de los
 * 7 días; después, lo único que la neutraliza es una nota de débito.
 *
 * Criterio único para la pantalla de la nota de crédito (antes de emitir y al
 * "Editar y reemitir") y para el "Reenviar" de Ventas.
 */

const dos = (n) => Math.round((Number(n) || 0) * 100) / 100
const limpio = (v) => String(v ?? '').trim()

export const esNotaDeCredito = (d) => limpio(d?.documentType).replace('-', '_') === 'nota_credito'

/** Una nota que ya no cuenta: dada de baja en SUNAT o anulada en el sistema. */
export const notaAnulada = (n) =>
  n?.sunatStatus === 'voided' || ['voided', 'cancelled', 'anulado'].includes(n?.status)

/**
 * ¿Esta nota modifica esta factura?
 *
 * Por el id de Firestore, que es lo que guardan las notas desde hace meses. Las
 * viejas solo traen el número: ahí se exige además el mismo cliente, porque una
 * nota "externa" (de un comprobante de otro sistema) puede repetir el número de
 * una factura de acá.
 */
export const esNotaDe = (nota, factura) => {
  if (!factura || !esNotaDeCredito(nota)) return false
  if (nota.referencedInvoiceFirestoreId) return nota.referencedInvoiceFirestoreId === factura.id
  return Boolean(limpio(nota.referencedDocumentId)) &&
    limpio(nota.referencedDocumentId) === limpio(factura.number) &&
    limpio(nota.customer?.documentNumber) === limpio(factura.customer?.documentNumber)
}

/** Las notas vigentes de una factura, sin las anuladas y sin la que se está editando. */
export function notasDeLaFactura(factura, documentos, { salvo = null } = {}) {
  return (documentos || []).filter(d => d && d.id !== salvo && esNotaDe(d, factura) && !notaAnulada(d))
}

/**
 * Lo acreditado y lo que queda.
 *
 * `enCurso` son las creadas que SUNAT todavía no tiene: pendientes, en envío,
 * firmadas, sin enviar o rechazadas. Una rechazada no existe para SUNAT, pero
 * se cuenta igual: se reenvía o se corrige con "Editar y reemitir", y si se
 * emite otra encima, al reenviarla quedan dos.
 */
export function resumenDeNotas(factura, notas) {
  const aceptadas = (notas || []).filter(n => n.sunatStatus === 'accepted')
  const enCurso = (notas || []).filter(n => n.sunatStatus !== 'accepted')
  const acreditado = dos(aceptadas.reduce((a, n) => a + (Number(n.total) || 0), 0))
  return { aceptadas, enCurso, acreditado, saldo: Math.max(0, dos(dos(factura?.total) - acreditado)) }
}

const monto = (valor, moneda) =>
  `${limpio(moneda).toUpperCase() === 'USD' ? '$' : 'S/'} ${dos(valor).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const numeros = (notas) => notas.map(n => n.number).join(', ')

const ESTADO_EN_PALABRAS = {
  rejected: 'quedó rechazada',
  pending: 'está pendiente de envío',
  sending: 'se está enviando',
  signed: 'está firmada y sin respuesta de SUNAT',
  SIGNED: 'está firmada y sin respuesta de SUNAT',
  not_sent: 'no se envió a SUNAT',
}

/**
 * Por qué NO se puede emitir (o reenviar) una nota de este monto para esta
 * factura, o null si se puede.
 *
 * @param {object} factura     el comprobante que se modifica (id, number, total, currency)
 * @param {Array}  notas       `notasDeLaFactura(...)`, sin la nota que se emite o reenvía
 * @param {number} totalNuevo  el total de la nota que se quiere emitir
 */
export function motivoParaNoEmitirNota(factura, notas, totalNuevo) {
  const { aceptadas, enCurso, acreditado, saldo } = resumenDeNotas(factura, notas)
  if (aceptadas.length > 0 && saldo <= 0.01) {
    return `La ${factura.number} ya está anulada con la nota de crédito ${numeros(aceptadas)}, aceptada por SUNAT. Otra nota la descontaría dos veces.`
  }
  if (enCurso.length > 0) {
    const n = enCurso[0]
    return `La ${factura.number} ya tiene la nota de crédito ${n.number}, que ${ESTADO_EN_PALABRAS[n.sunatStatus] || 'no tiene respuesta de SUNAT'}. Termina esa antes de emitir otra: desde Ventas, reenvíala o corrígela con "Editar y reemitir". Si se emite una nueva y después esa se envía, SUNAT tendría dos notas por la misma operación.`
  }
  if (Number(totalNuevo) > saldo + 0.01) {
    return `A la ${factura.number} solo le quedan ${monto(saldo, factura.currency)} por acreditar: ya tiene ${numeros(aceptadas)} por ${monto(acreditado, factura.currency)}.`
  }
  return null
}

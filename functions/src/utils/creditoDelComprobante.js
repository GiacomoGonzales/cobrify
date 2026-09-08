/**
 * El SALDO que el comprador le va a pagar de verdad al proveedor en un
 * comprobante al crédito, y el detalle de sus cuotas.
 *
 * Del total se descuentan la DETRACCIÓN y la RETENCIÓN. Las dos son plata que
 * el comprador NO le entrega al proveedor: la detracción la deposita en el
 * Banco de la Nación y la retención se la paga a SUNAT. Por eso el propio SEE
 * de SUNAT imprime el "Monto neto pendiente de pago" ya descontadas, y ese es
 * el número que el área contable del comprador cruza contra su orden de pago.
 *
 * Vive acá porque las functions no pueden importar de `src`, pero `src` sí
 * puede importar de acá — el mismo camino que usa `src/data/rubros.js`. Lo
 * leen los DOS generadores de XML (el que se envía a SUNAT y el que el usuario
 * descarga para su contador), el PDF y el ticket térmico. Si cada uno lo
 * calculara por su cuenta, el papel y el XML dirían cifras distintas.
 *
 * Origen: el 8-set-2026 el área contable del IGP observó una factura de SUPER
 * LINK afecta a la retención del 3%. Faltaba el bloque del crédito, y el monto
 * declarado era el total y no el saldo.
 */

/** Redondeo a céntimos. Todo lo que sale de acá pasa por él. */
const dos = (n) => Math.round((Number(n) || 0) * 100) / 100

export function esAlCredito(comprobante) {
  return (comprobante?.paymentType || 'contado') === 'credito'
}

/** La detracción, en la moneda del comprobante. 0 si no aplica. */
export function detraccionDeComprobante(comprobante) {
  const aplica = comprobante?.hasDetraction &&
    comprobante?.detractionType &&
    Number(comprobante?.detractionAmount) > 0
  return aplica ? dos(comprobante.detractionAmount) : 0
}

/** La retención del IGV, en la moneda del comprobante. 0 si no aplica. */
export function retencionDeComprobante(comprobante) {
  const aplica = comprobante?.hasRetencion && Number(comprobante?.retencionAmount) > 0
  return aplica ? dos(comprobante.retencionAmount) : 0
}

/**
 * El saldo a pagar: total menos detracción menos retención.
 *
 * El total se recibe como parámetro porque cada generador lo tiene calculado a
 * su manera: el XML que se envía lo toma del comprobante y el que se descarga
 * lo recalcula desde las líneas.
 */
export function montoNetoPendiente(comprobante, total) {
  const neto = dos(total) - detraccionDeComprobante(comprobante) - retencionDeComprobante(comprobante)
  return dos(Math.max(0, neto))
}

/**
 * Las cuotas ya ajustadas al saldo: `[{ numero, vencimiento, monto }]`.
 *
 * Las cuotas se escalan para que sumen exactamente el saldo. El POS siembra la
 * primera con el total menos la detracción, y quien las escribe a mano puede
 * hacerlo sobre el total o sobre el saldo; con el factor, todas esas formas
 * terminan en el mismo número. La última absorbe el redondeo porque SUNAT
 * valida que la suma de las cuotas cuadre con el monto del crédito.
 *
 * Sin cronograma, un crédito con fecha pactada es UNA cuota: SUNAT exige
 * Cuota001 igual, y es justo la fila que pide el área contable del comprador.
 */
export function cuotasDeCredito(comprobante, total) {
  if (!esAlCredito(comprobante)) return []
  const neto = montoNetoPendiente(comprobante, total)
  const lista = Array.isArray(comprobante?.paymentInstallments) ? comprobante.paymentInstallments : []

  if (lista.length === 0) {
    const vence = comprobante?.paymentDueDate || null
    return vence ? [{ numero: 1, vencimiento: vence, monto: neto }] : []
  }

  const suma = lista.reduce((s, c) => s + (Number(c?.amount) || 0), 0)
  const factor = suma > 0 ? neto / suma : 0
  const cuotas = lista.map((c, i) => ({
    numero: Number(c?.number) || i + 1,
    vencimiento: c?.dueDate || null,
    monto: dos((Number(c?.amount) || 0) * factor),
  }))
  const desvio = dos(neto - cuotas.reduce((s, c) => s + c.monto, 0))
  if (desvio !== 0) {
    const ultima = cuotas[cuotas.length - 1]
    ultima.monto = dos(ultima.monto + desvio)
  }
  return cuotas
}

/**
 * Todo junto para quien imprime el bloque "Información del crédito", o `null`
 * si el comprobante no es al crédito o no tiene ni cronograma ni vencimiento.
 */
export function infoDeCredito(comprobante, total) {
  if (!esAlCredito(comprobante)) return null
  const cuotas = cuotasDeCredito(comprobante, total)
  if (cuotas.length === 0) return null
  return {
    neto: montoNetoPendiente(comprobante, total),
    cuotas,
    totalCuotas: cuotas.length,
  }
}

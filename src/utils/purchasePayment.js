/**
 * ¿Una compra está saldada?
 *
 * POR QUÉ EXISTE (caso real, 12-ago-2026): una usuaria reportó una compra que
 * mostraba "100%" y "S/ 447.83 / S/ 447.83", no sumaba nada a Por Pagar... pero
 * seguía contada entre las pendientes y sin marcarse como pagada.
 *
 * La causa es aritmética de punto flotante. Al registrar un abono, el estado se
 * decidía con `nuevoPagado >= total` SIN redondear. Sumar importes con decimales
 * deja residuos —447.82999999999996 en vez de 447.83— y esa comparación da
 * falso. El monto pendiente sí cuadraba en cero al redondear para mostrarlo, de
 * ahí que el 100% se viera bien y el estado no.
 *
 * Este helper decide mirando el SALDO redondeado a céntimos, que es la unidad
 * real del dinero: si no queda ni un céntimo por pagar, está saldada. Se usa
 * tanto al guardar como al listar, así que las compras que ya quedaron mal
 * grabadas se muestran bien igual, sin necesidad de reparar la base.
 *
 * Ojo: manda el SALDO, no el campo `paymentStatus` guardado. Es a propósito —
 * ese campo es justamente el que puede estar mal.
 */

/** Saldo pendiente de una compra, redondeado a céntimos. Nunca negativo. */
export const getPurchaseBalance = (purchase) => {
  const total = Number(purchase?.total) || 0
  const pagado = Number(purchase?.paidAmount) || 0
  const saldo = Math.round((total - pagado) * 100) / 100
  return saldo > 0 ? saldo : 0
}

/**
 * ¿Está completamente pagada?
 *
 * Las compras al CONTADO se consideran saldadas siempre: no generan deuda.
 */
export const isPurchaseFullyPaid = (purchase) => {
  if (!purchase) return false
  if (purchase.paymentType !== 'credito') return true
  return getPurchaseBalance(purchase) === 0
}

/** ¿Queda algo por pagar? Es el complemento exacto de la anterior. */
export const isPurchasePending = (purchase) =>
  purchase?.paymentType === 'credito' && !isPurchaseFullyPaid(purchase)

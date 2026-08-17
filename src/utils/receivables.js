/**
 * Qué comprobantes cuentan como "por cobrar" y cuánto se debe de cada uno.
 *
 * Vive acá porque lo consultan dos pantallas que deben decir lo mismo: el
 * reporte de Pagos Pendientes (Ventas) y las proyecciones de Flujo de Caja.
 * Estaban escritas por separado y se separaron: el reporte descartaba anuladas
 * y convertidas, Flujo de Caja no. Un usuario anuló una nota de venta con
 * S/3,700 pendientes y el monto seguía apareciendo en "Por Cobrar" (reporte de
 * 31-jul-2026).
 */

/**
 * Saldo pendiente del comprobante.
 *
 * `balance` es el campo que mantiene el sistema al registrar cobros. Solo si no
 * existe se cae a "debe todo" para las marcadas como pendientes; una parcial sin
 * balance devuelve 0 en vez de inventar un monto.
 */
export const getPendingAmount = (inv) => {
  const bal = Number(inv?.balance)
  if (Number.isFinite(bal)) return bal
  if (inv?.paymentStatus === 'pending') return Number(inv?.total) || 0
  return 0
}

/**
 * ¿Este comprobante representa dinero que todavía se espera cobrar?
 *
 * Ojo con las anuladas: al anular, `status` pasa a 'cancelled'/'voided' pero
 * **`paymentStatus` se queda como estaba** ('partial', 'pending'). Mirar solo
 * `paymentStatus` hace que una nota anulada siga contando como cobrable para
 * siempre. Por eso el estado del documento se revisa PRIMERO.
 *
 * Las convertidas tampoco cuentan: la deuda la lleva el comprobante que las
 * reemplazó, y sumar las dos sería contar lo mismo dos veces.
 */
export const isPendingInvoice = (inv) => {
  if (!inv) return false
  const tipo = inv.documentType
  if (tipo !== 'nota_venta' && tipo !== 'factura' && tipo !== 'boleta') return false
  if (inv.status === 'cancelled' || inv.status === 'voided') return false
  if (inv.sunatStatus === 'voided' || inv.sunatStatus === 'voiding') return false
  if (inv.archived === true) return false
  if (inv.convertedTo) return false
  if (inv.paymentStatus !== 'pending' && inv.paymentStatus !== 'partial') return false
  return getPendingAmount(inv) > 0.01
}

/**
 * Los pagos REALES de un comprobante, para imprimirlos y mostrarlos.
 *
 * ── El bug que arregla ───────────────────────────────────────────────────────
 * Hay DOS lugares donde vive un pago y significan cosas distintas:
 *   - `payments[]`      → lo que el cajero eligió AL EMITIR. No se actualiza nunca.
 *   - `paymentHistory[]`→ los cobros REALES, incluidos los registrados después.
 *
 * Los tickets calculaban "Forma de pago" y "Saldo pendiente" desde `payments[]`,
 * así que una nota de venta emitida con S/20 de adelanto seguía imprimiendo
 * "Yape: 20.00 / Saldo Pendiente: 60.00" AUNQUE el cliente ya hubiera pagado
 * todo — el historial de abajo mostraba los dos pagos y el bloque de arriba
 * seguía anclado al día de la emisión (reporte 3-ago-2026).
 *
 * Mismo criterio que ya usaban el cuadre de caja y los reportes: manda el
 * historial. Vive acá para que las cuatro impresiones no puedan discrepar.
 *
 * @returns {{ payments: Array<{method: string, amount: number}>, totalPaid: number,
 *             pending: number, isCredit: boolean, fromHistory: boolean }}
 */
export const getRealPayments = (invoice) => {
  const total = Number(invoice?.total) || 0
  const historial = Array.isArray(invoice?.paymentHistory) ? invoice.paymentHistory : []

  if (historial.length > 0) {
    const payments = historial.map(p => ({
      method: p.method || 'Efectivo',
      amount: Number(p.amount) || 0,
    }))
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    return {
      payments,
      totalPaid: Math.round(totalPaid * 100) / 100,
      // Se usa `balance` si el sistema lo mantiene: es la cifra que ya se muestra
      // en el resto de la app. Si no, se deriva del total.
      pending: Math.max(0, Math.round((total - totalPaid) * 100) / 100),
      isCredit: false,
      fromHistory: true,
    }
  }

  const emitidos = Array.isArray(invoice?.payments) ? invoice.payments : []
  if (emitidos.length > 0) {
    const payments = emitidos.map(p => ({
      method: p.method || 'Efectivo',
      amount: Number(p.amount) || 0,
    }))
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    return {
      payments,
      totalPaid: Math.round(totalPaid * 100) / 100,
      pending: Math.max(0, Math.round((total - totalPaid) * 100) / 100),
      // Sin plata registrada en ningún lado: es una venta al crédito.
      isCredit: totalPaid <= 0,
      fromHistory: false,
    }
  }

  // AL CRÉDITO: sin un solo pago registrado (ni historial ni payments[]) pero
  // con saldo pendiente. Se decide por `paymentStatus`/`balance`, que es lo
  // que el sistema mantiene de verdad, y NO por `paymentMethod`.
  //
  // Esta comprobación va ANTES de la estructura antigua a propósito: el POS
  // guarda las ventas al crédito con `paymentMethod: 'Efectivo'` (un fallback
  // que rellena el campo aunque no haya habido pago), así que al llegar a la
  // rama de abajo se imprimían como pagadas en efectivo — el ticket decía
  // "EFECTIVO S/ 48.00" en una venta que nadie pagó, y desaparecía el
  // "AL CRÉDITO / Saldo Pendiente" (reporte 17-ago-2026, N001-00000596).
  // Al mirar el estado real, esto también corrige las ya emitidas.
  const pendiente = getPendingAmount(invoice)
  const esperandoCobro = invoice?.paymentStatus === 'pending' || invoice?.paymentStatus === 'partial'
  if (esperandoCobro && pendiente > 0.01) {
    return {
      payments: [],
      totalPaid: Math.max(0, Math.round((total - pendiente) * 100) / 100),
      pending: pendiente,
      isCredit: true,
      fromHistory: false,
    }
  }

  // Estructura antigua: un solo método, sin desglose.
  if (invoice?.paymentMethod) {
    return {
      payments: [{ method: invoice.paymentMethod, amount: total }],
      totalPaid: total,
      pending: 0,
      isCredit: false,
      fromHistory: false,
    }
  }

  return { payments: [], totalPaid: 0, pending: total, isCredit: true, fromHistory: false }
}

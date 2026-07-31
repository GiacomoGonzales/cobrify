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

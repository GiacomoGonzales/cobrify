/**
 * Cuentas por cobrar contra Firestore.
 *
 * El reporte de Pagos Pendientes carga TODOS los comprobantes del negocio y
 * filtra en memoria. Para una tarjeta del Dashboard eso es demasiado: acá se
 * piden solo los que tienen saldo (una consulta por estado de pago, índice
 * simple) y el criterio de qué cuenta y cuánto se debe es el mismo de
 * siempre, el de utils/receivables.js.
 */
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isPendingInvoice, getPendingAmount } from '@/utils/receivables'

/** Comprobantes con saldo por cobrar (ya pasados por isPendingInvoice). */
export const getInvoicesPorCobrar = async (businessId) => {
  const q = query(
    collection(db, 'businesses', businessId, 'invoices'),
    where('paymentStatus', 'in', ['pending', 'partial']),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isPendingInvoice)
}

/**
 * Cuánto se debe, por moneda: nunca se suman soles con dólares.
 * @returns {{ PEN: number, USD: number }}
 */
export const totalPorCobrarPorMoneda = (invoices) =>
  (invoices || []).reduce((acc, inv) => {
    const moneda = String(inv.currency || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN'
    acc[moneda] += getPendingAmount(inv)
    return acc
  }, { PEN: 0, USD: 0 })

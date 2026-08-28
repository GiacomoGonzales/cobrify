import { db } from '@/lib/firebase'
import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, orderBy, limit, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { createExpense } from './expenseService'

/**
 * LIQUIDACIÓN DE COMISIONES.
 *
 * Sin esto, la comisión de un vendedor era un número que solo crecía: nadie
 * sabía qué se le había pagado ya y qué seguía debiéndose. Liquidar es cerrar
 * un período y dejar constancia.
 *
 * Dos ideas sostienen todo lo demás:
 *
 * 1. **Una venta se liquida UNA sola vez.** La liquidación guarda los ids de
 *    las ventas que incluyó, y lo pendiente se calcula descontando las ventas
 *    que ya entraron en alguna liquidación viva. Sin esto, liquidar dos veces
 *    el mismo mes pagaría dos veces.
 *
 * 2. **El importe se CONGELA al liquidar**, igual que la comisión se congela al
 *    vender. Si mañana cambia la configuración del vendedor, una liquidación ya
 *    hecha —y muchas veces ya pagada— no puede moverse sola.
 *
 * Colección: businesses/{businessId}/commissionPayouts
 *
 * Estados: 'pendiente' (calculada, aún no pagada) → 'pagada'. Y 'anulada' para
 * deshacer una liquidación mal hecha: sus ventas vuelven a quedar pendientes.
 *
 * Al marcar pagada se registra el GASTO en `gastos_ventas`, con el vendedor
 * adentro. Antes el gasto por comisiones no se vinculaba a nadie.
 */

const payoutsRef = (businessId) => collection(db, 'businesses', businessId, 'commissionPayouts')

export const PAYOUT_STATES = {
  pendiente: { label: 'Por pagar', tone: 'warning' },
  pagada: { label: 'Pagada', tone: 'success' },
  anulada: { label: 'Anulada', tone: 'muted' },
}

/** Las liquidaciones del negocio, de la más nueva a la más vieja. */
export const getCommissionPayouts = async (businessId, tope = 200) => {
  try {
    const snap = await getDocs(query(payoutsRef(businessId), orderBy('createdAt', 'desc'), limit(tope)))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar liquidaciones:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Los ids de venta que YA fueron liquidados (en liquidaciones no anuladas).
 *
 * Es lo que permite que "pendiente" signifique de verdad "todavía no se pagó".
 */
export const idsYaLiquidados = (payouts = []) => {
  const set = new Set()
  for (const p of payouts) {
    if (p?.status === 'anulada') continue
    for (const id of p?.invoiceIds || []) set.add(id)
  }
  return set
}

/**
 * Crear una liquidación.
 *
 * @param {string} businessId
 * @param {Object} datos
 * @param {string} datos.sellerId
 * @param {string} datos.sellerName
 * @param {Date}   datos.desde
 * @param {Date}   datos.hasta
 * @param {Array}  datos.invoiceIds  ventas incluidas
 * @param {number} datos.amount      comisión total, ya calculada
 * @param {number} datos.baseTotal   base sobre la que se calculó
 */
export const createCommissionPayout = async (businessId, datos) => {
  try {
    const amount = Number(datos.amount) || 0
    if (!datos.sellerId) return { success: false, error: 'Falta el vendedor' }
    if (!(amount > 0)) return { success: false, error: 'No hay comisión que liquidar en ese período' }
    if (!datos.invoiceIds?.length) return { success: false, error: 'No hay ventas en ese período' }

    const docRef = await addDoc(payoutsRef(businessId), {
      sellerId: datos.sellerId,
      sellerName: datos.sellerName || '',
      desde: Timestamp.fromDate(datos.desde),
      hasta: Timestamp.fromDate(datos.hasta),
      invoiceIds: datos.invoiceIds,
      ventas: datos.invoiceIds.length,
      baseTotal: Math.round((Number(datos.baseTotal) || 0) * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      status: 'pendiente',
      notes: (datos.notes || '').trim(),
      createdAt: serverTimestamp(),
      createdBy: datos.createdBy || null,
      createdByName: datos.createdByName || '',
      paidAt: null,
      paymentMethod: null,
      expenseId: null,
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear liquidación:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar una liquidación como pagada y dejar el gasto registrado.
 *
 * El gasto se crea con un id derivado del de la liquidación
 * (`clientRequestId`), así que si el botón se toca dos veces —o falla la
 * actualización y se reintenta— el gasto se sobrescribe en vez de duplicarse.
 * Pagar dos veces la misma comisión en el flujo de caja sería un descuadre
 * difícil de encontrar después.
 */
export const marcarPayoutPagado = async (businessId, payout, { paymentMethod = 'efectivo', paidBy = null, paidByName = '' } = {}) => {
  try {
    let expenseId = payout.expenseId || null

    if (!expenseId) {
      const gasto = await createExpense(businessId, {
        clientRequestId: `comision-${payout.id}`,
        amount: payout.amount,
        category: 'gastos_ventas',
        description: `Comisión de ${payout.sellerName || 'vendedor'}`,
        date: new Date().toISOString().split('T')[0],
        paymentMethod,
        reference: `LIQ-${payout.id.slice(0, 8).toUpperCase()}`,
        supplier: payout.sellerName || '',
        notes: `Liquidación de ${payout.ventas} venta(s).`,
        createdBy: paidBy || 'unknown',
      })
      expenseId = gasto?.id || `comision-${payout.id}`
    }

    await updateDoc(doc(payoutsRef(businessId), payout.id), {
      status: 'pagada',
      paidAt: serverTimestamp(),
      paymentMethod,
      paidBy: paidBy || null,
      paidByName: paidByName || '',
      expenseId,
      updatedAt: serverTimestamp(),
    })

    return { success: true, expenseId }
  } catch (error) {
    console.error('Error al marcar liquidación pagada:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Anular una liquidación.
 *
 * Sus ventas vuelven a contar como pendientes. NO se borra el gasto: si ya se
 * pagó, ese dinero salió de la caja y borrarlo dejaría el flujo mintiendo. El
 * gasto se corrige a mano desde Gastos, que es donde se ve.
 */
export const anularPayout = async (businessId, payoutId, motivo = '') => {
  try {
    await updateDoc(doc(payoutsRef(businessId), payoutId), {
      status: 'anulada',
      anuladaAt: serverTimestamp(),
      anulacionMotivo: (motivo || '').trim(),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al anular liquidación:', error)
    return { success: false, error: error.message }
  }
}

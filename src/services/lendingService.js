/**
 * PRÉSTAMOS OTORGADOS (modo Préstamos, 15-ago-2026).
 *
 * El negocio PRESTA dinero a clientes — el espejo de `loans`, que son
 * préstamos que el negocio RECIBE (bancos/terceros). Colección PROPIA
 * (`lendingLoans`) a propósito: CashFlow suma las cuotas de `loans` como
 * EGRESOS del negocio; mezclar direcciones en una colección habría contado
 * los cobros a clientes como deudas propias.
 *
 * MODELO FINANCIERO (validado contra el Excel del usuario que pidió el modo):
 * interés FLAT por período sobre el capital — no interés bancario sobre saldo
 * decreciente. Dos amortizaciones:
 *
 * - 'fixed' (Cuota Fija): total = capital + capital × tasa × nCuotas, en
 *   partes iguales. Ej: 500 al 15% en 1 cuota → 575. Cronograma cerrado.
 * - 'interest_only' (Solo Interés, capital libre): cada período vence el
 *   interés del capital VIVO (capital × tasa); el capital se abona cuando se
 *   pueda y el interés siguiente se recalcula. Ej del Excel: S/200 al 15% →
 *   mes 1 paga S/30 (puro interés), mes 2 paga S/230 (capital+interés) → saldo 0.
 *
 * Cada pago se desglosa mora → interés → capital, en ese orden (la mora y el
 * interés no se capitalizan: primero se cubren, el resto amortiza).
 */
import { db } from '@/lib/firebase'
import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore'

export const LENDING_MODALITIES = {
  daily: { label: 'Diario', days: 1 },
  weekly: { label: 'Semanal', days: 7 },
  biweekly: { label: 'Quincenal', days: 15 },
  monthly: { label: 'Mensual', days: 30 },
}

export const AMORTIZATION_TYPES = {
  fixed: 'Cuota Fija',
  interest_only: 'Solo Interés',
}

const r2 = (n) => Math.round(n * 100) / 100

const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Fecha del vencimiento n (1-based) desde la fecha de inicio, según modalidad. */
export const dueDateFor = (startDate, modality, n) => {
  const base = startDate instanceof Date ? startDate : new Date(startDate)
  if (modality === 'monthly') {
    const d = new Date(base)
    d.setMonth(d.getMonth() + n)
    return d
  }
  return addDays(base, LENDING_MODALITIES[modality].days * n)
}

/**
 * Cronograma de Cuota Fija: interés flat sobre el capital INICIAL en cada
 * cuota, redondeo por cuota con ajuste en la última para que la suma cuadre.
 */
export const buildFixedSchedule = ({ capital, interestRate, installmentsCount, startDate, modality }) => {
  const n = Math.max(1, Number(installmentsCount) || 1)
  const totalInterest = r2(capital * (interestRate / 100) * n)
  const total = r2(capital + totalInterest)
  const base = Math.floor((total / n) * 100) / 100
  const rows = []
  for (let i = 1; i <= n; i++) {
    rows.push({
      number: i,
      dueDate: dueDateFor(startDate, modality, i),
      amount: i === n ? r2(total - base * (n - 1)) : base,
      paidAmount: 0,
      status: 'pending', // 'pending' | 'paid'
    })
  }
  return { installments: rows, totalInterest, total }
}

/** Interés del período sobre el capital vivo (modalidad Solo Interés). */
export const periodInterest = (loan) =>
  r2((loan.capitalBalance || 0) * ((loan.interestRate || 0) / 100))

/**
 * Mora acumulada de un préstamo a una fecha. Configurable por préstamo:
 * { type: 'percent' | 'fixed', value } — % sobre lo vencido por cada período
 * de atraso, o monto fijo por período de atraso. Se calcula sobre lo que el
 * doc registra como vencido no pagado y se descuenta con los pagos (moraPaid).
 */
export const computeMora = (loan, asOf = new Date()) => {
  if (!loan?.mora?.value) return 0
  const nextDue = loan.nextDueDate?.toDate ? loan.nextDueDate.toDate() : new Date(loan.nextDueDate)
  if (!nextDue || asOf <= nextDue) return r2(Math.max(0, (loan.moraAccrued || 0) - (loan.moraPaid || 0)))
  const days = LENDING_MODALITIES[loan.modality]?.days || 30
  const periodsLate = Math.floor((asOf - nextDue) / (days * 86400000)) + 1
  const overdueAmount = loan.amortizationType === 'fixed'
    ? (loan.installments || []).filter(c => c.status === 'pending' && (c.dueDate?.toDate ? c.dueDate.toDate() : new Date(c.dueDate)) <= asOf)
        .reduce((s, c) => s + (c.amount - (c.paidAmount || 0)), 0)
    : periodInterest(loan)
  const perPeriod = loan.mora.type === 'percent'
    ? overdueAmount * (loan.mora.value / 100)
    : Number(loan.mora.value)
  return r2(Math.max(0, perPeriod * periodsLate + (loan.moraAccrued || 0) - (loan.moraPaid || 0)))
}

/** Balance pendiente visible en la tarjeta: capital vivo + interés del período + mora. */
export const loanBalance = (loan, asOf = new Date()) => {
  if (loan.amortizationType === 'fixed') {
    const restante = (loan.installments || [])
      .filter(c => c.status === 'pending')
      .reduce((s, c) => s + (c.amount - (c.paidAmount || 0)), 0)
    return r2(restante + computeMora(loan, asOf))
  }
  return r2((loan.capitalBalance || 0) + periodInterest(loan) + computeMora(loan, asOf))
}

export const createLendingLoan = async (businessId, data) => {
  try {
    const payload = {
      customerId: data.customerId || null,
      customerName: data.customerName,
      customerDocument: data.customerDocument || '',
      customerPhone: data.customerPhone || '',
      customerAddress: data.customerAddress || '',
      capital: r2(data.capital),
      capitalBalance: r2(data.capital),
      interestRate: Number(data.interestRate),
      modality: data.modality,               // daily | weekly | biweekly | monthly
      amortizationType: data.amortizationType, // fixed | interest_only
      mora: data.mora || null,               // { type: 'percent'|'fixed', value } | null
      moraAccrued: 0,
      moraPaid: 0,
      interestPaid: 0,
      startDate: data.startDate,
      nextDueDate: dueDateFor(data.startDate, data.modality, 1),
      status: 'active',                      // active | paid | cancelled
      notes: data.notes || '',
      payments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    if (data.amortizationType === 'fixed') {
      const { installments, totalInterest, total } = buildFixedSchedule({
        capital: payload.capital,
        interestRate: payload.interestRate,
        installmentsCount: data.installmentsCount,
        startDate: data.startDate,
        modality: data.modality,
      })
      payload.installments = installments
      payload.installmentsCount = installments.length
      payload.totalInterest = totalInterest
      payload.totalToPay = total
    }
    const ref = await addDoc(collection(db, 'businesses', businessId, 'lendingLoans'), payload)
    return { success: true, id: ref.id }
  } catch (error) {
    console.error('Error al crear préstamo:', error)
    return { success: false, error: error.message }
  }
}

export const getLendingLoans = async (businessId) => {
  try {
    const snap = await getDocs(query(collection(db, 'businesses', businessId, 'lendingLoans'), orderBy('createdAt', 'desc')))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar préstamos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Registrar un pago. Desglose automático mora → interés → capital.
 * En 'fixed' el neto (tras mora) va llenando cuotas pendientes en orden.
 * Devuelve el desglose aplicado para el ticket.
 */
export const registerLendingPayment = async (businessId, loanId, { amount, method = 'Efectivo', date = new Date(), userName = '' }) => {
  try {
    const ref = doc(db, 'businesses', businessId, 'lendingLoans', loanId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: 'Préstamo no encontrado' }
    const loan = { id: snap.id, ...snap.data() }
    if (loan.status !== 'active') return { success: false, error: 'El préstamo no está activo' }

    let remaining = r2(amount)
    const mora = computeMora(loan, date)
    const moraPart = r2(Math.min(remaining, mora))
    remaining = r2(remaining - moraPart)

    let interestPart = 0
    let capitalPart = 0
    const updates = { updatedAt: serverTimestamp() }

    if (loan.amortizationType === 'fixed') {
      // El neto llena cuotas en orden; el desglose interés/capital de cada sol
      // pagado es proporcional a la composición de la cuota (flat).
      const totalConInteres = loan.totalToPay || 0
      const proporcionInteres = totalConInteres > 0 ? (loan.totalInterest || 0) / totalConInteres : 0
      const cuotas = (loan.installments || []).map(c => ({ ...c }))
      let porAplicar = remaining
      for (const c of cuotas) {
        if (porAplicar <= 0) break
        if (c.status !== 'pending') continue
        const falta = r2(c.amount - (c.paidAmount || 0))
        const aplica = r2(Math.min(porAplicar, falta))
        c.paidAmount = r2((c.paidAmount || 0) + aplica)
        if (c.paidAmount >= c.amount - 0.009) { c.status = 'paid'; c.paidAt = date }
        porAplicar = r2(porAplicar - aplica)
      }
      const aplicado = r2(remaining - porAplicar)
      interestPart = r2(aplicado * proporcionInteres)
      capitalPart = r2(aplicado - interestPart)
      const pendientes = cuotas.filter(c => c.status === 'pending')
      updates.installments = cuotas
      updates.capitalBalance = r2(Math.max(0, (loan.capitalBalance || 0) - capitalPart))
      updates.nextDueDate = pendientes.length > 0 ? (pendientes[0].dueDate?.toDate ? pendientes[0].dueDate.toDate() : new Date(pendientes[0].dueDate)) : null
      if (pendientes.length === 0) updates.status = 'paid'
      remaining = porAplicar // sobrante (pagó de más): queda reportado, no se aplica
    } else {
      // Solo Interés: primero el interés del período sobre capital vivo, el
      // resto amortiza capital. Si amortiza, el próximo interés baja solo
      // (se calcula siempre sobre capitalBalance).
      const interesVencido = periodInterest(loan)
      interestPart = r2(Math.min(remaining, interesVencido))
      remaining = r2(remaining - interestPart)
      capitalPart = r2(Math.min(remaining, loan.capitalBalance || 0))
      remaining = r2(remaining - capitalPart)
      updates.capitalBalance = r2((loan.capitalBalance || 0) - capitalPart)
      // Si cubrió el interés del período, el siguiente vencimiento corre un período.
      if (interestPart >= interesVencido - 0.009) {
        const desde = loan.nextDueDate?.toDate ? loan.nextDueDate.toDate() : new Date(loan.nextDueDate)
        updates.nextDueDate = dueDateFor(desde, loan.modality, 1)
      }
      if (updates.capitalBalance <= 0.009) { updates.status = 'paid'; updates.capitalBalance = 0 }
    }

    const paymentRecord = {
      date,
      amount: r2(amount),
      method,
      moraPart,
      interestPart,
      capitalPart,
      surplus: remaining,
      recordedBy: userName,
    }
    updates.payments = [...(loan.payments || []), paymentRecord]
    updates.moraPaid = r2((loan.moraPaid || 0) + moraPart)
    updates.interestPaid = r2((loan.interestPaid || 0) + interestPart)

    await updateDoc(ref, updates)
    return { success: true, breakdown: paymentRecord, loanAfter: { ...loan, ...updates } }
  } catch (error) {
    console.error('Error al registrar pago de préstamo:', error)
    return { success: false, error: error.message }
  }
}

export const cancelLendingLoan = async (businessId, loanId, reason = '') => {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'lendingLoans', loanId), {
      status: 'cancelled',
      cancelReason: reason,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

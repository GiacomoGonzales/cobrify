import { loanBalance, computeMora, pendingPeriodInterest, LENDING_MODALITIES } from '@/services/lendingService'

/**
 * ESTADO DE CUENTA de un préstamo.
 *
 * Un solo criterio para las dos salidas —el mensaje de WhatsApp y el documento
 * impreso—, porque el prestatario puede recibir las dos y tienen que decir
 * exactamente lo mismo. Si el mensaje dijera un saldo y el papel otro, el
 * cliente deja de creerle a los dos.
 *
 * Los importes NO se recalculan acá: salen de `lendingService`, el mismo que
 * usa el cobro. Duplicar la aritmética del interés en una pantalla de reporte
 * es la forma más rápida de que un día no cuadre con lo que se cobró.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const aFecha = (v) => {
  if (!v) return null
  if (v.toDate) return v.toDate()
  const d = new Date(v)
  return isNaN(d) ? null : d
}

export const fmtFecha = (v) => {
  const d = aFecha(v)
  return d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

export const fmtMonto = (n) =>
  `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Arma el estado de cuenta a una fecha.
 *
 * @param {Object} loan  préstamo tal como está en Firestore
 * @param {Date}   [asOf] fecha de corte; por defecto, hoy
 */
export function buildStatement(loan, asOf = new Date()) {
  if (!loan) return null

  const pagos = (loan.payments || [])
    .map(p => ({
      fecha: aFecha(p.date),
      monto: r2(p.amount),
      capital: r2(p.capitalPart),
      interes: r2(p.interestPart),
      mora: r2(p.moraPart),
      metodo: p.method || '',
    }))
    .filter(p => p.fecha)
    .sort((a, b) => a.fecha - b.fecha)

  const totalPagado = r2(pagos.reduce((s, p) => s + p.monto, 0))
  const mora = r2(computeMora(loan, asOf))
  const interesPendiente = r2(pendingPeriodInterest(loan, asOf))
  const capital = r2(loan.capitalBalance)
  const saldo = r2(loanBalance(loan, asOf))

  const proximoVence = aFecha(loan.nextDueDate)
  // Atrasado se mide contra el DÍA, no contra la hora: una cuota que vence hoy
  // no está vencida a las 9 de la mañana.
  const hoy = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  const diasAtraso = proximoVence
    ? Math.max(0, Math.floor((hoy - new Date(proximoVence.getFullYear(), proximoVence.getMonth(), proximoVence.getDate())) / 86400000))
    : 0

  // Cuánto toca pagar en el próximo vencimiento.
  let proximoMonto = null
  if (loan.amortizationType === 'fixed') {
    const pendiente = (loan.installments || []).find(c => c.status === 'pending')
    if (pendiente) proximoMonto = r2((pendiente.amount || 0) - (pendiente.paidAmount || 0))
  } else {
    // Solo Interés: vence el interés del período, más la mora si la hay.
    proximoMonto = r2(interesPendiente + mora)
  }

  return {
    cliente: loan.customerName || '',
    documento: loan.customerDocument || '',
    telefono: loan.customerPhone || '',
    capitalPrestado: r2(loan.capital),
    tasa: Number(loan.interestRate) || 0,
    modalidad: LENDING_MODALITIES[loan.modality]?.label || loan.modality || '',
    tipo: loan.amortizationType === 'fixed' ? 'Cuota fija' : 'Solo interés',
    inicio: aFecha(loan.startDate),
    estado: loan.status,
    pagos,
    totalPagado,
    capital,
    interesPendiente,
    mora,
    saldo,
    proximoVence,
    proximoMonto,
    diasAtraso,
    atrasado: diasAtraso > 0 && loan.status === 'active',
    corte: asOf,
  }
}

/**
 * RESUMEN DE CARTERA — la foto de TODOS los préstamos a una fecha.
 *
 * Nació de un pedido concreto: el prestamista lleva su cartera a mano en un
 * cuaderno —fecha de vencimiento, nombre, capital, y un total abajo— y se la
 * manda a su jefa. El sistema ya tenía esos datos; lo que le faltaba era poder
 * imprimirlos (RODRIGUEZ LUNA ENRIQUE GIOVANI, 16/09/2026).
 *
 * ⚠️ NO lleva una columna de interés suelta, y es a propósito: en **Cuota Fija**
 * el interés ya está dentro de las cuotas, así que sumarlo aparte lo contaría
 * dos veces. El saldo de cada préstamo sale de `loanBalance`, que distingue los
 * dos tipos. Mismo criterio que el estado de cuenta: la aritmética de la plata
 * vive en `lendingService` y acá solo se presenta.
 */
export function buildPortfolioSummary(loans = [], asOf = new Date()) {
  // Atrasado se mide contra el DÍA, no contra la hora (igual que buildStatement).
  const hoy = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())

  const filas = (loans || [])
    .filter(l => l && l.status === 'active')
    .map(l => {
      const vence = aFecha(l.nextDueDate)
      const diasAtraso = vence
        ? Math.max(0, Math.floor((hoy - new Date(vence.getFullYear(), vence.getMonth(), vence.getDate())) / 86400000))
        : 0
      return {
        cliente: l.customerName || '',
        documento: l.customerDocument || '',
        inicio: aFecha(l.startDate),
        vence,
        diasAtraso,
        atrasado: diasAtraso > 0,
        tasa: Number(l.interestRate) || 0,
        tipo: l.amortizationType === 'fixed' ? 'Cuota fija' : 'Solo interés',
        capital: r2(l.capitalBalance),
        saldo: r2(loanBalance(l, asOf)),
      }
    })
    // Por fecha de vencimiento, como el cuaderno: lo que vence primero, arriba.
    .sort((a, b) => (a.vence?.getTime() || 0) - (b.vence?.getTime() || 0))

  return {
    corte: asOf,
    filas,
    activos: filas.length,
    vencidos: filas.filter(f => f.atrasado).length,
    clientes: new Set(filas.map(f => f.cliente)).size,
    capitalEnCalle: r2(filas.reduce((s, f) => s + f.capital, 0)),
    porCobrar: r2(filas.reduce((s, f) => s + f.saldo, 0)),
    // Un préstamo al 0% no devenga interés nunca. Casi siempre es un dato mal
    // cargado y en el papel pasa desapercibido, así que se cuenta para poder
    // avisarlo (le pasó al primer negocio con uno de S/ 1,000 vencido).
    sinTasa: filas.filter(f => f.tasa === 0).length,
  }
}

/**
 * El estado de cuenta como mensaje de WhatsApp.
 *
 * Texto y no PDF a propósito: el prestatario lo lee en la notificación, sin
 * descargar nada. Corto y con los números que le importan — cuánto debe y
 * cuándo — porque un mensaje largo no se lee.
 */
export function statementToWhatsApp(st, nombreNegocio = '') {
  if (!st) return ''
  const L = []
  L.push(`*Estado de cuenta* — ${fmtFecha(st.corte)}`)
  L.push(`${st.cliente}`)
  L.push('')
  L.push(`Préstamo del ${fmtFecha(st.inicio)}`)
  L.push(`${fmtMonto(st.capitalPrestado)} al ${st.tasa}% ${st.modalidad.toLowerCase()}`)
  L.push('')

  if (st.pagos.length > 0) {
    L.push(`Pagado: ${fmtMonto(st.totalPagado)} en ${st.pagos.length} pago${st.pagos.length === 1 ? '' : 's'}`)
  } else {
    L.push('Aún sin pagos registrados')
  }

  if (st.estado === 'paid') {
    L.push('')
    L.push('*Préstamo CANCELADO.* No queda saldo pendiente.')
    return L.join('\n')
  }

  L.push('')
  L.push(`*Saldo actual: ${fmtMonto(st.saldo)}*`)
  // Solo se desglosa si hay algo mas que capital: para un saldo simple, tres
  // renglones repitiendo el mismo numero confunden en vez de aclarar.
  if (st.interesPendiente > 0 || st.mora > 0) {
    L.push(`   Capital: ${fmtMonto(st.capital)}`)
    if (st.interesPendiente > 0) L.push(`   Interés: ${fmtMonto(st.interesPendiente)}`)
    if (st.mora > 0) L.push(`   Mora: ${fmtMonto(st.mora)}`)
  }

  if (st.proximoVence) {
    L.push('')
    const cuanto = st.proximoMonto != null ? `${fmtMonto(st.proximoMonto)} ` : ''
    L.push(st.atrasado
      ? `*Vencido* el ${fmtFecha(st.proximoVence)} (${st.diasAtraso} día${st.diasAtraso === 1 ? '' : 's'} de atraso)`
      : `Próximo pago: ${cuanto}el ${fmtFecha(st.proximoVence)}`)
    if (st.atrasado && cuanto) L.push(`Monto a pagar: ${cuanto.trim()}`)
  }

  if (nombreNegocio) {
    L.push('')
    L.push(nombreNegocio)
  }
  return L.join('\n')
}

/**
 * Recordatorio de cobro: más corto que el estado de cuenta.
 *
 * Cuando alguien está atrasado no necesita el historial, necesita saber cuánto
 * y para cuándo. El estado de cuenta completo se manda si lo pide.
 */
export function reminderToWhatsApp(st, nombreNegocio = '') {
  if (!st) return ''
  const L = []
  L.push(`Hola ${st.cliente}, te escribimos por tu préstamo.`)
  L.push('')
  if (st.atrasado) {
    L.push(`Tienes un pago vencido del ${fmtFecha(st.proximoVence)} (${st.diasAtraso} día${st.diasAtraso === 1 ? '' : 's'} de atraso).`)
  } else if (st.proximoVence) {
    L.push(`Tu próximo pago vence el ${fmtFecha(st.proximoVence)}.`)
  }
  if (st.proximoMonto != null) L.push(`Monto: *${fmtMonto(st.proximoMonto)}*`)
  L.push('')
  L.push(`Saldo total: ${fmtMonto(st.saldo)}`)
  if (nombreNegocio) {
    L.push('')
    L.push(nombreNegocio)
  }
  return L.join('\n')
}

/**
 * Link de WhatsApp con el mensaje ya escrito.
 *
 * Sin teléfono devuelve null: es mejor que el botón no aparezca a que abra
 * WhatsApp sin destinatario y el prestamista crea que se envió.
 */
export function whatsAppLink(telefono, mensaje) {
  const limpio = String(telefono || '').replace(/\D/g, '')
  if (!limpio) return null
  // Perú: 9 dígitos sin código de país. Se antepone 51 para que WhatsApp lo
  // reconozca; si ya viene con código (11+ dígitos) se respeta.
  const numero = limpio.length === 9 ? `51${limpio}` : limpio
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}

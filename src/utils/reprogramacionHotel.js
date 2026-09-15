/**
 * REPROGRAMACIÓN CON FECHA ABIERTA de una reserva de hotel.
 *
 * Pedido de San Ignacio Bamboo Lodge (14 y 15-set-2026): cuando el huésped no
 * puede venir, la reserva queda "Reprogramada". La cabaña se libera para otros,
 * lo facturado se conserva y hay una fecha límite para elegir las nuevas
 * fechas: seis meses desde la fecha ORIGINAL de la reserva (respuesta del
 * cliente; se toma la fecha de entrada original y el hotel la puede corregir).
 *
 * Mientras está reprogramada, la reserva guarda sus fechas originales pero no
 * ocupa nada: la vista semanal, el tablero y el reporte por noche la dejan
 * fuera (`ocupaFechas`). Los cruces de fechas y la disponibilidad del catálogo
 * ya miraban solo reservas confirmadas y en estadía.
 *
 * Al asignar las nuevas fechas, las noches que ya se facturaron pasan a las
 * nuevas fechas (`moverNochesPagadas`): el huésped no las vuelve a pagar.
 */

export const ESTADO_REPROGRAMADA = 'rescheduled'
export const MESES_PARA_REPROGRAMAR = 6

/** ¿La reserva ocupa sus fechas? Las canceladas, los no show y las reprogramadas no. */
export const ocupaFechas = (reserva) => !['cancelled', 'no_show', ESTADO_REPROGRAMADA].includes(reserva?.status)

/** Se reprograma una reserva confirmada que todavía no llegó. */
export const puedeReprogramarse = (reserva) => reserva?.status === 'confirmed'

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))

/** Hoy en Perú, como YYYY-MM-DD. */
export const fechaDeHoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

/** "2027-03-15" → "15/03/2027" */
export const fechaCorta = (ymd) => (esFecha(ymd) ? ymd.split('-').reverse().join('/') : '')

/** Suma meses a una fecha YYYY-MM-DD. Si el día no existe en el mes de destino, queda el último. */
export function sumarMeses(ymd, meses) {
  if (!esFecha(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const total = m - 1 + Number(meses || 0)
  const anio = y + Math.floor(total / 12)
  const mes = ((total % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** La fecha límite sugerida: la entrada original más seis meses. */
export const limitePorDefecto = (checkInOriginal) => sumarMeses(checkInOriginal, MESES_PARA_REPROGRAMAR)

/** Días desde hoy hasta el límite; negativo si ya venció. null si falta alguna fecha. */
export function diasHastaLimite(limite, hoy) {
  if (!esFecha(limite) || !esFecha(hoy)) return null
  const aUtc = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((aUtc(limite) - aUtc(hoy)) / 86400000)
}

/** El texto de la fecha límite para la lista: "Fecha abierta hasta 15/03/2027 · quedan 12 días". */
export function textoDelLimite(reprogramacion, hoy) {
  const limite = reprogramacion?.limite
  const dias = diasHastaLimite(limite, hoy)
  if (dias === null) return { texto: 'Fecha abierta', vencida: false }
  if (dias < 0) return { texto: `Fecha abierta: venció el ${fechaCorta(limite)}`, vencida: true }
  if (dias === 0) return { texto: `Fecha abierta hasta hoy, ${fechaCorta(limite)}`, vencida: false }
  return { texto: `Fecha abierta hasta ${fechaCorta(limite)} · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}`, vencida: false }
}

/** Lo que se guarda en la reserva al reprogramarla. */
export function datosDeReprogramacion(reserva, { limite, hoy }) {
  const checkIn = reserva?.checkIn || reserva?.checkInDate || ''
  const checkOut = reserva?.checkOut || reserva?.checkOutDate || ''
  return {
    status: ESTADO_REPROGRAMADA,
    reprogramacion: {
      limite: esFecha(limite) ? limite : limitePorDefecto(checkIn),
      reprogramadaEl: hoy,
      checkInOriginal: checkIn,
      checkOutOriginal: checkOut,
      nochesOriginales: Number(reserva?.nights) || 0,
      estadoAnterior: reserva?.status || 'confirmed',
    },
  }
}

/**
 * Qué noches ya facturadas pasan a qué fecha nueva, en orden. Las que sobran
 * (la estadía nueva es más corta) se quedan donde estaban: siguen pagadas.
 * @returns {{ movimientos: Array<{ id: string, desde: string, hasta: string }>, sobrantes: string[] }}
 */
export function moverNochesPagadas(cargos, nuevasFechas) {
  const pagadas = (cargos || [])
    .filter((c) => c.chargeType === 'room_night' && c.invoiceId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const fechas = [...(nuevasFechas || [])].sort()
  const movimientos = []
  pagadas.forEach((c, i) => {
    if (i < fechas.length && c.date !== fechas[i]) movimientos.push({ id: c.id, desde: c.date, hasta: fechas[i] })
  })
  return { movimientos, sobrantes: pagadas.slice(fechas.length).map((c) => c.id) }
}

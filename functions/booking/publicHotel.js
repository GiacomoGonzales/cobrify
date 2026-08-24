// Reservas de habitaciones desde el catálogo público — Fase 2 del plan.
//
// Mismo principio que las citas (ver publicAgenda.js): el catálogo nunca toca
// Firestore. La disponibilidad sale desinfectada de acá — las reservas de un
// hotel traen NOMBRES Y DOCUMENTOS de huéspedes, lo último que puede quedar
// legible para un anónimo.
//
// La diferencia deliberada con las citas: acá NO hay candado ni auto-reserva.
// Una cita ocupa 30 minutos; una habitación bloqueada por un fantasma cuesta
// una noche entera. Por eso lo que entra del catálogo es una SOLICITUD
// (status 'requested') que no bloquea la habitación: el hotel la confirma o
// la rechaza desde su pantalla de Reservas, y recién al confirmarla corre el
// chequeo de solape de siempre. Todo el sistema ya filtra por
// confirmed/checked_in (solape, ocupación, auditoría nocturna), así que una
// solicitud es invisible para la operación hasta que alguien la acepta.
//
// Solo se ofrecen reservas POR NOCHE. La tarifa por horas existe en el
// sistema, pero abrirla a desconocidos es otro producto y otra conversación.

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const ESTADOS_QUE_BLOQUEAN = ['confirmed', 'checked_in']
const MAX_NOCHES = 30

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

const nochesEntre = (checkIn, checkOut) =>
  Math.round((new Date(`${checkOut}T12:00:00Z`) - new Date(`${checkIn}T12:00:00Z`)) / 86400000)

const conCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
}

/** Valida negocio + fechas. Devuelve {business, checkIn, checkOut, noches} o {error}. */
const validar = async (db, businessId, checkIn, checkOut) => {
  if (!businessId || typeof businessId !== 'string' || businessId.length > 60) {
    return { error: { code: 400, msg: 'businessId inválido' } }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return { error: { code: 400, msg: 'Fechas inválidas' } }
  }
  if (checkIn < hoyLima()) return { error: { code: 400, msg: 'La fecha de llegada ya pasó' } }
  const noches = nochesEntre(checkIn, checkOut)
  if (noches < 1) return { error: { code: 400, msg: 'La salida debe ser después de la llegada' } }
  if (noches > MAX_NOCHES) return { error: { code: 400, msg: `Máximo ${MAX_NOCHES} noches por reserva` } }

  const snap = await db.collection('businesses').doc(businessId).get()
  if (!snap.exists) return { error: { code: 404, msg: 'Negocio no encontrado' } }
  const business = snap.data()
  if (business.businessMode !== 'hotel' || business.hotelBooking?.enabled !== true) {
    return { error: { code: 403, msg: 'Este negocio no recibe reservas por el catálogo' } }
  }
  return { business, checkIn, checkOut, noches }
}

/** Reservas que BLOQUEAN y se cruzan con el rango, agrupadas por habitación. */
const habitacionesOcupadas = async (db, businessId, checkIn, checkOut) => {
  // Query por estado (un solo campo con `in`): sin índice compuesto. El cruce
  // de fechas se filtra en memoria — las reservas activas de un hotel chico
  // son decenas, no miles.
  const snap = await db.collection(`businesses/${businessId}/hotelReservations`)
    .where('status', 'in', ESTADOS_QUE_BLOQUEAN).get()
  const ocupadas = new Set()
  const hoy = hoyLima()
  snap.docs.forEach((d) => {
    const r = d.data()
    if (r.pricingMode === 'hourly') return
    const exIn = r.checkInDate || r.checkIn
    const exOut = r.checkOutDate || r.checkOut
    if (!exIn || !exOut) return
    // Mismo criterio que la pantalla de Reservas: una confirmada cuyo checkout
    // ya pasó es un resto huérfano y no bloquea fechas futuras.
    if (r.status === 'confirmed' && exOut < hoy) return
    if (checkIn < exOut && checkOut > exIn) ocupadas.add(r.roomId)
  })
  return ocupadas
}

/**
 * Habitaciones del hotel con su disponibilidad para un rango de fechas.
 * Campos desinfectados: nada de huéspedes, solo la habitación y su tarifa.
 */
export const getPublicHotelRooms = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    try {
      const businessId = String(req.query.businessId || '')
      const checkIn = String(req.query.checkIn || '')
      const checkOut = String(req.query.checkOut || '')
      const db = getFirestore()
      const v = await validar(db, businessId, checkIn, checkOut)
      if (v.error) { res.status(v.error.code).json({ error: v.error.msg }); return }

      const [roomsSnap, ocupadas] = await Promise.all([
        db.collection(`businesses/${businessId}/hotelRooms`).get(),
        habitacionesOcupadas(db, businessId, checkIn, checkOut),
      ])

      const rooms = roomsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        // Sin tarifa por noche no se puede cotizar; en mantenimiento no se ofrece.
        .filter((r) => Number(r.rate) > 0 && r.status !== 'maintenance')
        .map((r) => ({
          id: r.id,
          name: r.name || '',
          number: r.number || '',
          type: r.type || 'simple',
          capacity: Number(r.capacity) || 1,
          baseGuests: Number(r.baseGuests) || 1,
          extraGuestRate: Number(r.extraGuestRate) || 0,
          rate: Number(r.rate) || 0,
          amenities: r.amenities || '',
          photoUrl: r.photoUrl || '',
          available: !ocupadas.has(r.id),
        }))

      res.status(200).json({ checkIn, checkOut, noches: v.noches, rooms })
    } catch (error) {
      console.error('getPublicHotelRooms:', error)
      res.status(500).json({ error: 'Error al consultar la disponibilidad' })
    }
  }
)

/**
 * Crear la SOLICITUD de reserva. No bloquea la habitación: el hotel decide.
 */
export const requestPublicHotelReservation = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return }
    try {
      const b = req.body || {}
      const businessId = String(b.businessId || '')
      const roomId = String(b.roomId || '')
      const checkIn = String(b.checkIn || '')
      const checkOut = String(b.checkOut || '')
      const huespedes = Math.max(1, Math.min(20, Number(b.guests) || 1))
      const nombre = String(b.name || '').trim().slice(0, 80)
      const telefono = String(b.phone || '').replace(/\D/g, '').slice(0, 15)
      const nota = String(b.notes || '').trim().slice(0, 300)

      if (nombre.length < 3) { res.status(400).json({ error: 'Escribe tu nombre completo' }); return }
      if (telefono.length < 7) { res.status(400).json({ error: 'Escribe un teléfono válido' }); return }

      const db = getFirestore()
      const v = await validar(db, businessId, checkIn, checkOut)
      if (v.error) { res.status(v.error.code).json({ error: v.error.msg }); return }
      const { noches } = v

      const roomSnap = await db.doc(`businesses/${businessId}/hotelRooms/${roomId}`).get()
      if (!roomSnap.exists) { res.status(404).json({ error: 'Habitación no encontrada' }); return }
      const room = roomSnap.data()
      const tarifa = Number(room.rate) || 0
      if (tarifa <= 0 || room.status === 'maintenance') {
        res.status(400).json({ error: 'Esa habitación no está disponible para reservas' }); return
      }
      if (huespedes > (Number(room.capacity) || 1)) {
        res.status(400).json({ error: `Esa habitación admite hasta ${room.capacity} persona(s)` }); return
      }

      // Si la habitación ya está tomada en esas fechas, no vale la pena crear
      // una solicitud condenada: mejor decirlo ahora. (Las solicitudes no
      // bloquean, así que dos solicitudes por la misma habitación SÍ pueden
      // convivir — el hotel elige cuál confirma y el solape frena la segunda.)
      const ocupadas = await habitacionesOcupadas(db, businessId, checkIn, checkOut)
      if (ocupadas.has(roomId)) {
        res.status(409).json({ error: 'Esa habitación ya está reservada en esas fechas. Elige otra u otras fechas.' }); return
      }

      // Tope por teléfono: 3 solicitudes pendientes. Query por un solo campo,
      // filtro en memoria (mismo criterio que las citas).
      const previas = await db.collection(`businesses/${businessId}/hotelReservations`)
        .where('guestPhone', '==', telefono).limit(40).get()
      const pendientes = previas.docs.map((d) => d.data())
        .filter((r) => r.source === 'catalog' && r.status === 'requested')
      if (pendientes.length >= 3) {
        res.status(429).json({ error: 'Ya tienes varias solicitudes pendientes con este teléfono. Contáctanos directamente.' }); return
      }

      // Persona adicional: mismo cálculo que hace el hotel al reservar a mano.
      const base = Number(room.baseGuests) || 1
      const extraRate = Number(room.extraGuestRate) || 0
      const extras = Math.max(0, huespedes - base)
      const extraGuestTotal = extras * extraRate * noches
      const totalAmount = tarifa * noches + extraGuestTotal

      // Mismo doc que createReservation (canónico + alias del form), para que
      // la pantalla de Reservas lo trate como uno más al confirmarlo.
      const nueva = {
        guestName: nombre,
        guestDocument: '', guestDocumentType: 'DNI',
        guestPhone: telefono, guestEmail: '',
        checkIn, checkOut,
        documentNumber: '', documentType: 'DNI',
        phone: telefono, email: '',
        checkInDate: checkIn, checkOutDate: checkOut,
        pricingMode: 'nightly', checkInTime: '', checkOutTime: '', hours: 0, ratePerHour: 0,
        roomId, roomNumber: room.number || '', roomName: room.name || '',
        nights: noches, ratePerNight: tarifa,
        guests: huespedes, baseGuests: base,
        extraGuestRate: extraRate, extraGuestTotal,
        totalAmount, total: totalAmount,
        status: 'requested',
        source: 'catalog',
        notes: nota,
        extras: [],
        paymentStatus: 'pending', amountPaid: 0,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }
      const ref = await db.collection(`businesses/${businessId}/hotelReservations`).add(nueva)

      console.log(`🏨 Solicitud de reserva creada: ${businessId} ${checkIn}→${checkOut} hab ${room.name || room.number} (${nombre})`)
      res.status(200).json({ success: true, reservationId: ref.id, noches, totalAmount })
    } catch (error) {
      console.error('requestPublicHotelReservation:', error)
      res.status(500).json({ error: 'No se pudo enviar la solicitud' })
    }
  }
)

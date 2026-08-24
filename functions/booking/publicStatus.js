// "Mi reserva" — Fase 3 del plan: el cliente ve el estado de su cita o su
// solicitud de habitación y puede cancelarla, sin cuenta y sin login.
//
// El secreto es el TOKEN del enlace (publicToken, aleatorio, generado al
// reservar). Quien tiene el enlace es el dueño de la reserva — el mismo
// modelo de los enlaces de rastreo de encomiendas. Por eso acá no hay ni
// usuario ni contraseña: hay que cuidar el enlace, y el enlace no lleva
// ningún dato personal en la URL.
//
// La respuesta va desinfectada igual que todo lo público: se devuelve SOLO lo
// que el propio cliente escribió más el estado — jamás datos de terceros.

import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { sendPushNotification } from '../notifications/sendPushNotification.js'

const conCors = (res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * Busca la reserva por token: primero en citas, después en hotel. El token es
 * aleatorio de 24 chars, así que una colisión entre colecciones no existe en
 * la práctica; la query por igualdad usa el índice automático de campo único.
 */
const buscarPorToken = async (db, businessId, token) => {
  const citas = await db.collection(`businesses/${businessId}/appointments`)
    .where('publicToken', '==', token).limit(1).get()
  if (!citas.empty) return { tipo: 'cita', ref: citas.docs[0].ref, data: citas.docs[0].data() }

  const reservas = await db.collection(`businesses/${businessId}/hotelReservations`)
    .where('publicToken', '==', token).limit(1).get()
  if (!reservas.empty) return { tipo: 'hotel', ref: reservas.docs[0].ref, data: reservas.docs[0].data() }

  return null
}

const fechaHoraLima = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null
  if (!d) return null
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** ¿Todavía se puede cancelar? Devuelve {ok} o {motivo}. */
const puedeCancelar = (tipo, data) => {
  if (tipo === 'cita') {
    if (!['scheduled', 'confirmed'].includes(data.status)) {
      return { motivo: 'Esta cita ya no se puede cancelar desde aquí.' }
    }
    const cuando = data.scheduledDate?.toDate?.()
    if (!cuando || cuando.getTime() < Date.now()) {
      return { motivo: 'La hora de la cita ya pasó.' }
    }
    return { ok: true }
  }
  // hotel
  if (!['requested', 'confirmed'].includes(data.status)) {
    return { motivo: 'Esta reserva ya no se puede cancelar desde aquí.' }
  }
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const checkIn = data.checkInDate || data.checkIn
  if (!checkIn || checkIn <= hoyLima) {
    return { motivo: 'La fecha de llegada ya está encima. Coordina directamente con el hotel.' }
  }
  return { ok: true }
}

/**
 * Estado de la reserva para la página pública "mi reserva".
 */
export const getPublicBooking = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    try {
      const businessId = String(req.query.businessId || '')
      const token = String(req.query.token || '')
      if (!businessId || businessId.length > 60 || token.length < 16 || token.length > 64) {
        res.status(400).json({ error: 'Enlace inválido' }); return
      }
      const db = getFirestore()
      const hit = await buscarPorToken(db, businessId, token)
      if (!hit) { res.status(404).json({ error: 'No encontramos esta reserva. Revisa el enlace.' }); return }

      const bizSnap = await db.collection('businesses').doc(businessId).get()
      const biz = bizSnap.exists ? bizSnap.data() : {}
      const negocio = {
        nombre: biz.name || biz.businessName || '',
        telefono: biz.phone || biz.catalogWhatsapp || '',
      }

      const { tipo, data } = hit
      const cancelable = puedeCancelar(tipo, data)

      if (tipo === 'cita') {
        res.status(200).json({
          tipo,
          negocio,
          status: data.status,
          cuando: fechaHoraLima(data.scheduledDate),
          servicio: data.serviceName || '',
          nombre: data.customerName || '',
          mascota: data.petName || '',
          puedeCancelar: !!cancelable.ok,
          motivoNoCancelable: cancelable.motivo || '',
        })
        return
      }

      res.status(200).json({
        tipo,
        negocio,
        status: data.status,
        checkIn: data.checkInDate || data.checkIn || '',
        checkOut: data.checkOutDate || data.checkOut || '',
        habitacion: data.roomName || data.roomNumber || '',
        noches: Number(data.nights) || 0,
        total: Number(data.totalAmount) || 0,
        nombre: data.guestName || '',
        puedeCancelar: !!cancelable.ok,
        motivoNoCancelable: cancelable.motivo || '',
      })
    } catch (error) {
      console.error('getPublicBooking:', error)
      res.status(500).json({ error: 'Error al consultar la reserva' })
    }
  }
)

/**
 * Cancelación por el propio cliente. Avisa al negocio con push + campanita:
 * una cancelación que nadie ve es un hueco muerto en la agenda — o peor, una
 * habitación que se guardó para nadie.
 */
export const cancelPublicBooking = onRequest(
  { cors: true, region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    conCors(res)
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return }
    try {
      const businessId = String(req.body?.businessId || '')
      const token = String(req.body?.token || '')
      if (!businessId || businessId.length > 60 || token.length < 16 || token.length > 64) {
        res.status(400).json({ error: 'Enlace inválido' }); return
      }
      const db = getFirestore()
      const hit = await buscarPorToken(db, businessId, token)
      if (!hit) { res.status(404).json({ error: 'No encontramos esta reserva.' }); return }

      const { tipo, ref, data } = hit
      const cancelable = puedeCancelar(tipo, data)
      if (!cancelable.ok) { res.status(409).json({ error: cancelable.motivo }); return }

      await ref.update({
        status: 'cancelled',
        cancellationReason: 'Cancelada por el cliente desde su enlace',
        cancelledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      // La cita cancelada libera su hueco sola: el candado de publicAgendaSlots
      // apunta a una cita que ya no está activa, y bookPublicAppointment deja
      // pisar un candado cuya cita fue cancelada.

      // Aviso al negocio
      try {
        const bizSnap = await db.collection('businesses').doc(businessId).get()
        const ownerId = bizSnap.exists ? (bizSnap.data().ownerId || businessId) : businessId
        const quien = tipo === 'cita' ? (data.customerName || 'Un cliente') : (data.guestName || 'Un huésped')
        const que = tipo === 'cita'
          ? `su cita del ${fechaHoraLima(data.scheduledDate) || ''}`
          : `su reserva de ${data.roomName || data.roomNumber || 'habitación'} (${data.checkInDate || data.checkIn} → ${data.checkOutDate || data.checkOut})`
        const title = tipo === 'cita' ? 'Cita cancelada por el cliente' : 'Reserva cancelada por el huésped'
        const body = `${quien} canceló ${que}.`
        await sendPushNotification(ownerId, title, body, { type: 'catalog_cancellation', businessId })
        await db.collection('notifications').add({
          userId: ownerId,
          type: 'catalog_cancellation',
          title,
          message: body,
          metadata: { businessId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        // El aviso es cortesía; la cancelación ya está hecha y es lo que vale.
        console.error('cancelPublicBooking: aviso fallido:', err)
      }

      console.log(`🚫 Cancelación pública: ${tipo} en ${businessId}`)
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('cancelPublicBooking:', error)
      res.status(500).json({ error: 'No se pudo cancelar' })
    }
  }
)

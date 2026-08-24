import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getEnabledSubUsers } from './getEnabledSubUsers.js'

/**
 * Aviso de solicitud de reserva llegada desde el catálogo público.
 *
 * Solo dispara para source === 'catalog'. El aviso importa DOBLE acá: la
 * solicitud no bloquea la habitación hasta que alguien la confirme, así que
 * una solicitud que nadie ve es un huésped que se va a otro hotel.
 *
 * Reusa la preferencia 'new_order' de sub-usuarios, igual que las citas del
 * catálogo: para recepción, es algo que entró solo y hay que atender.
 */
export const onNewHotelReservation = onDocumentCreated(
  'businesses/{businessId}/hotelReservations/{reservationId}',
  async (event) => {
    const r = event.data?.data()
    if (!r || r.source !== 'catalog') return

    const { businessId, reservationId } = event.params
    try {
      const db = getFirestore()
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return
      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId

      const fmt = (ymd) => {
        const [y, m, d] = String(ymd).split('-')
        return `${d}/${m}/${y}`
      }
      const title = 'Nueva solicitud de reserva'
      const body = `${r.guestName || 'Un huésped'} pide ${r.roomName || r.roomNumber || 'una habitación'} del ${fmt(r.checkIn)} al ${fmt(r.checkOut)} (${r.nights} noche${r.nights === 1 ? '' : 's'}, S/ ${Number(r.totalAmount || 0).toFixed(2)}). Confírmala en Reservas.`

      const subUserIds = await getEnabledSubUsers(db, ownerId, 'new_order', false)
      const recipients = Array.from(new Set([ownerId, ...subUserIds]))

      for (const uid of recipients) {
        try {
          await sendPushNotification(uid, title, body, {
            type: 'catalog_hotel_request', reservationId, businessId,
          }, { allowSecondaryUsers: true })
          await db.collection('notifications').add({
            userId: uid,
            type: 'catalog_hotel_request',
            title,
            message: body,
            metadata: { reservationId, businessId },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          console.error(`onNewHotelReservation: error notificando a ${uid}:`, err)
        }
      }
      console.log(`🏨 Solicitud del catálogo notificada a ${recipients.length} usuario(s): ${reservationId}`)
    } catch (error) {
      console.error('onNewHotelReservation:', error)
    }
  }
)

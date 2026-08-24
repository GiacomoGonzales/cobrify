import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getEnabledSubUsers } from './getEnabledSubUsers.js'

/**
 * Aviso de cita reservada desde el catálogo público.
 *
 * Solo dispara para source === 'catalog': las citas que el negocio se agenda a
 * sí mismo no necesitan avisarle al negocio. La agenda ya es en tiempo real,
 * así que la cita APARECE sola en pantalla — este push existe para el dueño
 * que no está mirando la agenda cuando un desconocido reserva.
 *
 * Usa la preferencia 'new_order' de los sub-usuarios a propósito: una reserva
 * del catálogo es, para quien atiende el mostrador, exactamente lo mismo que
 * un pedido online — algo que entró solo y hay que atender.
 */
export const onNewAppointment = onDocumentCreated(
  'businesses/{businessId}/appointments/{appointmentId}',
  async (event) => {
    const appt = event.data?.data()
    if (!appt || appt.source !== 'catalog') return

    const { businessId, appointmentId } = event.params
    try {
      const db = getFirestore()
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return
      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId

      const fecha = appt.scheduledDate?.toDate?.()
      const cuando = fecha
        ? fecha.toLocaleString('es-PE', {
            timeZone: 'America/Lima', weekday: 'long', day: 'numeric',
            month: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
          })
        : ''

      const title = 'Nueva cita desde tu catálogo'
      const body = `${appt.customerName || 'Un cliente'} reservó ${appt.serviceName || 'una cita'} para el ${cuando}.`

      const subUserIds = await getEnabledSubUsers(db, ownerId, 'new_order', false)
      const recipients = Array.from(new Set([ownerId, ...subUserIds]))

      for (const uid of recipients) {
        try {
          await sendPushNotification(uid, title, body, {
            type: 'catalog_appointment', appointmentId, businessId,
          }, { allowSecondaryUsers: true })
          await db.collection('notifications').add({
            userId: uid,
            type: 'catalog_appointment',
            title,
            message: body,
            metadata: { appointmentId, businessId },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          console.error(`onNewAppointment: error notificando a ${uid}:`, err)
        }
      }
      console.log(`📅 Cita del catálogo notificada a ${recipients.length} usuario(s): ${appointmentId}`)
    } catch (error) {
      console.error('onNewAppointment:', error)
    }
  }
)

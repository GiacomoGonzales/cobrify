import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getEnabledSubUsers } from './getEnabledSubUsers.js'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * Trigger cuando se detecta un nuevo pago de Yape
 * Envía notificación push al dueño del negocio y crea notificación en la campanita
 */
export const onYapePayment = onDocumentCreated(
  'businesses/{businessId}/yapePayments/{paymentId}',
  async (event) => {
    console.log('💜 onYapePayment trigger activated!')

    const payment = event.data.data()
    const businessId = event.params.businessId
    const paymentId = event.params.paymentId

    console.log('💰 Yape payment detected:', {
      paymentId,
      businessId,
      amount: payment.amount,
      senderName: payment.senderName
    })

    try {
      const db = getFirestore()

      // Obtener información del negocio (igual que onNewSale)
      const businessDoc = await db
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) {
        console.error('❌ Business not found:', businessId)
        return
      }

      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId
      const businessName = business.name || business.businessName || 'tu negocio'

      // Verificar preferencias de notificación
      const prefs = business.notificationPreferences || {}
      if (prefs.yape_payment === false) {
        console.log('🔕 yape_payment notification disabled by user preferences')
        return
      }

      console.log('👤 Owner ID:', ownerId)
      console.log('🏢 Business:', businessName)

      // Obtener sub-usuarios habilitados para Yape (default true: si un
      // sub-usuario viejo no tiene el campo, recibe — coincide con lo que
      // el dueño espera al activar Yape para todo el equipo).
      const subUserIds = await getEnabledSubUsers(db, ownerId, 'yape_payment', true)

      // Lista final: dueño + sub-usuarios habilitados (deduplicada)
      const recipientIds = Array.from(new Set([ownerId, ...subUserIds]))

      // Preparar mensaje
      const title = '💜 Yape Recibido'
      const body = `S/ ${payment.amount?.toFixed(2) || '0.00'} de ${payment.senderName || 'Desconocido'}`

      const pushData = {
        type: 'yape_payment',
        paymentId: paymentId,
        businessId,
        amount: (payment.amount || 0).toString(),
        senderName: payment.senderName || 'Desconocido'
      }

      const notifiedUsers = []

      // Enviar push + crear notificación de campanita a cada destinatario
      for (const uid of recipientIds) {
        try {
          // Push: pasar allowSecondaryUsers: true para saltarse el check
          // defensivo que normalmente bloquea push a sub-usuarios.
          const pushResult = await sendPushNotification(
            uid,
            title,
            body,
            pushData,
            { allowSecondaryUsers: true }
          )
          console.log(`📤 Push to ${uid === ownerId ? 'owner' : 'sub-user'} ${uid}:`, pushResult)

          // Campanita: una notificación por usuario para que cada uno la vea
          // solo en su propio header (el query filtra por userId).
          await db.collection('notifications').add({
            userId: uid,
            type: 'yape_payment',
            title: title,
            message: body,
            metadata: {
              paymentId: paymentId,
              businessId: businessId,
              amount: payment.amount || 0,
              senderName: payment.senderName || 'Desconocido'
            },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          })

          notifiedUsers.push(uid)
        } catch (err) {
          console.error(`❌ Error notificando a ${uid}:`, err)
        }
      }

      console.log(`🔔 Yape notificado a ${notifiedUsers.length}/${recipientIds.length} usuarios (payment: ${paymentId})`)

      // Actualizar el documento de pago
      await db
        .collection('businesses')
        .doc(businessId)
        .collection('yapePayments')
        .doc(paymentId)
        .update({
          notifiedUsers: notifiedUsers,
          notifiedAt: new Date()
        })

    } catch (error) {
      console.error('❌ Error in onYapePayment trigger:', error)
    }
  }
)

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Trigger cuando se detecta un nuevo pago de Yape
 * Envía notificación push a los usuarios configurados
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

      // Obtener configuración de notificaciones Yape
      const configDoc = await db
        .collection('businesses')
        .doc(businessId)
        .collection('settings')
        .doc('yapeNotifications')
        .get()

      const config = configDoc.exists ? configDoc.data() : { notifyAllUsers: true }

      // Obtener información del negocio
      const businessDoc = await db
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) {
        console.error('❌ Business not found:', businessId)
        return
      }

      const business = businessDoc.data()
      const businessName = business.name || business.businessName || 'tu negocio'

      // Determinar a quién notificar
      let userIdsToNotify = []
      const ownerId = business.ownerId || businessId

      if (config.notifyAllUsers) {
        // Notificar a todos los usuarios del negocio
        // 1. Buscar usuarios con businessId igual
        const usersSnapshot = await db
          .collection('users')
          .where('businessId', '==', businessId)
          .get()

        userIdsToNotify = usersSnapshot.docs.map(doc => doc.id)

        // 2. Buscar en colección anidada businesses/{businessId}/users
        try {
          const nestedUsersSnapshot = await db
            .collection('businesses')
            .doc(businessId)
            .collection('users')
            .get()

          for (const userDoc of nestedUsersSnapshot.docs) {
            const userId = userDoc.data().userId || userDoc.id
            if (!userIdsToNotify.includes(userId)) {
              userIdsToNotify.push(userId)
            }
          }
        } catch (e) {
          console.log('No hay colección anidada de usuarios')
        }

        // 3. Agregar al dueño
        if (!userIdsToNotify.includes(ownerId)) {
          userIdsToNotify.push(ownerId)
        }
      } else if (config.notifyUsers && config.notifyUsers.length > 0) {
        // Notificar solo a usuarios seleccionados
        userIdsToNotify = config.notifyUsers
      } else {
        // Por defecto, notificar al dueño
        userIdsToNotify = [ownerId]
      }

      // NO excluir al detector - siempre enviar push a todos
      // El detector ya vio el toast, pero también recibirá push para registro
      console.log('📤 Users to notify:', userIdsToNotify)

      if (userIdsToNotify.length === 0) {
        console.log('ℹ️ No users to notify')
        return
      }

      // Preparar mensaje
      const title = '💜 Yape Recibido'
      const body = `S/ ${payment.amount.toFixed(2)} de ${payment.senderName}`

      // Enviar notificación a cada usuario
      const results = await Promise.all(
        userIdsToNotify.map(userId =>
          sendPushNotification(
            userId,
            title,
            body,
            {
              type: 'yape_payment',
              paymentId: paymentId,
              businessId,
              amount: payment.amount.toString(),
              senderName: payment.senderName
            }
          )
        )
      )

      const successCount = results.filter(r => r.success).length
      console.log(`✅ Yape notifications sent: ${successCount}/${userIdsToNotify.length}`)

      // Actualizar el documento con los usuarios notificados
      await db
        .collection('businesses')
        .doc(businessId)
        .collection('yapePayments')
        .doc(paymentId)
        .update({
          notifiedUsers: userIdsToNotify,
          notifiedAt: new Date()
        })

    } catch (error) {
      console.error('❌ Error in onYapePayment trigger:', error)
    }
  }
)

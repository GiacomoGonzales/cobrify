import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'

/**
 * Trigger cuando se crea una notificación de tipo payment_received.
 * Envía push notification al usuario correspondiente.
 * Se activa automáticamente cuando el cliente crea la notificación bell de pago.
 */
export const onPaymentNotification = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const notification = event.data.data()
    const notificationId = event.params.notificationId

    // Solo procesar notificaciones de tipo payment_received
    if (notification.type !== 'payment_received') return

    const userId = notification.userId
    if (!userId) {
      console.error('❌ No userId in payment_received notification:', notificationId)
      return
    }

    console.log('💰 Payment notification detected:', {
      notificationId,
      userId,
      title: notification.title
    })

    try {
      await sendPushNotification(
        userId,
        notification.title || 'Pago Recibido',
        notification.message || 'Has recibido un nuevo pago',
        {
          type: 'payment_received',
          notificationId,
          ...(notification.metadata || {})
        }
      )

      console.log(`✅ Push notification sent for payment_received: ${notificationId}`)
    } catch (error) {
      console.error('❌ Error in onPaymentNotification trigger:', error)
    }
  }
)

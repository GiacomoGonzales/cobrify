import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
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

      // Preparar mensaje
      const title = '💜 Yape Recibido'
      const body = `S/ ${payment.amount?.toFixed(2) || '0.00'} de ${payment.senderName || 'Desconocido'}`

      // Enviar notificación push al dueño
      const result = await sendPushNotification(
        ownerId,
        title,
        body,
        {
          type: 'yape_payment',
          paymentId: paymentId,
          businessId,
          amount: (payment.amount || 0).toString(),
          senderName: payment.senderName || 'Desconocido'
        }
      )

      console.log('📤 Push notification result:', result)
      console.log(`✅ Yape push notification sent for payment: ${paymentId}`)

      // Crear notificación en la colección notifications (campanita)
      await db.collection('notifications').add({
        userId: ownerId,
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

      console.log(`🔔 Bell notification created for Yape payment: ${paymentId}`)

      // Actualizar el documento de pago
      await db
        .collection('businesses')
        .doc(businessId)
        .collection('yapePayments')
        .doc(paymentId)
        .update({
          notifiedUsers: [ownerId],
          notifiedAt: new Date()
        })

    } catch (error) {
      console.error('❌ Error in onYapePayment trigger:', error)
    }
  }
)

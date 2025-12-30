import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Trigger cuando se detecta un nuevo pago de Yape
 * Envía notificación push al dueño del negocio (igual que onNewSale)
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

      console.log('👤 Owner ID:', ownerId)
      console.log('🏢 Business:', businessName)

      // Preparar mensaje
      const title = '💜 Yape Recibido'
      const body = `S/ ${payment.amount?.toFixed(2) || '0.00'} de ${payment.senderName || 'Desconocido'} en ${businessName}`

      // Enviar notificación al dueño (igual que onNewSale)
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
      console.log(`✅ Yape notification sent for payment: ${paymentId}`)

      // Actualizar el documento
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

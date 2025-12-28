import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Trigger cuando se crea una nueva venta
 */
export const onNewSale = onDocumentCreated(
  'businesses/{businessId}/invoices/{invoiceId}',
  async (event) => {
    console.log('🔔 onNewSale trigger activated!')

    const invoice = event.data.data()
    const businessId = event.params.businessId
    const invoiceId = event.params.invoiceId

    console.log('📄 Invoice data:', { invoiceId, businessId, total: invoice.total })

    try {
      const db = getFirestore()

      // Obtener información del negocio para saber quién es el dueño
      const businessDoc = await db
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) {
        console.error('❌ Business not found:', businessId)
        return
      }

      const business = businessDoc.data()
      // Usar ownerId si existe, sino usar businessId como fallback
      // (en la mayoría de casos el businessId es el mismo que el ownerId/userId)
      const ownerId = business.ownerId || businessId

      console.log('👤 Owner ID found:', ownerId)
      console.log('🏢 Business name:', business.name || business.businessName)

      // Enviar notificación push al dueño
      const businessName = business.name || business.businessName || 'tu negocio'
      const paymentMethod = invoice.paymentMethod || 'Efectivo'
      const result = await sendPushNotification(
        ownerId,
        'Nueva Venta Realizada',
        `Venta de S/ ${invoice.total.toFixed(2)} - ${paymentMethod} en ${businessName}`,
        {
          type: 'new_sale',
          invoiceId: invoiceId,
          businessId,
          amount: invoice.total.toString()
        }
      )

      console.log('📤 Push notification result:', result)
      console.log(`✅ Push notification sent for new sale: ${invoiceId}`)
    } catch (error) {
      console.error('❌ Error in onNewSale trigger:', error)
    }
  }
)

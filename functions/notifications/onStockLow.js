import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/**
 * Trigger cuando un producto se queda sin stock o con stock bajo
 */
export const onProductStockChange = onDocumentUpdated(
  'businesses/{businessId}/products/{productId}',
  async (event) => {
    const before = event.data.before.data()
    const after = event.data.after.data()
    const businessId = event.params.businessId
    const productId = event.params.productId

    // Solo notificar si el stock cambió
    if (before.stock === after.stock) return

    try {
      const db = getFirestore()

      // Obtener información del negocio
      const businessDoc = await db
        .collection('businesses')
        .doc(businessId)
        .get()

      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId

      // Sin stock (stock = 0)
      if (after.stock === 0 && before.stock > 0) {
        const title = '⚠️ Producto Sin Stock'
        const message = `El producto "${after.name}" se ha quedado sin stock en ${business.name}`
        const metadata = {
          type: 'out_of_stock',
          productId: productId,
          businessId,
          productName: after.name
        }

        await sendPushNotification(ownerId, title, message, metadata)

        // Crear notificación en la campanita
        await db.collection('notifications').add({
          userId: ownerId,
          type: 'out_of_stock',
          title,
          message,
          metadata,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
        console.log(`🔔 Bell notification created for out_of_stock: ${productId}`)
      }
      // Stock bajo (stock <= 5 y antes era > 5)
      else if (after.stock <= 5 && after.stock > 0 && before.stock > 5) {
        const title = '📦 Stock Bajo'
        const message = `El producto "${after.name}" tiene solo ${after.stock} unidades en ${business.name}`
        const metadata = {
          type: 'low_stock',
          productId: productId,
          businessId,
          productName: after.name,
          currentStock: after.stock.toString()
        }

        await sendPushNotification(ownerId, title, message, metadata)

        // Crear notificación en la campanita
        await db.collection('notifications').add({
          userId: ownerId,
          type: 'low_stock',
          title,
          message,
          metadata,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
        console.log(`🔔 Bell notification created for low_stock: ${productId}`)
      }

      console.log(`Push notification sent for stock change: ${productId}`)
    } catch (error) {
      console.error('Error in onProductStockChange trigger:', error)
    }
  }
)

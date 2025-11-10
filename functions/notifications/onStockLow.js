import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { sendPushNotification } from './sendPushNotification.js'
import { getFirestore } from 'firebase-admin/firestore'

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
        await sendPushNotification(
          ownerId,
          '⚠️ Producto Sin Stock',
          `El producto "${after.name}" se ha quedado sin stock en ${business.name}`,
          {
            type: 'out_of_stock',
            productId: productId,
            businessId,
            productName: after.name
          }
        )
      }
      // Stock bajo (stock <= 5 y antes era > 5)
      else if (after.stock <= 5 && after.stock > 0 && before.stock > 5) {
        await sendPushNotification(
          ownerId,
          '📦 Stock Bajo',
          `El producto "${after.name}" tiene solo ${after.stock} unidades en ${business.name}`,
          {
            type: 'low_stock',
            productId: productId,
            businessId,
            productName: after.name,
            currentStock: after.stock.toString()
          }
        )
      }

      console.log(`Push notification sent for stock change: ${productId}`)
    } catch (error) {
      console.error('Error in onProductStockChange trigger:', error)
    }
  }
)

import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { sendPushNotification } from './sendPushNotification.js'

/**
 * Trigger cuando se crea o actualiza una orden en un negocio.
 * Envía push notification cuando:
 * - Se crea una orden CON ítems (ej: menú digital, orden rápida)
 * - Se agregan ítems nuevos a una orden existente (ej: mozo agrega productos a mesa)
 *
 * Usa sendPushNotification (mismo helper que onNewSale/onStockLow) porque
 * está probado en producción y entrega correctamente con la pantalla bloqueada.
 */
export const onNewOrder = onDocumentWritten(
  'businesses/{businessId}/orders/{orderId}',
  async (event) => {
    const before = event.data.before?.data()
    const after = event.data.after?.data()

    if (!after) return
    if (after.status === 'cancelled' || after.overallStatus === 'cancelled') return

    const beforeItems = (before?.items || []).length
    const afterItems = (after.items || []).length

    // Solo notificar si hay ítems nuevos (creación con ítems o ítems agregados)
    if (afterItems === 0 || afterItems <= beforeItems) return

    const newItemCount = afterItems - beforeItems
    const isNewOrder = !before

    try {
      const db = getFirestore()
      const businessId = event.params.businessId

      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId

      // Verificar preferencias
      const prefs = business.notificationPreferences || {}
      const notifType = isNewOrder ? 'new_order' : 'items_added'
      if (prefs[notifType] === false) {
        console.log(`🔕 ${notifType} notification disabled by user preferences`)
        return
      }

      // Construir mensaje
      const order = after
      const orderNumber = order.orderNumber || ''
      const source = order.source || ''
      const orderType = order.orderType || ''
      const mesa = order.tableNumber ? ` Mesa ${order.tableNumber}` : ''
      const isRestaurant = business.businessMode === 'restaurant'

      // Path al que redirigir cuando el usuario toca la notificación
      // - Restaurant → pantalla de órdenes
      // - Resto (retail, pharmacy, hotel, etc) → pedidos online
      const redirectPath = isRestaurant ? '/app/ordenes' : '/app/pedidos-online'

      let title = ''
      let body = ''

      if (isNewOrder) {
        if (source === 'menu_digital') {
          // Texto según el modo del negocio
          title = isRestaurant
            ? '📱 Nuevo Pedido - Menú Digital'
            : '🛒 Nuevo Pedido - Catálogo'
          if (orderType === 'delivery') {
            body = `Pedido ${orderNumber} delivery - ${afterItems} item${afterItems > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
          } else if (orderType === 'takeaway') {
            body = `Pedido ${orderNumber} para llevar - ${afterItems} item${afterItems > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
          } else {
            body = `Pedido ${orderNumber}${mesa} - ${afterItems} item${afterItems > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
          }
        } else {
          title = '🍽️ Nuevo Pedido'
          const waiter = order.waiterName ? ` (${order.waiterName})` : ''
          body = `Pedido ${orderNumber}${mesa}${waiter} - ${afterItems} item${afterItems > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
        }
      } else {
        title = '➕ Items Agregados'
        const waiter = order.waiterName ? ` (${order.waiterName})` : ''
        body = `${newItemCount} item${newItemCount > 1 ? 's' : ''} nuevo${newItemCount > 1 ? 's' : ''}${mesa}${waiter} - Total: S/ ${(order.total || 0).toFixed(2)}`
      }

      const data = {
        type: notifType,
        orderId: event.params.orderId,
        businessId,
        orderNumber,
        source,
        redirectPath,
      }

      // Enviar al owner (mismo flujo que onNewSale → entrega probada en bloqueado)
      const ownerResult = await sendPushNotification(ownerId, title, body, data)
      console.log(`📤 Push to owner ${ownerId}:`, ownerResult)

      // Enviar también a sub-usuarios del negocio
      const subUsersSnapshot = await db
        .collection('users')
        .where('ownerId', '==', ownerId)
        .get()

      for (const userDoc of subUsersSnapshot.docs) {
        const subResult = await sendPushNotification(userDoc.id, title, body, data)
        console.log(`📤 Push to sub-user ${userDoc.id}:`, subResult)
      }
    } catch (error) {
      console.error('❌ Error in onNewOrder trigger:', error)
    }
  }
)

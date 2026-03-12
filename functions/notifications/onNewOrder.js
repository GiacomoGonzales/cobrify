import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import admin from 'firebase-admin'

/**
 * Trigger cuando se crea una nueva orden en un restaurante.
 * Envía push notification a todos los usuarios del negocio (dueño + sub-usuarios).
 */
export const onNewOrder = onDocumentCreated(
  'businesses/{businessId}/orders/{orderId}',
  async (event) => {
    const order = event.data.data()
    const businessId = event.params.businessId

    // Solo notificar órdenes activas/pendientes
    if (order.status === 'cancelled' || order.overallStatus === 'cancelled') return

    try {
      const db = getFirestore()

      // Obtener info del negocio
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId
      const businessName = business.name || business.businessName || 'tu negocio'

      // Construir mensaje según tipo de orden
      const orderNumber = order.orderNumber || ''
      const itemCount = (order.items || []).length
      const source = order.source || ''
      const orderType = order.orderType || ''

      let title = 'Nuevo Pedido'
      let body = ''

      if (source === 'menu_digital') {
        title = '📱 Nuevo Pedido - Menú Digital'
        if (orderType === 'delivery') {
          body = `Pedido ${orderNumber} delivery - ${itemCount} item${itemCount > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
        } else if (orderType === 'takeaway') {
          body = `Pedido ${orderNumber} para llevar - ${itemCount} item${itemCount > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
        } else {
          const mesa = order.tableNumber ? ` Mesa ${order.tableNumber}` : ''
          body = `Pedido ${orderNumber}${mesa} - ${itemCount} item${itemCount > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
        }
      } else {
        const mesa = order.tableNumber ? ` Mesa ${order.tableNumber}` : ''
        const waiter = order.waiterName ? ` (${order.waiterName})` : ''
        body = `Pedido ${orderNumber}${mesa}${waiter} - ${itemCount} item${itemCount > 1 ? 's' : ''} - S/ ${(order.total || 0).toFixed(2)}`
      }

      const data = {
        type: 'new_order',
        orderId: event.params.orderId,
        businessId,
        orderNumber,
        source,
      }

      // Recopilar tokens FCM de TODOS los usuarios del negocio
      const allTokens = []

      // 1. Tokens del dueño
      const ownerTokens = await db.collection('users').doc(ownerId).collection('fcmTokens').get()
      ownerTokens.docs.forEach(doc => {
        const token = doc.data().token
        if (token) allTokens.push(token)
      })

      // 2. Tokens de sub-usuarios (users donde ownerId == dueño del negocio)
      const subUsersSnapshot = await db.collection('users').where('ownerId', '==', ownerId).get()
      for (const userDoc of subUsersSnapshot.docs) {
        const subTokens = await db.collection('users').doc(userDoc.id).collection('fcmTokens').get()
        subTokens.docs.forEach(doc => {
          const token = doc.data().token
          if (token) allTokens.push(token)
        })
      }

      if (allTokens.length === 0) {
        console.log(`No FCM tokens found for business ${businessId}`)
        return
      }

      // Eliminar duplicados
      const uniqueTokens = [...new Set(allTokens)]

      console.log(`📤 Sending order notification to ${uniqueTokens.length} devices for business ${businessName}`)

      // Enviar push a todos los tokens
      const message = {
        notification: { title, body },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'orders'
          }
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: {
            aps: {
              alert: { title, body },
              badge: 1,
              sound: 'default'
            }
          }
        },
        tokens: uniqueTokens
      }

      const response = await admin.messaging().sendEachForMulticast(message)
      console.log(`✅ Order push sent: ${response.successCount}/${uniqueTokens.length} success`)

      // Limpiar tokens inválidos
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success &&
            (resp.error?.code === 'messaging/invalid-registration-token' ||
             resp.error?.code === 'messaging/registration-token-not-registered')) {
            // Buscar y eliminar token inválido de cualquier usuario
            const invalidToken = uniqueTokens[idx]
            console.log('🗑️ Removing invalid token:', invalidToken.substring(0, 20) + '...')
            // Eliminar del dueño
            db.collection('users').doc(ownerId).collection('fcmTokens').doc(invalidToken).delete().catch(() => {})
            // Eliminar de sub-usuarios
            subUsersSnapshot.docs.forEach(userDoc => {
              db.collection('users').doc(userDoc.id).collection('fcmTokens').doc(invalidToken).delete().catch(() => {})
            })
          }
        })
      }
    } catch (error) {
      console.error('❌ Error in onNewOrder trigger:', error)
    }
  }
)

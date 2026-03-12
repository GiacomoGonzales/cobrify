import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import admin from 'firebase-admin'

/**
 * Trigger cuando se crea o actualiza una orden en un restaurante.
 * Envía push notification cuando:
 * - Se crea una orden CON ítems (ej: menú digital, orden rápida)
 * - Se agregan ítems nuevos a una orden existente (ej: mozo agrega productos a mesa)
 */
export const onNewOrder = onDocumentWritten(
  'businesses/{businessId}/orders/{orderId}',
  async (event) => {
    const before = event.data.before?.data()
    const after = event.data.after?.data()

    // Si se eliminó el documento, ignorar
    if (!after) return

    // Solo notificar órdenes activas/pendientes
    if (after.status === 'cancelled' || after.overallStatus === 'cancelled') return

    const beforeItems = (before?.items || []).length
    const afterItems = (after.items || []).length

    // Solo notificar si se agregaron ítems nuevos
    // Caso 1: Orden nueva con ítems (beforeItems === 0 porque no existía, afterItems > 0)
    // Caso 2: Orden existente a la que se le agregan ítems (afterItems > beforeItems)
    if (afterItems === 0 || afterItems <= beforeItems) return

    const newItemCount = afterItems - beforeItems
    const isNewOrder = !before // Documento recién creado

    try {
      const db = getFirestore()
      const businessId = event.params.businessId

      // Obtener info del negocio
      const businessDoc = await db.collection('businesses').doc(businessId).get()
      if (!businessDoc.exists) return

      const business = businessDoc.data()
      const ownerId = business.ownerId || businessId

      // Verificar preferencias de notificación
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

      let title = ''
      let body = ''

      if (isNewOrder) {
        // Orden nueva con ítems (menú digital, orden rápida)
        if (source === 'menu_digital') {
          title = '📱 Nuevo Pedido - Menú Digital'
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
        // Se agregaron ítems a orden existente
        title = '➕ Items Agregados'
        const waiter = order.waiterName ? ` (${order.waiterName})` : ''
        body = `${newItemCount} item${newItemCount > 1 ? 's' : ''} nuevo${newItemCount > 1 ? 's' : ''}${mesa}${waiter} - Total: S/ ${(order.total || 0).toFixed(2)}`
      }

      const data = {
        type: isNewOrder ? 'new_order' : 'items_added',
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

      console.log(`📤 ${title}: ${body} → ${uniqueTokens.length} devices`)

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
            const invalidToken = uniqueTokens[idx]
            console.log('🗑️ Removing invalid token:', invalidToken.substring(0, 20) + '...')
            db.collection('users').doc(ownerId).collection('fcmTokens').doc(invalidToken).delete().catch(() => {})
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

// firebase-admin v14 ELIMINO la API con namespace: `admin.firestore()` y
// `admin.messaging()` ya no existen en el export por defecto. Este modulo era
// el ultimo que la usaba, asi que al reconstruirse contra v14 empezo a tirar
// "admin.firestore is not a function" y se cayo TODO el push del sistema —
// ventas, ordenes, Yape, stock y vencimientos — sin una sola alerta, porque
// cada llamador atrapa el error y sigue.
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

/**
 * Enviar notificación push a un usuario
 *
 * @param {string} userId - UID del destinatario
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo de la notificación
 * @param {object} data - Data payload adicional
 * @param {object} options - Opciones extra
 * @param {boolean} options.allowSecondaryUsers - Si es true, permite enviar a
 *   sub-usuarios (con campo `ownerId`). Por defecto false: los sub-usuarios
 *   NO reciben push de nuevas ventas / pedidos / stock. Casos que SÍ deben
 *   llegarles (ej: pago Yape) deben pasar { allowSecondaryUsers: true }.
 */
export async function sendPushNotification(userId, title, body, data = {}, options = {}) {
  try {
    const { allowSecondaryUsers = false, preferPlatform = null } = options

    console.log('📨 sendPushNotification called')
    console.log('   userId:', userId)
    console.log('   title:', title)
    console.log('   body:', body)
    console.log('   allowSecondaryUsers:', allowSecondaryUsers)

    // Check defensivo: sub-usuarios bloqueados por defecto (decisión de
    // producto). Algunos triggers específicos (Yape) deben llegar a todos los
    // empleados — esos pasan { allowSecondaryUsers: true } para saltarse el
    // check.
    if (!allowSecondaryUsers) {
      const userSnap = await getFirestore().collection('users').doc(userId).get()
      if (userSnap.exists && userSnap.data()?.ownerId) {
        console.log(`🔕 Skipping push: ${userId} es usuario secundario (ownerId=${userSnap.data().ownerId})`)
        return { success: false, skipped: 'secondary_user' }
      }
    }

    // Obtener todos los tokens FCM del usuario
    const tokensSnapshot = await getFirestore()
      .collection('users')
      .doc(userId)
      .collection('fcmTokens')
      .get()

    console.log('🔍 Tokens found:', tokensSnapshot.size)

    if (tokensSnapshot.empty) {
      console.log(`❌ No FCM tokens found for user ${userId}`)
      console.log(`   Check path: users/${userId}/fcmTokens`)
      return { success: false, error: 'No tokens' }
    }

    // preferPlatform: si el usuario tiene tokens de esa plataforma, el aviso
    // va SOLO ahí (ej: los de WhatsApp solo a la app Cobrify Chat). Si no
    // tiene ninguno, se cae al comportamiento de siempre: a todos.
    let tokenDocs = tokensSnapshot.docs
    if (preferPlatform) {
      const preferidos = tokenDocs.filter(doc => doc.data().platform === preferPlatform)
      if (preferidos.length > 0) {
        console.log(`🎯 preferPlatform=${preferPlatform}: ${preferidos.length}/${tokenDocs.length} tokens`)
        tokenDocs = preferidos
      }
    }

    const tokens = tokenDocs.map(doc => doc.data().token)
    console.log('📱 Tokens to send:', tokens)

    let successCount = 0
    const failedTokens = []

    // Enviar notificación usando sendEachForMulticast (API V1 simplificada)
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: {
              title,
              body
            },
            badge: 1,
            sound: 'default'
          }
        }
      },
      tokens: tokens
    }

    console.log('📤 Sending notification to', tokens.length, 'tokens')

    try {
      const response = await getMessaging().sendEachForMulticast(message)
      console.log('📊 Success count:', response.successCount)
      console.log('📊 Failure count:', response.failureCount)

      successCount = response.successCount

      // Procesar tokens fallidos
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error('❌ Failed for token:', tokens[idx].substring(0, 20) + '...', resp.error?.code)
            // Si el token es inválido permanentemente, agregarlo a la lista para eliminar
            // NO eliminar por invalid-argument porque puede ser error temporal
            if (resp.error?.code === 'messaging/invalid-registration-token' ||
                resp.error?.code === 'messaging/registration-token-not-registered') {
              failedTokens.push(tokens[idx])
            }
          }
        })
      }
    } catch (error) {
      console.error('❌ Failed to send notifications:', error.code, error.message)
      return { success: false, error: error.message }
    }

    console.log(`✅ Successfully sent ${successCount}/${tokens.length} notifications`)

    // Limpiar tokens inválidos
    if (failedTokens.length > 0) {
      console.log('🗑️ Cleaning up invalid tokens:', failedTokens.length)
      for (const token of failedTokens) {
        await getFirestore()
          .collection('users')
          .doc(userId)
          .collection('fcmTokens')
          .doc(token)
          .delete()
      }
    }

    return { success: successCount > 0, successCount }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: error.message }
  }
}

import admin from 'firebase-admin'

/**
 * Enviar notificación push a un usuario
 */
export async function sendPushNotification(userId, title, body, data = {}) {
  try {
    console.log('📨 sendPushNotification called')
    console.log('   userId:', userId)
    console.log('   title:', title)
    console.log('   body:', body)

    // Obtener todos los tokens FCM del usuario
    const tokensSnapshot = await admin.firestore()
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

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token)
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
      const response = await admin.messaging().sendEachForMulticast(message)
      console.log('📊 Success count:', response.successCount)
      console.log('📊 Failure count:', response.failureCount)

      successCount = response.successCount

      // Procesar tokens fallidos
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error('❌ Failed for token:', tokens[idx].substring(0, 20) + '...', resp.error?.code)
            // Si el token es inválido, agregarlo a la lista para eliminar
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
        await admin.firestore()
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

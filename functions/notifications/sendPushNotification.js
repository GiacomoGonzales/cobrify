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

    // Enviar notificación a cada token individualmente usando API V1
    for (const token of tokens) {
      try {
        const message = {
          token: token,
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
          }
        }

        console.log('📤 Sending to token:', token.substring(0, 20) + '...')
        await admin.messaging().send(message)
        console.log('✅ Sent successfully to token')
        successCount++
      } catch (error) {
        console.error('❌ Failed to send to token:', error.code, error.message)
        // Si el token es inválido, agregarlo a la lista para eliminar
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          failedTokens.push(token)
        }
      }
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

import { db, functions } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  collectionGroup
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

/**
 * Crea una campaña de notificaciones push en estado draft
 */
export async function createCampaign(data, adminUid, adminEmail) {
  try {
    const campaignData = {
      title: data.title,
      message: data.message,
      targetMode: data.targetMode,
      filters: data.filters || {},
      manualUserIds: data.manualUserIds || [],
      status: 'draft',
      totalRecipients: 0,
      totalTokens: 0,
      successCount: 0,
      failureCount: 0,
      createdBy: adminUid,
      createdByEmail: adminEmail,
      createdAt: serverTimestamp()
    }

    const docRef = await addDoc(collection(db, 'pushCampaigns'), campaignData)
    return { success: true, data: { id: docRef.id } }
  } catch (error) {
    console.error('Error creating campaign:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Envía una campaña llamando a la Cloud Function
 */
export async function sendCampaign(campaignId) {
  try {
    const sendFn = httpsCallable(functions, 'sendBulkPushNotifications')
    const result = await sendFn({ campaignId })
    return { success: true, data: result.data }
  } catch (error) {
    console.error('Error sending campaign:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene historial de campañas
 */
export async function getCampaigns(maxResults = 50) {
  try {
    const q = query(
      collection(db, 'pushCampaigns'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(maxResults)
    )
    const snapshot = await getDocs(q)
    const campaigns = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      sentAt: doc.data().sentAt?.toDate?.() || null,
      completedAt: doc.data().completedAt?.toDate?.() || null
    }))
    return { success: true, data: campaigns }
  } catch (error) {
    console.error('Error getting campaigns:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene usuarios que tienen tokens FCM registrados, con info de negocio
 */
export async function getUsersWithTokens() {
  try {
    // Obtener todos los tokens FCM agrupados por usuario
    const tokensSnap = await getDocs(collectionGroup(db, 'fcmTokens'))
    const userTokenCounts = {}

    for (const tokenDoc of tokensSnap.docs) {
      // Path: users/{userId}/fcmTokens/{tokenId}
      const userId = tokenDoc.ref.parent.parent.id
      userTokenCounts[userId] = (userTokenCounts[userId] || 0) + 1
    }

    const userIds = Object.keys(userTokenCounts)
    if (userIds.length === 0) {
      return { success: true, data: [] }
    }

    // Obtener info de cada usuario
    const users = []
    for (const uid of userIds) {
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (userSnap.exists()) {
        const data = userSnap.data()
        users.push({
          id: uid,
          email: data.email || '',
          businessName: data.razonSocial || data.businessName || '',
          plan: data.subscription?.plan || data.plan || 'free',
          subscriptionStatus: data.subscription?.status || data.subscriptionStatus || 'unknown',
          businessMode: data.businessMode || 'retail',
          tokenCount: userTokenCounts[uid]
        })
      }
    }

    return { success: true, data: users }
  } catch (error) {
    console.error('Error getting users with tokens:', error)
    return { success: false, error: error.message }
  }
}

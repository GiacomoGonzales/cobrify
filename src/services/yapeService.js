import { db } from '@/lib/firebase'
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  setDoc
} from 'firebase/firestore'

/**
 * Guarda un pago de Yape detectado en Firestore
 * @param {string} businessId - ID del negocio
 * @param {object} paymentData - Datos del pago
 */
export const saveYapePayment = async (businessId, paymentData) => {
  try {
    const paymentsRef = collection(db, 'businesses', businessId, 'yapePayments')

    const payment = {
      amount: paymentData.amount,
      senderName: paymentData.senderName || 'Desconocido',
      originalText: paymentData.originalText || '',
      originalTitle: paymentData.originalTitle || '',
      timestamp: paymentData.timestamp || Date.now(),
      createdAt: serverTimestamp(),
      status: 'pending', // pending, matched, ignored
      matchedInvoiceId: null,
      notifiedUsers: [],
      detectedBy: paymentData.detectedBy || null // userId que detectó el pago
    }

    const docRef = await addDoc(paymentsRef, payment)

    return { success: true, id: docRef.id, payment }
  } catch (error) {
    console.error('Error al guardar pago Yape:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene los pagos Yape recientes de un negocio
 * @param {string} businessId - ID del negocio
 * @param {number} limitCount - Cantidad máxima de resultados
 */
export const getYapePayments = async (businessId, limitCount = 50) => {
  try {
    const paymentsRef = collection(db, 'businesses', businessId, 'yapePayments')
    const q = query(
      paymentsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    )

    const snapshot = await getDocs(q)
    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return { success: true, data: payments }
  } catch (error) {
    console.error('Error al obtener pagos Yape:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene los pagos Yape pendientes (no asociados a una venta)
 * @param {string} businessId - ID del negocio
 */
export const getPendingYapePayments = async (businessId) => {
  try {
    const paymentsRef = collection(db, 'businesses', businessId, 'yapePayments')
    const q = query(
      paymentsRef,
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(20)
    )

    const snapshot = await getDocs(q)
    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return { success: true, data: payments }
  } catch (error) {
    console.error('Error al obtener pagos Yape pendientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Asocia un pago Yape a una factura/venta
 * @param {string} businessId - ID del negocio
 * @param {string} paymentId - ID del pago Yape
 * @param {string} invoiceId - ID de la factura
 */
export const matchYapePayment = async (businessId, paymentId, invoiceId) => {
  try {
    const paymentRef = doc(db, 'businesses', businessId, 'yapePayments', paymentId)

    await updateDoc(paymentRef, {
      status: 'matched',
      matchedInvoiceId: invoiceId,
      matchedAt: serverTimestamp()
    })

    return { success: true }
  } catch (error) {
    console.error('Error al asociar pago Yape:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guarda la configuración de notificaciones Yape
 * @param {string} businessId - ID del negocio
 * @param {object} config - Configuración
 */
export const saveYapeConfig = async (businessId, config) => {
  try {
    const configRef = doc(db, 'businesses', businessId, 'settings', 'yapeNotifications')

    await setDoc(configRef, {
      enabled: config.enabled ?? true,
      notifyUsers: config.notifyUsers || [], // Array de userIds a notificar
      notifyAllUsers: config.notifyAllUsers ?? false,
      autoStartListening: config.autoStartListening ?? true,
      updatedAt: serverTimestamp()
    }, { merge: true })

    return { success: true }
  } catch (error) {
    console.error('Error al guardar config Yape:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtiene la configuración de notificaciones Yape
 * @param {string} businessId - ID del negocio
 */
export const getYapeConfig = async (businessId) => {
  try {
    const configRef = doc(db, 'businesses', businessId, 'settings', 'yapeNotifications')
    const snapshot = await getDoc(configRef)

    if (snapshot.exists()) {
      return { success: true, data: snapshot.data() }
    }

    // Configuración por defecto
    return {
      success: true,
      data: {
        enabled: false,
        notifyUsers: [],
        notifyAllUsers: true,
        autoStartListening: true
      }
    }
  } catch (error) {
    console.error('Error al obtener config Yape:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Parsea una notificación de Yape para extraer monto y remitente
 * @param {object} notification - Notificación recibida
 */
export const parseYapeNotification = (notification) => {
  const text = notification.text || ''
  const title = notification.title || ''

  // Patrones de Yape:
  // "Recibiste S/ 50.00 de Juan Pérez"
  // "Te yaperon S/ 100.00"
  // "Yape recibido S/50.00 de JUAN PEREZ"

  // Buscar monto
  const amountMatch = text.match(/S\/\s*(\d+(?:[.,]\d{2})?)/i) ||
                      title.match(/S\/\s*(\d+(?:[.,]\d{2})?)/i)

  if (!amountMatch) return null

  const amount = parseFloat(amountMatch[1].replace(',', '.'))

  // Buscar remitente
  const senderMatch = text.match(/de\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s*$|\s*\.|\s*,)/i)
  const senderName = senderMatch ? senderMatch[1].trim() : 'Desconocido'

  return {
    amount,
    senderName,
    currency: 'PEN',
    originalText: text,
    originalTitle: title,
    timestamp: notification.timestamp
  }
}

import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio básico para gestión de mozos
 * (implementación completa pendiente)
 */

/**
 * Obtener todos los mozos de un negocio
 */
export const getWaiters = async (businessId) => {
  try {
    const waitersRef = collection(db, 'businesses', businessId, 'waiters')
    const q = query(waitersRef, orderBy('name', 'asc'))
    const snapshot = await getDocs(q)

    const waiters = []
    snapshot.forEach((doc) => {
      waiters.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: waiters }
  } catch (error) {
    console.error('Error al obtener mozos:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getWaiters,
}

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Servicio para gestión de mozos/meseros de restaurante
 */

// =====================================================
// WAITERS (Mozos)
// =====================================================

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

/**
 * Obtener un mozo específico
 */
export const getWaiter = async (businessId, waiterId) => {
  try {
    const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)
    const waiterSnap = await getDoc(waiterRef)

    if (!waiterSnap.exists()) {
      return { success: false, error: 'Mozo no encontrado' }
    }

    return { success: true, data: { id: waiterSnap.id, ...waiterSnap.data() } }
  } catch (error) {
    console.error('Error al obtener mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear un nuevo mozo
 */
export const createWaiter = async (businessId, waiterData) => {
  try {
    const waitersRef = collection(db, 'businesses', businessId, 'waiters')

    const newWaiter = {
      name: waiterData.name,
      code: waiterData.code,
      phone: waiterData.phone || '',
      email: waiterData.email || '',
      shift: waiterData.shift || 'Mañana', // Mañana, Tarde, Noche
      startTime: waiterData.startTime || '08:00',
      status: 'active', // active, inactive
      isActive: true,
      // Métricas
      activeTables: 0,
      todaySales: 0,
      todayOrders: 0,
      totalSales: 0,
      totalOrders: 0,
      averageTicket: 0,
      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(waitersRef, newWaiter)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un mozo
 */
export const updateWaiter = async (businessId, waiterId, waiterData) => {
  try {
    const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)

    await updateDoc(waiterRef, {
      ...waiterData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un mozo
 */
export const deleteWaiter = async (businessId, waiterId) => {
  try {
    const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)
    await deleteDoc(waiterRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cambiar estado de un mozo (activar/desactivar)
 */
export const toggleWaiterStatus = async (businessId, waiterId, isActive) => {
  try {
    const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)

    await updateDoc(waiterRef, {
      status: isActive ? 'active' : 'inactive',
      isActive: isActive,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al cambiar estado del mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar métricas de un mozo
 */
export const updateWaiterMetrics = async (businessId, waiterId, metrics) => {
  try {
    const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)

    const updates = {
      updatedAt: serverTimestamp(),
    }

    if (metrics.activeTables !== undefined) updates.activeTables = metrics.activeTables
    if (metrics.todaySales !== undefined) updates.todaySales = metrics.todaySales
    if (metrics.todayOrders !== undefined) updates.todayOrders = metrics.todayOrders
    if (metrics.totalSales !== undefined) updates.totalSales = metrics.totalSales
    if (metrics.totalOrders !== undefined) updates.totalOrders = metrics.totalOrders

    // Calcular ticket promedio
    if (updates.totalOrders > 0 && updates.totalSales !== undefined) {
      updates.averageTicket = updates.totalSales / updates.totalOrders
    }

    await updateDoc(waiterRef, updates)

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar métricas del mozo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mozos activos
 */
export const getActiveWaiters = async (businessId) => {
  try {
    const waitersRef = collection(db, 'businesses', businessId, 'waiters')
    const q = query(
      waitersRef,
      where('status', '==', 'active'),
      orderBy('name', 'asc')
    )
    const snapshot = await getDocs(q)

    const waiters = []
    snapshot.forEach((doc) => {
      waiters.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: waiters }
  } catch (error) {
    console.error('Error al obtener mozos activos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mozos por turno
 */
export const getWaitersByShift = async (businessId, shift) => {
  try {
    const waitersRef = collection(db, 'businesses', businessId, 'waiters')
    const q = query(
      waitersRef,
      where('shift', '==', shift),
      orderBy('name', 'asc')
    )
    const snapshot = await getDocs(q)

    const waiters = []
    snapshot.forEach((doc) => {
      waiters.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: waiters }
  } catch (error) {
    console.error('Error al obtener mozos por turno:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de mozos
 */
export const getWaitersStats = async (businessId) => {
  try {
    const result = await getWaiters(businessId)
    if (!result.success) {
      return result
    }

    const waiters = result.data
    const activeWaiters = waiters.filter(w => w.status === 'active')

    const stats = {
      total: waiters.length,
      active: activeWaiters.length,
      inactive: waiters.filter(w => w.status === 'inactive').length,
      totalActiveTables: activeWaiters.reduce((sum, w) => sum + (w.activeTables || 0), 0),
      totalSalesToday: activeWaiters.reduce((sum, w) => sum + (w.todaySales || 0), 0),
      totalOrdersToday: activeWaiters.reduce((sum, w) => sum + (w.todayOrders || 0), 0),
      averageTicket: 0,
    }

    // Calcular ticket promedio
    if (stats.totalOrdersToday > 0) {
      stats.averageTicket = stats.totalSalesToday / stats.totalOrdersToday
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas de mozos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Resetear métricas diarias (para ejecutar cada día)
 */
export const resetDailyMetrics = async (businessId) => {
  try {
    const waitersRef = collection(db, 'businesses', businessId, 'waiters')
    const snapshot = await getDocs(waitersRef)

    const updates = []
    snapshot.forEach((docSnap) => {
      const waiterRef = doc(db, 'businesses', businessId, 'waiters', docSnap.id)
      updates.push(
        updateDoc(waiterRef, {
          todaySales: 0,
          todayOrders: 0,
          updatedAt: serverTimestamp(),
        })
      )
    })

    await Promise.all(updates)

    return { success: true }
  } catch (error) {
    console.error('Error al resetear métricas diarias:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getWaiters,
  getWaiter,
  createWaiter,
  updateWaiter,
  deleteWaiter,
  toggleWaiterStatus,
  updateWaiterMetrics,
  getActiveWaiters,
  getWaitersByShift,
  getWaitersStats,
  resetDailyMetrics,
}
